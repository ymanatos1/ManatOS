import type { UiWindowPlacement } from '@manatos/shared-ui';

export interface DebuggerHostOptions {
  readonly loadPlacement?: () => UiWindowPlacement | null;
  readonly savePlacement?: (placement: UiWindowPlacement) => void;
}

interface ScreenRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly current: boolean;
  readonly primary: boolean;
}

interface PopupTarget {
  left: number | null;
  top: number | null;
  width: number;
  height: number;
}

/** Hosts the single live debugger DOM instance in the shell or a same-origin popup. */
export class DebuggerHost {
  private dock: HTMLElement | null = null;
  private originalParent: Node | null = null;
  private originalNextSibling: ChildNode | null = null;
  private popup: Window | null = null;
  private closedPoll: number | null = null;
  private restoreTimer: number | null = null;
  private restoring = false;
  private shuttingDown = false;
  private placementRestoring = false;
  private persistenceArmedAt = 0;
  private focusSync = false;
  private geometryTrustResolved = false;
  private geometryTrusted = true;
  private lastPersisted: UiWindowPlacement | null = null;
  private detachedChanged: ((detached: boolean) => void) | null = null;

  constructor(private readonly options: DebuggerHostOptions = {}) {}

  setDetachedChanged(callback: (detached: boolean) => void): void {
    this.detachedChanged = callback;
  }

  get detached(): boolean {
    return Boolean(
      this.popup && !this.popup.closed && this.dock?.ownerDocument === this.popup.document,
    );
  }

  toggle(dock: HTMLElement): boolean {
    if (this.detached) {
      this.attach(true);
      return false;
    }
    return this.detach(dock);
  }

