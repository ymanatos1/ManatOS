import type { UiWindowPlacement } from '../preferences/ui-preferences.js';

export interface DetachedWindowHostOptions {
  readonly title: string;
  readonly windowName: string;
  readonly detachedClass?: string;
  readonly layoutCss?: string;
  readonly defaultWidth?: number;
  readonly defaultHeight?: number;
  readonly loadPlacement?: () => UiWindowPlacement | null;
  readonly savePlacement?: (placement: UiWindowPlacement) => void;
  readonly detachedChanged?: (detached: boolean) => void;
  /** Independently hosted surfaces can outlive a secondary debugger window. */
  readonly lifecycleWindow?: Window;
  readonly synchronizeFocus?: boolean;
}

/**
 * Moves one live browser DOM surface between its application document and a same-origin popup.
 * The surface is never cloned, so framework/component state remains authoritative in one place.
 */
export class DetachedWindowHost {
  private surface: HTMLElement | null = null;
  private originalParent: Node | null = null;
  private originalNextSibling: ChildNode | null = null;
  private popup: Window | null = null;
  private placementTimer: number | null = null;
  private styleObserver: MutationObserver | null = null;
  private documentElementObserver: MutationObserver | null = null;
  private restoring = false;
  private shuttingDown = false;
  private focusSync = false;
  private lastPersisted: UiWindowPlacement | null = null;

  constructor(private readonly options: DetachedWindowHostOptions) {}

  get detached(): boolean {
    return Boolean(
      this.popup && !this.popup.closed && this.surface?.ownerDocument === this.popup.document,
    );
  }

  /** Focus the existing popup without changing its attachment state. */
  focusDetached(): void {
    if (this.detached) this.popup?.focus();
  }

  toggle(surface: HTMLElement): boolean {
    if (this.detached) {
      this.attach(true);
      return false;
    }

    return this.detach(surface);
  }

  detach(surface: HTMLElement): boolean {
    if (this.detached) {
      this.popup?.focus();
      return true;
    }

    if (this.shuttingDown) return false;

    const sourceDocument = surface.ownerDocument;
    const openerWindow = sourceDocument.defaultView;
    const mainWindow = this.options.lifecycleWindow ?? openerWindow;
    const parent = surface.parentNode;
    if (!openerWindow || !mainWindow || !parent) return false;

    this.surface = surface;
    this.originalParent = parent;
    this.originalNextSibling = surface.nextSibling;

    const savedPlacement = this.options.loadPlacement?.() ?? null;
    this.lastPersisted = savedPlacement;
    const placement = this.normalizedPlacement(savedPlacement, mainWindow);
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
      this.clearSurfaceReferences();
      return false;
    }

    if (!popup) {
      this.clearSurfaceReferences();
      return false;
    }

    this.popup = popup;

