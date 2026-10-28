import type { UiWindowPlacement } from '../preferences/ui-preferences.js';

export type PopupWindowCloseReason = 'native' | 'programmatic' | 'host-shutdown';

export interface PopupWindowHostOptions {
  readonly title: string;
  readonly windowName: string;
  readonly layoutCss?: string;
  readonly defaultWidth?: number;
  readonly defaultHeight?: number;
  readonly minimumWidth?: number;
  readonly minimumHeight?: number;
  readonly loadPlacement?: () => UiWindowPlacement | null;
  readonly savePlacement?: (placement: UiWindowPlacement) => void;
  readonly closed?: (reason: PopupWindowCloseReason, placement: UiWindowPlacement | null) => void;
}

/**
 * Owns one independent same-origin browser popup. Unlike DetachedWindowHost,
 * it never moves a live DOM surface between documents.
 */
export class PopupWindowHost {
  private popup: Window | null = null;
  private mainWindow: Window | null = null;
  private styleDocument: Document | null = null;
  private placementTimer: number | null = null;
  private minimumResizeTimer: number | null = null;
  private styleObserver: MutationObserver | null = null;
  private documentElementObserver: MutationObserver | null = null;
  private closing = false;
  private closed = false;
  private lastPersisted: UiWindowPlacement | null = null;

  constructor(private readonly options: PopupWindowHostOptions) {}

  get window(): Window | null {
    return this.popup && !this.popup.closed ? this.popup : null;
  }

  get isOpen(): boolean {
    return this.window !== null;
  }

  get placement(): UiWindowPlacement | null {
    return this.capturePlacement(false) ?? this.lastPersisted;
  }

  open(
    openerDocument: Document = document,
    lifecycleWindow: Window | null = openerDocument.defaultView,
    styleDocument: Document = lifecycleWindow?.document ?? openerDocument,
  ): Window | null {
    if (this.window) {
      this.window.focus();
      return this.window;
    }

    if (this.closing || this.closed) return null;

    const openerWindow = openerDocument.defaultView;
    if (!openerWindow || !lifecycleWindow) return null;

    const savedPlacement = this.options.loadPlacement?.() ?? null;
    this.lastPersisted = savedPlacement;
    const placement = this.normalizedPlacement(savedPlacement, openerWindow);
    const features = [
      'popup=yes',
      `width=${placement.width}`,
      `height=${placement.height}`,
      `left=${placement.left}`,
      `top=${placement.top}`,
      'resizable=yes',
      'scrollbars=yes',
    ].join(',');

    let popup: Window | null = null;
    try {
      popup = openerWindow.open('about:blank', this.options.windowName, features);
    } catch {
      return null;
    }

    if (!popup) return null;

    this.mainWindow = lifecycleWindow;
    this.styleDocument = styleDocument;
    this.popup = popup;

    try {
      this.initialisePopup(popup, styleDocument);
      this.installLifecycle(lifecycleWindow, popup, styleDocument);
      this.restorePlacement(placement, popup);
      popup.focus();
      return popup;
    } catch {
      this.removeLifecycle();
      this.popup = null;
      this.mainWindow = null;
      this.styleDocument = null;
      try {
        popup.close();
      } catch {
        // Best-effort cleanup after failed popup initialisation.
      }
      return null;
    }
  }

  close(): void {
    this.finish('programmatic', true);
  }

  destroy(): void {
    this.close();
  }