  detach(dock: HTMLElement): boolean {
    if (this.detached) {
      this.popup?.focus();
      return true;
    }

    const mainWindow = dock.ownerDocument.defaultView;
    if (!mainWindow || this.shuttingDown) return false;

    this.dock = dock;
    this.originalParent = dock.parentNode;
    this.originalNextSibling = dock.nextSibling;
    if (!this.originalParent) {
      this.clearDockReferences();
      return false;
    }

    const trustedGeometry = this.screenGeometryTrusted(mainWindow, dock.ownerDocument);
    const saved = this.options.loadPlacement?.() ?? null;
    const initialScreen = trustedGeometry ? this.screenDescriptor(mainWindow.screen) : null;
    const target = this.normalizeTarget(saved, initialScreen);
    if (!trustedGeometry) {
      target.left = null;
      target.top = null;
    }

    // Browser feature dimensions are viewport hints, not durable outer-window dimensions. Keep the
    // trusted initial popup conservative so the browser is less likely to clamp/reposition it
    // before the measured outer rectangle is restored below. In privacy/farbled mode, inner size
    // is the only trustworthy dimension, so use the durable size directly.
    const initialWidth = trustedGeometry
      ? Math.max(320, Math.min(target.width, 640))
      : target.width;
    const initialHeight = trustedGeometry
      ? Math.max(240, Math.min(target.height, 480))
      : target.height;

    // Open synchronously while the click still owns transient user activation. Multi-screen
    // discovery can require permission/awaiting and must never make the popup look unsolicited.
    const features = [
      'popup=yes',
      `width=${initialWidth}`,
      `height=${initialHeight}`,
      target.left === null ? null : `left=${target.left}`,
      target.top === null ? null : `top=${target.top}`,
      'resizable=yes',
      'scrollbars=no',
    ]
      .filter((value): value is string => Boolean(value))
      .join(',');

    let popup: Window | null = null;
    try {
      popup = mainWindow.open(
        'about:blank#manatos-debugger',
        `ManatOSDebuggingTools_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        features,
      );
    } catch {
      this.clearDockReferences();
      return false;
    }
    if (!popup) {
      this.clearDockReferences();
      console.warn('[ManatOS Debugging Tools] Browser blocked the detached debugger window.');
      return false;
    }

    this.popup = popup;
    try {
      this.initialisePopup(popup, dock.ownerDocument);
      popup.document.body.appendChild(dock);
      dock.classList.add('is-detached-developer-tools');
      this.installDetachedLifecycle(mainWindow, popup);
      this.detachedChanged?.(true);
      popup.focus();
      this.restorePlacement(target, mainWindow);
      if (trustedGeometry) void this.refinePlacementFromScreens(saved, mainWindow, popup);
      return true;
    } catch {
      this.removeDetachedLifecycle(mainWindow, popup);
      this.restoreDock();
      try {
        popup.close();
      } catch {
        // Best-effort popup cleanup.
      }
      this.popup = null;
      this.clearDockReferences();
      return false;
    }
  }

  /** Match NG1's explicit popup-to-debugger focus request when detached. */
  focusDetached(): void {
    if (!this.shuttingDown && this.detached) {
      try {
        this.popup?.focus();
      } catch {
        // Browsers may deny window focus without transient user activation.
      }
    }
  }

  /** Restore the main window on the second popup CTX debugger action. */
  focusMain(): void {
    if (this.shuttingDown) return;
    try {
      (this.originalParent?.ownerDocument?.defaultView ?? window).focus();
    } catch {
      // Best effort; never mutate debugger attachment or visibility.
    }
  }

  attach(focusMain = false): void {
    if (this.restoring || this.shuttingDown) return;
    const dock = this.dock;
    const parent = this.originalParent;
    if (!dock || !parent) return;

    this.restoring = true;
    try {
      const mainWindow = parent.ownerDocument?.defaultView ?? window;
      if (!this.placementRestoring && performance.now() >= this.persistenceArmedAt) {
        this.capturePlacement();
      }
      this.stopPlacementRestore(mainWindow);
      this.stopPoll(mainWindow);

      const popup = this.popup;
      this.removeDetachedLifecycle(mainWindow, popup);
      this.restoreDock();
      this.popup = null;

      if (popup && !popup.closed) {
        try {
          popup.close();
        } catch {
          // Best-effort popup cleanup.
        }
      }
      this.detachedChanged?.(false);
      if (focusMain) mainWindow.focus();
    } finally {
      this.restoring = false;
      this.clearDockReferences();
    }
  }

  destroy(): void {
    if (!this.shuttingDown) this.attach(false);
    this.detachedChanged = null;
  }

  private installDetachedLifecycle(mainWindow: Window, popup: Window): void {
    popup.addEventListener('beforeunload', this.popupClosing, { once: true });
    popup.addEventListener('focus', this.popupFocus);
    mainWindow.addEventListener('focus', this.mainFocus);
    mainWindow.addEventListener('pagehide', this.hostPageHide, true);
    mainWindow.addEventListener('beforeunload', this.hostBeforeUnload, true);

    this.closedPoll = mainWindow.setInterval(() => {
      if (!this.popup || this.popup.closed) {
        this.attach(false);
        return;
      }
      this.capturePlacement();
    }, 400);
  }

  private removeDetachedLifecycle(mainWindow: Window, popup: Window | null): void {
    mainWindow.removeEventListener('focus', this.mainFocus);
    mainWindow.removeEventListener('pagehide', this.hostPageHide, true);
    mainWindow.removeEventListener('beforeunload', this.hostBeforeUnload, true);
    popup?.removeEventListener('beforeunload', this.popupClosing);
    popup?.removeEventListener('focus', this.popupFocus);
  }

  private readonly popupClosing = (): void => {
    if (!this.restoring && !this.shuttingDown) this.attach(false);
  };

  private readonly hostPageHide = (event: PageTransitionEvent): void => {
    if (event.persisted) this.attach(false);
    else this.shutdown();
  };

  private readonly hostBeforeUnload = (): void => {
    // beforeunload can be cancelled. Persist here, but only tear down on pagehide after real
    // navigation.
    this.capturePlacement();
  };

  private shutdown(): void {
    if (this.shuttingDown) return;
    if (!this.placementRestoring && performance.now() >= this.persistenceArmedAt) {
      this.capturePlacement();
    }
    this.shuttingDown = true;

    const mainWindow = this.originalParent?.ownerDocument?.defaultView ?? window;
    this.stopPlacementRestore(mainWindow);
    this.stopPoll(mainWindow);
    const popup = this.popup;
    this.removeDetachedLifecycle(mainWindow, popup);
    this.popup = null;
    this.dock?.classList.remove('is-detached-developer-tools');
    if (popup && !popup.closed) {
      try {
        popup.close();
      } catch {
        // The main document is already leaving.
      }
    }
    this.clearDockReferences();
  }

  private readonly mainFocus = (): void => this.syncWindowGroup('main');
  private readonly popupFocus = (): void => this.syncWindowGroup('popup');

  private syncWindowGroup(active: 'main' | 'popup'): void {
    if (this.focusSync || this.shuttingDown || !this.popup || this.popup.closed) return;
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
      // Browsers may refuse programmatic focus without a user gesture.
    } finally {
      mainWindow.setTimeout(() => {
        this.focusSync = false;
      }, 0);
    }
  }

  private restoreDock(): void {
    const dock = this.dock;
    const parent = this.originalParent;
    if (!dock || !parent) return;
    if (this.originalNextSibling?.parentNode === parent) {
      parent.insertBefore(dock, this.originalNextSibling);
    } else {
      parent.appendChild(dock);
    }
    dock.classList.remove('is-detached-developer-tools');
  }

  private clearDockReferences(): void {
    this.dock = null;
    this.originalParent = null;
    this.originalNextSibling = null;
  }

  private stopPoll(mainWindow: Window): void {
    if (this.closedPoll !== null) mainWindow.clearInterval(this.closedPoll);
    this.closedPoll = null;
  }

  private stopPlacementRestore(mainWindow: Window): void {
    if (this.restoreTimer !== null) mainWindow.clearTimeout(this.restoreTimer);
    this.restoreTimer = null;
    this.placementRestoring = false;
    this.persistenceArmedAt = 0;
  }

  private capturePlacement(force = false): void {
    if (this.placementRestoring || (!force && performance.now() < this.persistenceArmedAt)) {
      return;
    }
    const popup = this.popup;
    if (!popup || popup.closed) return;

    const trusted = this.geometryTrusted;
    const previous = this.options.loadPlacement?.() ?? this.lastPersisted;
    const width = Math.round(trusted ? popup.outerWidth : popup.innerWidth);
    const height = Math.round(trusted ? popup.outerHeight : popup.innerHeight);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width < 320 || height < 240) {
      return;
    }

    const placement: UiWindowPlacement = {
      left:
        trusted && Number.isFinite(popup.screenX)
          ? Math.round(popup.screenX)
          : (previous?.left ?? 0),
      top:
        trusted && Number.isFinite(popup.screenY)
          ? Math.round(popup.screenY)
          : (previous?.top ?? 0),
      width,
      height,
      state: 'normal',
    };
    if (!force && this.samePlacement(this.lastPersisted ?? previous, placement, 1)) return;
    this.lastPersisted = placement;
    this.options.savePlacement?.(placement);
  }

  private restorePlacement(target: PopupTarget, mainWindow: Window): void {
    const popup = this.popup;
    if (!popup || popup.closed) return;
    this.stopPlacementRestore(mainWindow);
    this.placementRestoring = true;

    if (!this.geometryTrusted) {
      this.restoreTimer = mainWindow.setTimeout(() => {
        this.placementRestoring = false;
        this.persistenceArmedAt = performance.now() + 750;
        this.capturePlacement(true);
      }, 250);
      return;
    }

    try {
      popup.resizeTo(target.width, target.height);
      if (target.left !== null && target.top !== null) popup.moveTo(target.left, target.top);
    } catch {
      // Placement APIs are best-effort browser capabilities.
    }

    this.restoreTimer = mainWindow.setTimeout(() => {
      if (!this.popup || this.popup.closed || this.shuttingDown) return;
      const actual = {
        left: Math.round(this.popup.screenX),
        top: Math.round(this.popup.screenY),
        width: Math.round(this.popup.outerWidth),
        height: Math.round(this.popup.outerHeight),
      };
      try {
        const dw = target.width - actual.width;
        const dh = target.height - actual.height;
        if (Math.abs(dw) > 2 || Math.abs(dh) > 2) {
          this.popup.resizeBy(Math.round(dw), Math.round(dh));
        }
        if (target.left !== null && target.top !== null) {
          const dx = target.left - actual.left;
          const dy = target.top - actual.top;
          if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
            this.popup.moveBy(Math.round(dx), Math.round(dy));
          }
        }
      } catch {
        // One residual correction only; never chase browser geometry indefinitely.
      }
      this.restoreTimer = mainWindow.setTimeout(() => {
        this.placementRestoring = false;
        this.persistenceArmedAt = performance.now() + 750;
        this.capturePlacement(true);
      }, 250);
    }, 250);
  }

  private screenGeometryTrusted(mainWindow: Window, sourceDocument: Document): boolean {
    if (this.geometryTrustResolved) return this.geometryTrusted;
    this.geometryTrustResolved = true;

    let probe: HTMLIFrameElement | null = null;
    try {
      probe = sourceDocument.createElement('iframe');
      probe.src = 'about:blank';
      probe.setAttribute('aria-hidden', 'true');
      probe.style.cssText =
        'position:fixed;left:-10000px;top:-10000px;width:1px;height:1px;border:0;visibility:hidden;';
      sourceDocument.documentElement.appendChild(probe);
      const child = probe.contentWindow?.screen as (Screen & Record<string, number>) | undefined;
      const parent = mainWindow.screen as Screen & Record<string, number>;
      const keys = ['width', 'height', 'availWidth', 'availHeight', 'availLeft', 'availTop'];
      this.geometryTrusted =
        Boolean(child) && keys.every((key) => Number(parent[key]) === Number(child?.[key]));
    } catch {
      // Unknown geometry is safer than persisting or moving with coordinates the browser may
      // have spoofed.
      this.geometryTrusted = false;
    } finally {
      probe?.remove();
    }
    return this.geometryTrusted;
  }

  private async refinePlacementFromScreens(
    saved: UiWindowPlacement | null,
    mainWindow: Window,
    expectedPopup: Window,
  ): Promise<void> {
    const extendedWindow = mainWindow as Window & { getScreenDetails?: () => Promise<unknown> };
    const screen = mainWindow.screen as Screen & { isExtended?: boolean };
    if (screen.isExtended !== true || typeof extendedWindow.getScreenDetails !== 'function') return;

    const screens = await this.availableScreens(mainWindow);
    if (
      this.popup !== expectedPopup ||
      expectedPopup.closed ||
      this.shuttingDown ||
      !screens.length
    ) {
      return;
    }
    const refined = this.normalizeTarget(saved, this.chooseScreen(screens, saved));
    this.restorePlacement(refined, mainWindow);
  }

  private async availableScreens(mainWindow: Window): Promise<readonly ScreenRect[]> {
    const extendedWindow = mainWindow as Window & {
      getScreenDetails?: () => Promise<{ screens?: readonly unknown[] }>;
    };
    const screen = mainWindow.screen as Screen & { isExtended?: boolean };
    if (screen.isExtended === true && typeof extendedWindow.getScreenDetails === 'function') {
      try {
        const details = await extendedWindow.getScreenDetails();
        const screens = (details.screens ?? [])
          .map((candidate) => this.screenDescriptor(candidate))
          .filter((candidate): candidate is ScreenRect => candidate !== null);
        if (screens.length) return screens;
      } catch {
        // Permission denial or unsupported multi-screen API: fall back to current screen.
      }
    }
    const current = this.screenDescriptor(mainWindow.screen);
    return current ? [{ ...current, current: true, primary: true }] : [];
  }

  private screenDescriptor(source: unknown): ScreenRect | null {
    if (!source || typeof source !== 'object') return null;
    const value = source as Record<string, unknown>;
    const left = this.finiteNumber(value['availLeft']) ?? this.finiteNumber(value['left']) ?? 0;
    const top = this.finiteNumber(value['availTop']) ?? this.finiteNumber(value['top']) ?? 0;
    const width = this.finiteNumber(value['availWidth']) ?? this.finiteNumber(value['width']);
    const height = this.finiteNumber(value['availHeight']) ?? this.finiteNumber(value['height']);
    if (width === null || height === null || width <= 0 || height <= 0) return null;
    return {
      left: Math.round(left),
      top: Math.round(top),
      width: Math.round(width),
      height: Math.round(height),
      current: value['isCurrent'] === true,
      primary: value['isPrimary'] === true,
    };
  }

  private chooseScreen(
    screens: readonly ScreenRect[],
    placement: UiWindowPlacement | null,
  ): ScreenRect | null {
    if (!screens.length) return null;
    if (!placement) {
      return (
        screens.find((screen) => screen.current) ??
        screens.find((screen) => screen.primary) ??
        screens[0]!
      );
    }
    const centerX = placement.left + placement.width / 2;
    const centerY = placement.top + placement.height / 2;
    const containing = screens.find(
      (screen) =>
        centerX >= screen.left &&
        centerX < screen.left + screen.width &&
        centerY >= screen.top &&
        centerY < screen.top + screen.height,
    );
    if (containing) return containing;
    return screens.reduce((best, screen) =>
      this.distanceToRectSquared(centerX, centerY, screen) <
      this.distanceToRectSquared(centerX, centerY, best)
        ? screen
        : best,
    );
  }

  private normalizeTarget(
    placement: UiWindowPlacement | null,
    screen: ScreenRect | null,
  ): PopupTarget {
    let width = Math.max(320, Math.round(placement?.width ?? 1000));
    let height = Math.max(240, Math.round(placement?.height ?? 760));
    let left = placement?.left ?? null;
    let top = placement?.top ?? null;
    if (screen) {
      width = Math.min(width, Math.max(320, screen.width));
      height = Math.min(height, Math.max(240, screen.height));
      if (left === null) left = screen.left + Math.max(0, Math.round((screen.width - width) / 2));
      if (top === null) top = screen.top + Math.max(0, Math.round((screen.height - height) / 2));
      left = this.clampAxis(left, width, screen.left, screen.width);
      top = this.clampAxis(top, height, screen.top, screen.height);
    }
    return { left, top, width, height };
  }

  private clampAxis(value: number, size: number, start: number, span: number): number {
    if (size <= span) return Math.max(start, Math.min(start + span - size, value));
    const visible = Math.min(96, span);
    return Math.max(start - size + visible, Math.min(start + span - visible, value));
  }

  private distanceToRectSquared(x: number, y: number, rect: ScreenRect): number {
    const dx = this.distanceToAxis(x, rect.left, rect.width);
    const dy = this.distanceToAxis(y, rect.top, rect.height);
    return dx * dx + dy * dy;
  }

  private distanceToAxis(value: number, start: number, span: number): number {
    if (value < start) return start - value;
    const end = start + span;
    return value > end ? value - end : 0;
  }

  private samePlacement(
    left: UiWindowPlacement | null,
    right: UiWindowPlacement,
    tolerance: number,
  ): boolean {
    return Boolean(
      left &&
      Math.abs(left.left - right.left) <= tolerance &&
      Math.abs(left.top - right.top) <= tolerance &&
      Math.abs(left.width - right.width) <= tolerance &&
      Math.abs(left.height - right.height) <= tolerance,
    );
  }

  private finiteNumber(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  private initialisePopup(popup: Window, sourceDocument: Document): void {
    popup.document.open();
    popup.document.write(
      '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ManatOS Debugging Tools</title></head><body></body></html>',
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
    layout.textContent = `
      html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; background: #f8fafc; }
      body { display: flex; min-width: 0; min-height: 0; }
      .developer-tools-dock.is-detached-developer-tools {
        position: relative !important; inset: auto !important; width: 100% !important;
        max-width: none !important; min-width: 0 !important; height: 100dvh !important;
        max-height: none !important; flex: 1 1 auto !important; border-left: 0 !important;
        box-shadow: none !important;
      }
      .developer-tools-dock.is-detached-developer-tools > .developer-tools-resize { display: none !important; }
    `;
    popup.document.head.appendChild(layout);
  }
}