    try {
      this.initialisePopup(popup, sourceDocument);
      popup.document.body.appendChild(surface);
      if (this.options.detachedClass) surface.classList.add(this.options.detachedClass);

      this.installLifecycle(mainWindow, popup, sourceDocument);
      this.restorePlacement(placement, popup);
      this.options.detachedChanged?.(true);
      popup.focus();
      return true;
    } catch {
      this.removeLifecycle(mainWindow, popup);
      this.restoreSurface();
      try {
        popup.close();
      } catch {
        // Best-effort cleanup after a failed popup initialisation.
      }
      this.popup = null;
      this.clearSurfaceReferences();
      return false;
    }
  }

  attach(focusMain = false): void {
    if (this.restoring || this.shuttingDown) return;
    if (!this.surface || !this.originalParent) return;

    this.restoring = true;
    try {
      const mainWindow =
        this.options.lifecycleWindow ?? this.originalParent.ownerDocument?.defaultView ?? window;
      this.capturePlacement();

      const popup = this.popup;
      this.removeLifecycle(mainWindow, popup);
      this.restoreSurface();
      this.popup = null;

      if (popup && !popup.closed) {
        try {
          popup.close();
        } catch {
          // Best-effort popup cleanup.
        }
      }

      this.options.detachedChanged?.(false);
      if (focusMain) (this.originalParent.ownerDocument?.defaultView ?? mainWindow).focus();
    } finally {
      this.restoring = false;
      this.clearSurfaceReferences();
    }
  }

  destroy(): void {
    if (!this.shuttingDown) this.attach(false);
  }

  private installLifecycle(mainWindow: Window, popup: Window, sourceDocument: Document): void {
    popup.addEventListener('beforeunload', this.popupClosing, { once: true });
    if (this.options.synchronizeFocus !== false) popup.addEventListener('focus', this.popupFocus);
    if (this.options.synchronizeFocus !== false)
      mainWindow.addEventListener('focus', this.mainFocus);
    mainWindow.addEventListener('pagehide', this.hostPageHide, true);
    mainWindow.addEventListener('beforeunload', this.hostBeforeUnload, true);

    this.placementTimer = mainWindow.setInterval(() => {
      if (!this.popup || this.popup.closed) {
        this.attach(false);
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
        if (record.type !== 'attributes' || !record.attributeName) continue;

        const value = sourceDocument.documentElement.getAttribute(record.attributeName);
        if (value === null) {
          this.popup.document.documentElement.removeAttribute(record.attributeName);
        } else {
          this.popup.document.documentElement.setAttribute(record.attributeName, value);
        }
      }
    });
    this.documentElementObserver.observe(sourceDocument.documentElement, { attributes: true });
  }

  private removeLifecycle(mainWindow: Window, popup: Window | null): void {
    if (this.placementTimer !== null) mainWindow.clearInterval(this.placementTimer);
    this.placementTimer = null;

    this.styleObserver?.disconnect();
    this.styleObserver = null;

    this.documentElementObserver?.disconnect();
    this.documentElementObserver = null;

    mainWindow.removeEventListener('focus', this.mainFocus);
    mainWindow.removeEventListener('pagehide', this.hostPageHide, true);
    mainWindow.removeEventListener('beforeunload', this.hostBeforeUnload, true);
    popup?.removeEventListener('beforeunload', this.popupClosing);
    popup?.removeEventListener('focus', this.popupFocus);
  }

  private readonly popupClosing = (): void => {
    if (!this.restoring && !this.shuttingDown) this.attach(false);
  };

  private readonly hostBeforeUnload = (): void => {
    this.capturePlacement();
  };

  private readonly hostPageHide = (event: PageTransitionEvent): void => {
    if (event.persisted) {
      this.attach(false);
      return;
    }

    this.shutdown();
  };

  private shutdown(): void {
    if (this.shuttingDown) return;
    this.shuttingDown = true;
    this.capturePlacement();

    const mainWindow =
      this.options.lifecycleWindow ?? this.originalParent?.ownerDocument?.defaultView ?? window;
    const popup = this.popup;
    this.removeLifecycle(mainWindow, popup);
    this.popup = null;

    if (this.surface && this.options.detachedClass) {
      this.surface.classList.remove(this.options.detachedClass);
    }

    if (popup && !popup.closed) {
      try {
        popup.close();
      } catch {
        // The main document is already leaving.
      }
    }

    this.clearSurfaceReferences();
  }

  private readonly mainFocus = (): void => this.syncWindowGroup('main');
  private readonly popupFocus = (): void => this.syncWindowGroup('popup');

  private syncWindowGroup(active: 'main' | 'popup'): void {
    if (
      this.options.synchronizeFocus === false ||
      this.focusSync ||
      this.shuttingDown ||
      !this.popup ||
      this.popup.closed
    )
      return;
    const mainWindow = this.originalParent?.ownerDocument?.defaultView;
    if (!mainWindow) return;

    this.focusSync = true;
    try {
      if (active === 'main') {
        this.popup.focus();
        mainWindow.focus();
      } else {
        mainWindow.focus();
        this.popup.focus();
      }
    } catch {
      // Browsers may reject focus changes that are not directly user initiated.
    } finally {
      mainWindow.setTimeout(() => {
        this.focusSync = false;
      }, 0);
    }
  }

  private restoreSurface(): void {
    if (!this.surface || !this.originalParent) return;

    if (this.originalNextSibling?.parentNode === this.originalParent) {
      this.originalParent.insertBefore(this.surface, this.originalNextSibling);
    } else {
      this.originalParent.appendChild(this.surface);
    }

    if (this.options.detachedClass) this.surface.classList.remove(this.options.detachedClass);
  }

  private clearSurfaceReferences(): void {
    this.surface = null;
    this.originalParent = null;
    this.originalNextSibling = null;
  }

  private capturePlacement(): void {
    const popup = this.popup;
    if (!popup || popup.closed) return;

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
    ) {
      return;
    }

    const placement: UiWindowPlacement = { left, top, width, height, state: 'normal' };
    if (this.samePlacement(this.lastPersisted, placement)) return;

    this.lastPersisted = placement;
    this.options.savePlacement?.(placement);
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

  private normalizedPlacement(
    saved: UiWindowPlacement | null,
    mainWindow: Window,
  ): UiWindowPlacement {
    const screen = mainWindow.screen as Screen & { availLeft?: number; availTop?: number };
    const availLeft = Number.isFinite(screen.availLeft) ? Number(screen.availLeft) : 0;
    const availTop = Number.isFinite(screen.availTop) ? Number(screen.availTop) : 0;
    const availWidth = Math.max(640, Number(screen.availWidth) || mainWindow.innerWidth || 1280);
    const availHeight = Math.max(480, Number(screen.availHeight) || mainWindow.innerHeight || 800);

    const width = Math.min(
      availWidth,
      Math.max(640, Math.round(saved?.width ?? this.options.defaultWidth ?? 1100)),
    );
    const height = Math.min(
      availHeight,
      Math.max(480, Math.round(saved?.height ?? this.options.defaultHeight ?? 760)),
    );

    const preferredLeft =
      saved?.left ?? Math.round(mainWindow.screenX + (mainWindow.outerWidth - width) / 2);
    const preferredTop =
      saved?.top ?? Math.round(mainWindow.screenY + (mainWindow.outerHeight - height) / 2);

    return {
      left: Math.min(
        availLeft + availWidth - width,
        Math.max(availLeft, Math.round(preferredLeft)),
      ),
      top: Math.min(availTop + availHeight - height, Math.max(availTop, Math.round(preferredTop))),
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
      if (attribute.name !== 'class') {
        popup.document.documentElement.setAttribute(attribute.name, attribute.value);
      }
    }
    popup.document.body.className = sourceDocument.body.className;

    for (const source of sourceDocument.head.querySelectorAll('link[rel="stylesheet"], style')) {
      popup.document.head.appendChild(source.cloneNode(true));
    }

    const layout = popup.document.createElement('style');
    layout.dataset.manatosDetachedWindowLayout = 'true';
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