  private installLifecycle(mainWindow: Window, popup: Window, sourceDocument: Document): void {
    popup.addEventListener('beforeunload', this.popupClosing);
    popup.addEventListener('resize', this.popupResized);
    mainWindow.addEventListener('pagehide', this.hostPageHide, true);
    mainWindow.addEventListener('beforeunload', this.hostBeforeUnload, true);

    this.placementTimer = mainWindow.setInterval(() => {
      if (!this.popup || this.popup.closed) {
        this.finish('native', false);
        return;
      }
      this.capturePlacement();
    }, 500);

    this.styleObserver = new MutationObserver((records) => {
      if (!this.popup || this.popup.closed) return;
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (!(node instanceof Element)) continue;
          if (!node.matches('link[rel="stylesheet"], style')) continue;
          this.popup.document.head.appendChild(node.cloneNode(true));
        }
      }
    });
    this.styleObserver.observe(sourceDocument.head, { childList: true });

    this.documentElementObserver = new MutationObserver((records) => {
      if (!this.popup || this.popup.closed) return;
      for (const record of records) {
        if (
          record.type !== 'attributes' ||
          !record.attributeName ||
          record.attributeName === 'style'
        )
          continue;
        const value = sourceDocument.documentElement.getAttribute(record.attributeName);
        if (value === null)
          this.popup.document.documentElement.removeAttribute(record.attributeName);
        else this.popup.document.documentElement.setAttribute(record.attributeName, value);
      }
    });
    this.documentElementObserver.observe(sourceDocument.documentElement, { attributes: true });
  }

  private removeLifecycle(): void {
    if (this.placementTimer !== null && this.mainWindow) {
      this.mainWindow.clearInterval(this.placementTimer);
    }
    this.placementTimer = null;

    if (this.minimumResizeTimer !== null && this.mainWindow) {
      this.mainWindow.clearTimeout(this.minimumResizeTimer);
    }
    this.minimumResizeTimer = null;

    this.styleObserver?.disconnect();
    this.styleObserver = null;
    this.documentElementObserver?.disconnect();
    this.documentElementObserver = null;

    this.mainWindow?.removeEventListener('pagehide', this.hostPageHide, true);
    this.mainWindow?.removeEventListener('beforeunload', this.hostBeforeUnload, true);
    this.popup?.removeEventListener('beforeunload', this.popupClosing);
    this.popup?.removeEventListener('resize', this.popupResized);
  }

  private readonly popupClosing = (): void => {
    if (!this.closing) this.finish('native', false);
  };

  private readonly popupResized = (): void => {
    if (this.options.minimumWidth === undefined && this.options.minimumHeight === undefined) return;
    if (!this.mainWindow || !this.popup || this.popup.closed) return;

    if (this.minimumResizeTimer !== null) {
      this.mainWindow.clearTimeout(this.minimumResizeTimer);
    }

    this.minimumResizeTimer = this.mainWindow.setTimeout(() => {
      this.minimumResizeTimer = null;
      this.enforceMinimumSize();
    }, 150);
  };

  private readonly hostBeforeUnload = (): void => {
    this.capturePlacement(false);
  };

  private readonly hostPageHide = (event: PageTransitionEvent): void => {
    if (event.persisted) return;
    this.finish('host-shutdown', true);
  };

  private finish(reason: PopupWindowCloseReason, closeWindow: boolean): void {
    if (this.closed || this.closing) return;
    this.closing = true;

    const finalPlacement = this.capturePlacement(false) ?? this.lastPersisted;
    const popup = this.popup;
    this.removeLifecycle();
    this.popup = null;

    if (closeWindow && popup && !popup.closed) {
      try {
        popup.close();
      } catch {
        // Browser window closure is best-effort during teardown.
      }
    }

    this.mainWindow = null;
    this.styleDocument = null;
    this.closed = true;
    this.closing = false;
    this.options.closed?.(reason, finalPlacement);
  }

  private capturePlacement(persist = true): UiWindowPlacement | null {
    const popup = this.popup;
    if (!popup || popup.closed) return null;

    const width = Math.round(popup.outerWidth);
    const height = Math.round(popup.outerHeight);
    const left = Math.round(popup.screenX);
    const top = Math.round(popup.screenY);

    if (
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      !Number.isFinite(left) ||
      !Number.isFinite(top) ||
      width < 320 ||
      height < 240
    )
      return null;

    const placement: UiWindowPlacement = { left, top, width, height, state: 'normal' };
    if (this.samePlacement(this.lastPersisted, placement)) return placement;

    this.lastPersisted = placement;
    if (persist) this.options.savePlacement?.(placement);
    return placement;
  }

  private samePlacement(left: UiWindowPlacement | null, right: UiWindowPlacement): boolean {
    return Boolean(
      left &&
      Math.abs(left.left - right.left) <= 1 &&
      Math.abs(left.top - right.top) <= 1 &&
      Math.abs(left.width - right.width) <= 1 &&
      Math.abs(left.height - right.height) <= 1,
    );
  }

  private restorePlacement(placement: UiWindowPlacement, popup: Window): void {
    try {
      popup.resizeTo(placement.width, placement.height);
      popup.moveTo(placement.left, placement.top);
    } catch {
      // Placement APIs are best-effort browser capabilities.
    }
  }

  private enforceMinimumSize(): void {
    const popup = this.popup;
    if (!popup || popup.closed) return;

    const screen = popup.screen;
    const maxWidth = Math.max(320, (Number(screen.availWidth) || popup.outerWidth || 760) - 48);
    const maxHeight = Math.max(240, (Number(screen.availHeight) || popup.outerHeight || 500) - 48);
    const minimumWidth =
      this.options.minimumWidth === undefined
        ? 0
        : Math.min(Math.max(320, Math.round(this.options.minimumWidth)), maxWidth);
    const minimumHeight =
      this.options.minimumHeight === undefined
        ? 0
        : Math.min(Math.max(240, Math.round(this.options.minimumHeight)), maxHeight);
    const width = Math.max(minimumWidth, Math.round(popup.outerWidth));
    const height = Math.max(minimumHeight, Math.round(popup.outerHeight));

    if (width === Math.round(popup.outerWidth) && height === Math.round(popup.outerHeight)) return;

    try {
      popup.resizeTo(width, height);
    } catch {
      // Browser window sizing is a best-effort capability.
    }
  }

  private normalizedPlacement(
    saved: UiWindowPlacement | null,
    mainWindow: Window,
  ): UiWindowPlacement {
    const screen = mainWindow.screen as Screen & { availLeft?: number; availTop?: number };
    const availLeft = Number.isFinite(screen.availLeft) ? Number(screen.availLeft) : 0;
    const availTop = Number.isFinite(screen.availTop) ? Number(screen.availTop) : 0;
    const availWidth = Math.max(640, Number(screen.availWidth) || mainWindow.innerWidth || 1280);
    const availHeight = Math.max(480, Number(screen.availHeight) || mainWindow.innerHeight || 800);

    const margin = 24;
    const maxWidth = Math.max(320, availWidth - margin * 2);
    const maxHeight = Math.max(240, availHeight - margin * 2);
    const minWidth = Math.min(
      Math.max(320, Math.round(this.options.minimumWidth ?? 320)),
      maxWidth,
    );
    const minHeight = Math.min(
      Math.max(240, Math.round(this.options.minimumHeight ?? 240)),
      maxHeight,
    );
    const width = Math.min(
      maxWidth,
      Math.max(minWidth, Math.round(saved?.width ?? this.options.defaultWidth ?? 1100)),
    );
    const height = Math.min(
      maxHeight,
      Math.max(minHeight, Math.round(saved?.height ?? this.options.defaultHeight ?? 760)),
    );
    const preferredLeft =
      saved?.left ?? Math.round(mainWindow.screenX + (mainWindow.outerWidth - width) / 2);
    const preferredTop =
      saved?.top ?? Math.round(mainWindow.screenY + (mainWindow.outerHeight - height) / 2);

    return {
      left: Math.min(
        availLeft + availWidth - margin - width,
        Math.max(availLeft + margin, Math.round(preferredLeft)),
      ),
      top: Math.min(
        availTop + availHeight - margin - height,
        Math.max(availTop + margin, Math.round(preferredTop)),
      ),
      width,
      height,
      state: 'normal',
    };
  }

  private initialisePopup(popup: Window, sourceDocument: Document): void {
    popup.document.open();
    popup.document.write(
      `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(this.options.title)}</title></head><body></body></html>`,
    );
    popup.document.close();

    const base = popup.document.createElement('base');
    base.href = sourceDocument.baseURI;
    popup.document.head.prepend(base);

    popup.document.documentElement.className = sourceDocument.documentElement.className;
    for (const attribute of sourceDocument.documentElement.attributes) {
      if (attribute.name !== 'class' && attribute.name !== 'style')
        popup.document.documentElement.setAttribute(attribute.name, attribute.value);
    }
    popup.document.body.className = sourceDocument.body.className;

    for (const source of sourceDocument.head.querySelectorAll('link[rel="stylesheet"], style')) {
      popup.document.head.appendChild(source.cloneNode(true));
    }

    const layout = popup.document.createElement('style');
    layout.dataset.manatosPopupWindowLayout = 'true';
    layout.textContent = `
      html, body { width: 100%; min-width: 0; height: 100%; min-height: 0; margin: 0; }
      body { box-sizing: border-box; overflow: auto; background: var(--manatos-workspace-bg, #f4f7fb); }
      ${this.options.layoutCss ?? ''}
    `;
    popup.document.head.appendChild(layout);
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
