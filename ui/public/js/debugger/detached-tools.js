(() => {
  'use strict';

  /*
   * Developer Tools host controller.
   *
   * The debugger has exactly one live DOM/runtime instance. Detaching moves that
   * same dock into a same-origin secondary window; it does not clone CTX state,
   * API traffic, tree state or event subscriptions.
   *
   * Full page navigation creates a fresh application document/runtime. The
   * detached window itself therefore survives navigation and reconnects to the
   * new page, which moves the new page's single live dock into that same window.
   * This avoids both stale debugger runtimes and a second debugger instance.
   */
  const dock = document.getElementById('developerToolsDock');
  const detachButton = document.getElementById('detachDeveloperToolsDock');
  const closeButton = document.getElementById('closeDeveloperToolsDock');
  const appShell = document.getElementById('appShell');
  if (!(dock instanceof HTMLElement) || !(detachButton instanceof HTMLButtonElement)) return;

  const originalParent = dock.parentNode;
  const originalNextSibling = dock.nextSibling;
  const bootId =
    document.querySelector('meta[name="manatos-ui-boot-id"]')?.getAttribute('content') || 'unknown';
  const detachedStateKey = 'manatos.debug.developerDock.detached.v2';
  const detachedGeometryKey = 'manatos.debug.developerDock.geometry.v2';

  let detachedWindow = null;
  let closedPoll = null;
  let restoring = false;
  let mainNavigating = false;

  const detachedRequested = () => localStorage.getItem(detachedStateKey) === 'true';
  const setDetachedRequested = (value) => {
    if (value) localStorage.setItem(detachedStateKey, 'true');
    else localStorage.removeItem(detachedStateKey);
  };

  const setDetachButtonState = (detached) => {
    detachButton.title = detached
      ? 'Attach Developer Tools to the main window'
      : 'Detach Developer Tools';
    detachButton.setAttribute(
      'aria-label',
      detached ? 'Attach Developer Tools to the main window' : 'Detach Developer Tools',
    );
    const icon = detachButton.querySelector('i');
    if (icon)
      icon.className = detached ? 'bi bi-box-arrow-in-down-left' : 'bi bi-box-arrow-up-right';
  };

  const copyStyles = (targetDocument) => {
    for (const stylesheet of document.querySelectorAll('link[rel="stylesheet"]')) {
      const clone = targetDocument.createElement('link');
      clone.rel = 'stylesheet';
      clone.href = stylesheet.href;
      targetDocument.head.appendChild(clone);
    }
    for (const style of document.querySelectorAll('style')) {
      targetDocument.head.appendChild(style.cloneNode(true));
    }

    const detachedLayout = targetDocument.createElement('style');
    detachedLayout.textContent = `
      html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; background: #f8fafc; }
      body { display: flex; min-width: 0; min-height: 0; }
      .developer-tools-dock {
        position: relative !important;
        inset: auto !important;
        top: auto !important;
        width: 100% !important;
        height: 100vh !important;
        max-height: none !important;
        min-width: 0 !important;
        flex: 1 1 auto;
        border-left: 0 !important;
        contain: size;
      }
      .developer-tools-dock > .ctx-debug-panel-resize { display: none !important; }
    `;
    targetDocument.head.appendChild(detachedLayout);
  };

  /*
   * The bridge executes in the detached window's own JavaScript realm. That is
   * important: when the main page navigates, the old page runtime is destroyed,
   * but this small bridge remains alive and can hand the existing popup to the
   * newly loaded page. A changed UI boot id means a server restart, so the
   * detached debugger closes and follows the normal debugger-state reset rule.
   */
  const installReconnectBridge = (popup) => {
    const script = popup.document.createElement('script');
    script.textContent = `(() => {
      const reconnect = () => {
        try {
          if (!window.opener || window.opener.closed) {
            window.close();
            return;
          }

          window.opener.ManatOSDeveloperToolsHost?.adoptDetachedWindow?.(window);
        } catch {
          // The opener navigated away from the ManatOS origin; do not leave an
          // orphaned developer window displaying stale application state.
          window.close();
        }
      };

      window.setInterval(reconnect, 150);
    })();`;
    popup.document.body.appendChild(script);
  };

  const initialiseDetachedDocument = (popup) => {
    popup.document.open();
    popup.document.write(
      '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ManatOS Developer Tools</title></head><body></body></html>',
    );
    popup.document.close();
    popup.document.documentElement.className = document.documentElement.className;
    popup.document.documentElement.dataset.manatosUiBootId = bootId;
    for (const attribute of document.documentElement.attributes) {
      if (attribute.name.startsWith('data-'))
        popup.document.documentElement.setAttribute(attribute.name, attribute.value);
    }
    popup.document.body.className = document.body.className;
    copyStyles(popup.document);
  };

  const restoreDock = ({ focusMain = false, preserveDetachedRequest = false } = {}) => {
    if (restoring || !originalParent) return;
    restoring = true;
    try {
      if (closedPoll) {
        clearInterval(closedPoll);
        closedPoll = null;
      }

      if (originalNextSibling?.parentNode === originalParent)
        originalParent.insertBefore(dock, originalNextSibling);
      else originalParent.appendChild(dock);

      dock.classList.remove('is-detached-developer-tools');
      if (!dock.classList.contains('d-none')) appShell?.classList.add('has-debug');
      setDetachButtonState(false);
      if (!preserveDetachedRequest) setDetachedRequested(false);

      const popup = detachedWindow;
      detachedWindow = null;
      if (popup && !popup.closed) popup.close();
      if (focusMain) window.focus();
      window.dispatchEvent(new Event('resize'));
    } finally {
      restoring = false;
    }
  };

  const hostDockInPopup = (popup) => {
    if (!popup || popup.closed) return false;
    if (detachedWindow === popup && dock.ownerDocument === popup.document) return true;

    detachedWindow = popup;
    initialiseDetachedDocument(popup);

    appShell?.classList.remove('has-debug');
    popup.document.body.appendChild(dock);
    dock.classList.add('is-detached-developer-tools');
    dock.classList.remove('d-none');
    dock.removeAttribute('inert');
    dock.setAttribute('aria-hidden', 'false');
    setDetachButtonState(true);
    setDetachedRequested(true);
    installReconnectBridge(popup);

    const onDetachedWindowClosing = () => {
      /* Rewriting the detached document during a main-page navigation emits
       * pagehide/beforeunload on the old popup document. The old page must not
       * interpret that hand-off as the user closing the detached window. */
      if (!restoring && !mainNavigating) restoreDock();
    };
    popup.addEventListener('pagehide', onDetachedWindowClosing, { once: true });
    popup.addEventListener('beforeunload', onDetachedWindowClosing, { once: true });

    if (closedPoll) clearInterval(closedPoll);
    closedPoll = window.setInterval(() => {
      if (!detachedWindow || detachedWindow.closed) restoreDock();
      else persistDetachedGeometry(detachedWindow);
    }, 500);

    window.dispatchEvent(new Event('resize'));
    return true;
  };

  const readDetachedGeometry = () => {
    try {
      const geometry = JSON.parse(localStorage.getItem(detachedGeometryKey) || 'null');
      return geometry && typeof geometry === 'object' ? geometry : null;
    } catch {
      return null;
    }
  };

  const persistDetachedGeometry = (popup) => {
    if (!popup || popup.closed) return;
    try {
      localStorage.setItem(
        detachedGeometryKey,
        JSON.stringify({
          left: popup.screenX,
          top: popup.screenY,
          width: popup.outerWidth,
          height: popup.outerHeight,
        }),
      );
    } catch {
      /* debugger workspace persistence must never affect the application */
    }
  };

  const detachDock = () => {
    if (detachedWindow && !detachedWindow.closed) {
      detachedWindow.focus();
      return;
    }

    const geometry = readDetachedGeometry();
    const popupFeatures = [
      'popup=yes',
      `width=${Math.max(420, Number(geometry?.width) || 720)}`,
      `height=${Math.max(360, Number(geometry?.height) || 900)}`,
      `left=${Number.isFinite(Number(geometry?.left)) ? Number(geometry.left) : 80}`,
      `top=${Number.isFinite(Number(geometry?.top)) ? Number(geometry.top) : 80}`,
      'resizable=yes',
      'scrollbars=no',
    ].join(',');
    const popup = window.open('', 'manatosDeveloperTools', popupFeatures);
    if (!popup) {
      console.warn('[ManatOS Developer Tools] Browser blocked the detached debugger window.');
      return;
    }

    if (!hostDockInPopup(popup)) return;
    popup.focus();
  };

  detachButton.addEventListener('click', () => {
    if (detachedWindow && !detachedWindow.closed) restoreDock({ focusMain: true });
    else detachDock();
  });

  /*
   * The existing shell owns the Close action. While detached, first move the
   * single dock back, then replay that same Close click so there is still only
   * one visibility implementation.
   */
  closeButton?.addEventListener(
    'click',
    (event) => {
      if (!detachedWindow || detachedWindow.closed) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      restoreDock();
      closeButton.click();
    },
    true,
  );

  /*
   * Visibility is owned by the shell even while the dock lives in the popup.
   * Hiding a detached workspace closes the popup but preserves the user's
   * detached-host preference; showing it again from the menu therefore opens
   * the popup from the user's click gesture, avoiding popup-blocker dead ends.
   */
  window.addEventListener('manatos:developer-tools-visibility-changed', (event) => {
    const visible = event instanceof CustomEvent ? event.detail?.visible === true : false;

    if (!visible) {
      if (detachedWindow && !detachedWindow.closed) {
        restoreDock({ preserveDetachedRequest: true });
        dock.classList.add('d-none');
        dock.setAttribute('inert', '');
        dock.setAttribute('aria-hidden', 'true');
        appShell?.classList.remove('has-debug');
      }
      return;
    }

    if (detachedWindow && !detachedWindow.closed) {
      detachedWindow.focus();
      return;
    }

    if (detachedRequested()) detachDock();
  });

  /*
   * Do not close or re-dock on main-page navigation. The popup remains the
   * stable visual host while its reconnect bridge waits for the next ManatOS
   * page runtime. The new page then adopts this exact popup and moves its fresh
   * single debugger dock into it.
   */
  window.addEventListener('pagehide', () => {
    mainNavigating = true;
    if (closedPoll) {
      clearInterval(closedPoll);
      closedPoll = null;
    }
  });

  if (detachedRequested() && !dock.classList.contains('d-none')) {
    window.setTimeout(() => detachDock(), 0);
  }

  window.ManatOSDeveloperToolsHost = Object.freeze({
    isDetached: () => Boolean(detachedWindow && !detachedWindow.closed),
    detach: detachDock,
    attach: () => restoreDock({ focusMain: true }),
    focus: () => detachedWindow?.focus(),
    adoptDetachedWindow: (popup) => {
      if (!detachedRequested()) return false;
      return hostDockInPopup(popup);
    },
  });
})();
