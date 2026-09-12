/**
 * Generic hosted metadata-entry popup.
 *
 * The popup does not render fields. It hosts the ordinary metadata-driven entry
 * route in a same-origin iframe and exchanges invocation/result envelopes with
 * the caller, so full-page and popup entries share one renderer and save path.
 *
 * The outer window owns the popup host/provenance surface in ctx.ui. The hosted
 * entry iframe owns its own canonical entry CTX. Entry state is never copied into
 * the outer CTX: cross-window duplication would create a shadow semantic owner.
 */
(() => {
  const activePopups = [];

  const open = ({
    url,
    token,
    title = 'Entry',
    entityKey = null,
    mode = 'view',
    invocation = {},
    onSaved = null,
    onClose = null,
  } = {}) => {
    if (!url || !token) return null;

    const runtime = window.ManatOS?.ctx;
    const popupRuntime = window.ManatOS?.popup?.runtime;
    const popupPlacement = popupRuntime?.preparePopupPlacement?.({ width: 1120, height: 820 }) ?? {
      x: Math.max(8, Math.round((window.innerWidth - Math.min(1120, window.innerWidth - 48)) / 2)),
      y: Math.max(8, Math.round((window.innerHeight - Math.min(820, window.innerHeight - 48)) / 2)),
      openedPopupsCounter: 0,
    };
    const resolvedInvocation = Object.freeze({ ...invocation });
    const recoveryUrl = (() => {
      const parsed = new URL(url, window.location.origin);
      parsed.searchParams.delete('_entryPopupToken');
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    })();
    const recoveryDescriptor = Object.freeze({
      type: 'entry',
      order: popupRuntime?.nextRecoveryOrder?.() || Date.now(),
      url: recoveryUrl,
      title,
      entityKey,
      mode,
      invocation: { ...resolvedInvocation },
    });
    let resolveReady;
    const ready = new Promise((resolve) => {
      resolveReady = resolve;
    });

    const v2Surface = popupRuntime?.openUiLevel?.({
      kind: 'entry',
      mode,
      name: `${entityKey || resolvedInvocation.entityName || 'entry'}-entry`,
      entityKey,
      invocation: { ...resolvedInvocation },
      presentation: {
        title,
        layout: resolvedInvocation.presentation?.layout || 'entry',
      },
      state: { popup: { ...popupPlacement } },
      supportsUserChanges: mode !== 'view',
    });
    // A hosted entry popup is always a canonical child V2 surface. Do not
    // create a parallel ctx.ui...popup projection or silently fall back to the
    // owning entry: one popup invocation has one CTX owner.
    if (!v2Surface) return null;
    const popupPath = v2Surface.path;

    const backdrop = document.createElement('div');
    backdrop.className = 'manatos-popup-backdrop manatos-popup-preparing';
    backdrop.dataset.entryPopupBackdrop = '';
    backdrop.innerHTML = `
      <div class="card shadow-lg metadata-entry-popup manatos-popup-initializing" role="dialog" aria-modal="true" aria-busy="true">
        <div class="card-header d-flex align-items-center justify-content-between gap-3">
          <strong data-entry-popup-title></strong>
          <div class="d-flex align-items-center gap-2">
            <button type="button" class="btn btn-sm btn-outline-secondary" data-entry-popup-ctx aria-pressed="false"><i class="bi bi-bug me-1" aria-hidden="true"></i>CTX</button>
            <button type="button" class="btn-close" aria-label="Close" data-entry-popup-close></button>
          </div>
        </div>
        <div class="card-body p-0"><iframe title="${String(title).replaceAll('"', '&quot;')}" data-entry-popup-frame></iframe></div>
      </div>`;
    const titleNode = backdrop.querySelector('[data-entry-popup-title]');
    if (titleNode) titleNode.textContent = title;
    const frame = backdrop.querySelector('[data-entry-popup-frame]');
    if (!(frame instanceof HTMLIFrameElement)) {
      if (v2Surface) popupRuntime?.closeUiLevel?.(v2Surface);
      return null;
    }
    frame.setAttribute('aria-hidden', 'true');
    frame.src = url;
    const popupCard = backdrop.querySelector('.metadata-entry-popup');
    if (popupCard instanceof HTMLElement) {
      popupCard.classList.add('is-positioned');
      popupCard.style.left = `${popupPlacement.x}px`;
      popupCard.style.top = `${popupPlacement.y}px`;
    }
    let originalPopupHeight = null;
    let originalPopupTop = null;
    let estimatedHeightDifference = 0;
    // Calibration from rendered popup fixtures: the intrinsic-content estimate
    // is consistently about 25 px too short. The correction belongs to the
    // generic popup sizing model and is applied automatically on opening and
    // whenever the hosted surface changes its active tab/internal layout.
    const POPUP_HEIGHT_ESTIMATE_CORRECTION = 25;

    /*
     * Height fitting is independent from popup cascade placement. The opening
     * geometry establishes this popup's baseline center; applying a delta grows
     * or shrinks around that center. Only viewport clamping may move the center.
     */
    const popupHeightLimits = () => {
      const maximum = Math.max(280, window.innerHeight - 32);
      const minimum = Math.min(280, maximum);
      return { minimum, maximum };
    };

    const clampPopupHeight = (height) => {
      const { minimum, maximum } = popupHeightLimits();
      return Math.max(minimum, Math.min(maximum, Math.round(Number(height) || minimum)));
    };

    const applyPopupHeightDifference = (difference) => {
      if (
        !(popupCard instanceof HTMLElement) ||
        originalPopupHeight == null ||
        originalPopupTop == null
      )
        return;

      const targetHeight = clampPopupHeight(originalPopupHeight + Number(difference || 0));
      const baselineCenterY = originalPopupTop + originalPopupHeight / 2;
      const idealTop = baselineCenterY - targetHeight / 2;
      const maximumTop = Math.max(8, window.innerHeight - targetHeight - 24);
      const targetTop = Math.max(8, Math.min(maximumTop, Math.round(idealTop)));

      popupCard.style.setProperty('height', `${targetHeight}px`, 'important');
      popupCard.style.setProperty('top', `${targetTop}px`, 'important');
      popupCard.dataset.entryPopupHeightApplied = String(targetHeight);
      popupCard.dataset.entryPopupTopApplied = String(targetTop);
    };

    const estimateHostedHeightDifference = () => {
      if (!(popupCard instanceof HTMLElement) || originalPopupHeight == null) return;

      let hostedContentHeight = 0;
      try {
        const hostedDocument = frame.contentDocument;
        if (hostedDocument && hostedWindow) {
          /*
           * Measure the host-neutral entry form's intrinsic vertical extent.
           * formRect.top is meaningful host spacing; mirror at least one normal
           * content gutter below the form so short tabs do not collapse tightly
           * against popup chrome. The body/iframe viewport itself is never a
           * measurement source because it stretches to the popup height.
           */
          const entryForm = hostedDocument.querySelector('.metadata-driven-record-form');
          if (entryForm instanceof hostedWindow.HTMLElement) {
            const formRect = entryForm.getBoundingClientRect();
            const topInset = Math.max(0, formRect.top);
            const bottomGutter = Math.max(24, topInset);
            hostedContentHeight = Math.ceil(formRect.bottom + bottomGutter);
          }
        }
      } catch {
        hostedContentHeight = 0;
      }
      if (!hostedContentHeight) return;

      const headerHeight =
        popupCard.querySelector('.card-header')?.getBoundingClientRect().height || 0;
      const desiredPopupHeight = clampPopupHeight(headerHeight + hostedContentHeight);
      estimatedHeightDifference = Math.round(
        desiredPopupHeight - originalPopupHeight + POPUP_HEIGHT_ESTIMATE_CORRECTION,
      );
      applyPopupHeightDifference(estimatedHeightDifference);
    };

    const scheduleHostedHeightEstimate = () => {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => estimateHostedHeightDifference());
      });
    };

    const ctxButton = backdrop.querySelector('[data-entry-popup-ctx]');
    if (
      !document.getElementById('developerToolsDock') ||
      document.getElementById('developerToolsDock')?.classList.contains('d-none')
    ) {
      ctxButton?.classList.add('d-none');
    } else {
      ctxButton?.addEventListener('click', () => {
        const raised = popupRuntime?.toggleInspection?.({
          path: popupPath,
          button: ctxButton,
        });
        ctxButton?.setAttribute('aria-pressed', String(Boolean(raised)));
      });
    }

    let hostedWindow = null;
    let hostedTabHandler = null;
    let hostedMutationObserver = null;

    const syncHostedPresentation = () => {
      let canonicalTitle = '';
      try {
        canonicalTitle = String(
          frame.contentDocument?.querySelector('.workspace-titlebar h1')?.textContent || '',
        )
          .replace(/\s+/g, ' ')
          .trim();
      } catch {
        canonicalTitle = '';
      }
      if (!canonicalTitle) return;
      if (titleNode) titleNode.textContent = canonicalTitle;
      frame.title = canonicalTitle;

      if (v2Surface && runtime?.get) {
        const current = runtime.get(v2Surface.path);
        const currentPresentation =
          current?.control?.presentation && typeof current.control.presentation === 'object'
            ? current.control.presentation
            : {};
        popupRuntime?.updateUiLevel?.(
          v2Surface,
          {
            control: {
              ...(current?.control || {}),
              presentation: { ...currentPresentation, title: canonicalTitle },
            },
          },
          { source: 'entry-popup', action: 'sync-hosted-entry-title' },
        );
      }
    };

    const detachHostedRuntime = () => {
      if (hostedWindow?.document && hostedTabHandler) {
        hostedWindow.document.removeEventListener('shown.bs.tab', hostedTabHandler);
        hostedWindow.document.removeEventListener('click', hostedTabHandler);
      }
      hostedMutationObserver?.disconnect();
      hostedMutationObserver = null;
      hostedWindow = null;
      hostedTabHandler = null;
    };

    frame.addEventListener('load', () => {
      detachHostedRuntime();
      try {
        hostedWindow = frame.contentWindow;
        if (!hostedWindow) return;
        hostedTabHandler = (event) => {
          if (event.type === 'click') {
            const target = event.target instanceof Element ? event.target : null;
            if (!target?.closest('[data-bs-toggle="tab"], [role="tab"]')) return;
          }
          scheduleHostedHeightEstimate();
        };
        syncHostedPresentation();
        hostedWindow.document.addEventListener('shown.bs.tab', hostedTabHandler);
        hostedWindow.document.addEventListener('click', hostedTabHandler);

        /*
         * Re-estimate for semantic/layout redraws rather than observing the
         * iframe's own resized geometry. A ResizeObserver creates a feedback
         * loop: applying a manual height changes the viewport, which can rewrite
         * the user's number. DOM mutations cover collection expand/edit state,
         * hierarchy redraws and other component-owned layout changes, while the
         * Bootstrap tab event covers top-level and nested tabs.
         */
        const hostedEntryForm = hostedWindow.document.querySelector('.metadata-driven-record-form');
        if (hostedEntryForm && typeof hostedWindow.MutationObserver === 'function') {
          hostedMutationObserver = new hostedWindow.MutationObserver(() => {
            scheduleHostedHeightEstimate();
          });
          hostedMutationObserver.observe(hostedEntryForm, {
            subtree: true,
            childList: true,
            attributes: true,
            attributeFilter: ['class', 'hidden', 'aria-expanded', 'style'],
          });
        }

        scheduleHostedHeightEstimate();
      } catch {
        // Same-origin hosting is the normal ManatOS contract. If browser policy
        // prevents access, the outer popup surface still retains lifecycle data.
      }
    });

    const makeSurfaceResult = (outcome, detail = {}) =>
      popupRuntime.surfaceResult(v2Surface, outcome, detail);

    let preparingFallbackTimer = window.setTimeout(() => {
      // Fail open visually rather than trapping the user behind a permanent
      // loading veil if hosted initialization cannot report readiness.
      backdrop.classList.remove('manatos-popup-preparing');
      preparingFallbackTimer = null;
    }, 10000);

    let closing = false;
    const close = (surfaceResult = makeSurfaceResult('closed')) => {
      if (closing) return surfaceResult;
      closing = true;

      const ownIndex = activePopups.findIndex((entry) => entry.token === token);
      if (ownIndex >= 0) {
        const descendants = activePopups.slice(ownIndex + 1).reverse();
        for (const descendant of descendants) descendant.close();
      }

      window.removeEventListener('message', handleMessage);
      if (preparingFallbackTimer != null) window.clearTimeout(preparingFallbackTimer);
      preparingFallbackTimer = null;
      detachHostedRuntime();
      popupRuntime.closeUiLevel(v2Surface);
      popupRuntime?.clearInspection?.(ctxButton);
      backdrop.remove();
      const index = activePopups.findIndex((entry) => entry.token === token);
      if (index >= 0) activePopups.splice(index, 1);
      resolveReady?.(false);
      window.dispatchEvent(new CustomEvent('manatos:entry-popup-closed'));
      if (typeof onClose === 'function') onClose(surfaceResult);
      return surfaceResult;
    };
    const handleMessage = (event) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data;
      if (!data || data.token !== token) return;
      if (data.type === 'manatos:entry-popup-ready') {
        if (preparingFallbackTimer != null) window.clearTimeout(preparingFallbackTimer);
        preparingFallbackTimer = null;
        backdrop.classList.remove('manatos-popup-preparing');
        popupCard?.classList.remove('manatos-popup-initializing');
        popupCard?.setAttribute('aria-busy', 'false');
        frame.removeAttribute('aria-hidden');
        syncHostedPresentation();
        scheduleHostedHeightEstimate();
        resolveReady?.(true);
      } else if (data.type === 'manatos:entry-popup-saved') {
        const surfaceResult = makeSurfaceResult('saved', {
          value: data.id,
          record: data.record,
          metadata: { entityKey: data.entityKey, representation: data.representation },
        });
        if (typeof onSaved === 'function') onSaved(surfaceResult);
        if (data.close === true) close(surfaceResult);
      } else if (data.type === 'manatos:entry-popup-cancel') {
        close(makeSurfaceResult('cancelled'));
      }
    };
    window.addEventListener('message', handleMessage);
    backdrop
      .querySelector('[data-entry-popup-close]')
      ?.addEventListener('click', () => close(makeSurfaceResult('closed')));
    document.body.append(backdrop);
    if (popupCard instanceof HTMLElement) {
      const originalRect = popupCard.getBoundingClientRect();
      originalPopupHeight = Math.round(originalRect.height);
      originalPopupTop = Math.round(originalRect.top);
    }
    scheduleHostedHeightEstimate();
    activePopups.push({ token, close, ready, descriptor: recoveryDescriptor, frame });
    window.dispatchEvent(new CustomEvent('manatos:entry-popup-opened'));
    return Object.freeze({ close, ready, popupPath, invocation: resolvedInvocation });
  };

  const snapshotDescriptors = () =>
    activePopups.map((entry) => {
      let navigation = [];
      try {
        navigation = [
          ...entry.frame.contentDocument.querySelectorAll(
            '[data-navigation-track-path][data-navigation-track-value]',
          ),
        ]
          .filter(
            (element) =>
              element.classList.contains('active') ||
              element.getAttribute('aria-selected') === 'true',
          )
          .map((element) => ({
            statePath: element.getAttribute('data-navigation-track-path'),
            value: element.getAttribute('data-navigation-track-value'),
          }))
          .filter((item) => item.statePath && item.value);
      } catch {
        // Same-origin hosted entries are the normal contract; navigation state
        // is optional recovery presentation data if browser access is blocked.
      }
      let userChanges = null;
      try {
        userChanges = entry.frame.contentWindow?.ManatOS?.entryRecovery?.getUserChanges?.() ?? null;
      } catch {
        userChanges = null;
      }
      return { ...entry.descriptor, navigation, userChanges };
    });

  const gentleCloseAll = async () => {
    while (activePopups.length) {
      const entry = activePopups[activePopups.length - 1];
      try {
        await entry.frame.contentWindow?.ManatOS?.entryRecovery?.prepareGentleClose?.();
      } catch {
        // Fall through to the normal popup close action/fallback.
      }

      const closed = new Promise((resolve) => {
        const timeout = window.setTimeout(() => resolve(false), 1500);
        const handler = () => {
          window.clearTimeout(timeout);
          resolve(true);
        };
        window.addEventListener('manatos:entry-popup-closed', handler, { once: true });
      });

      let clicked = false;
      try {
        const button = entry.frame.contentDocument?.querySelector('[data-form-close-cancel]');
        if (button instanceof entry.frame.contentWindow.HTMLElement) {
          button.click();
          clicked = true;
        }
      } catch {
        clicked = false;
      }

      if (!clicked) entry.close();
      if ((await closed) !== true && activePopups.includes(entry)) entry.close();
    }
  };

  const restoreDescriptor = async (descriptor) => {
    if (!descriptor || descriptor.type !== 'entry' || !descriptor.url) return true;
    const token = globalThis.crypto?.randomUUID?.() || `entry-${Date.now()}-${Math.random()}`;
    const targetUrl = new URL(descriptor.url, window.location.origin);
    targetUrl.searchParams.set('_entryPopup', '1');
    targetUrl.searchParams.set('_entryPopupToken', token);
    targetUrl.searchParams.set('_entryMode', descriptor.mode || 'view');
    const restored = open({
      token,
      title: descriptor.title || 'Entry',
      url: `${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}`,
      entityKey: descriptor.entityKey || null,
      mode: descriptor.mode || 'view',
      invocation: descriptor.invocation || {},
    });
    if (!restored || (await restored.ready) !== true) {
      throw new Error(`Could not restore popup ${descriptor.title || descriptor.url}.`);
    }

    // The popup itself has now completed its normal hosted-entry lifecycle.
    // Re-select its remembered tabs before the recovery loop opens the next
    // nested popup, preserving parent presentation/lifecycle ordering.
    const popupEntry = activePopups.find((entry) => entry.token === token);
    const hostedDocument = popupEntry?.frame?.contentDocument;
    if (hostedDocument && Array.isArray(descriptor.navigation)) {
      for (const navigation of descriptor.navigation) {
        const candidates = [
          ...hostedDocument.querySelectorAll(
            '[data-navigation-track-path][data-navigation-track-value]',
          ),
        ];
        const target = candidates.find(
          (element) =>
            element.getAttribute('data-navigation-track-path') === navigation?.statePath &&
            element.getAttribute('data-navigation-track-value') === navigation?.value,
        );
        if (!(target instanceof hostedDocument.defaultView.HTMLElement)) continue;
        const tab = hostedDocument.defaultView.bootstrap?.Tab?.getOrCreateInstance(target);
        if (!tab) continue;
        const shown = new Promise((resolve) => {
          target.addEventListener('shown.bs.tab', () => resolve(true), { once: true });
          window.setTimeout(() => resolve(false), 2_000);
        });
        tab.show();
        await shown;
      }
    }
    if (descriptor.userChanges) {
      popupEntry?.frame?.contentWindow?.ManatOS?.entryRecovery?.applyUserChanges?.(
        descriptor.userChanges,
      );
    }
    return true;
  };

  const restoreSequentially = async (descriptors = []) => {
    for (const descriptor of descriptors) await restoreDescriptor(descriptor);
  };

  /*
   * Related collections obey the owning entry's interaction mode. A collection
   * rendered by a view/readonly entry may still expose a row as navigable, but
   * that navigation must itself remain view-only. The component marks those
   * anchors generically; this handler opens the canonical related entry popup
   * without knowing the parent or related entity type.
   */
  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const link = target?.closest('a[data-related-entry-view-popup]');
    if (!(link instanceof HTMLAnchorElement)) return;

    event.preventDefault();
    const popup = window.ManatOS?.popup?.entry;
    if (!popup?.open) return;

    const token = globalThis.crypto?.randomUUID?.() || `entry-${Date.now()}-${Math.random()}`;
    const targetUrl = new URL(link.href, window.location.origin);
    targetUrl.searchParams.set('_entryPopup', '1');
    targetUrl.searchParams.set('_entryPopupToken', token);
    targetUrl.searchParams.set('_entryMode', 'view');
    popup.open({
      token,
      title: link.dataset.relatedEntryTitle || link.textContent?.trim() || 'View entry',
      url: `${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}`,
      entityKey: link.dataset.relatedEntryEntityKey || null,
      mode: 'view',
      invocation: {
        purpose: 'view',
        presentation: { layout: 'entry' },
      },
    });
  });

  let exportedOpen = open;
  if (document.body.classList.contains('entry-popup-host')) {
    document.addEventListener('click', (event) => {
      const target =
        event.target instanceof Element ? event.target.closest('[data-form-close-cancel]') : null;
      if (!target) return;
      const token = document.querySelector('input[name="_entryPopupToken"]')?.value || '';
      if (!token) return;
      event.preventDefault();
      parent.postMessage({ type: 'manatos:entry-popup-cancel', token }, window.location.origin);
    });

    /*
     * Hosted entries delegate any child entry popup to their owning window.
     * This keeps every popup in one DOM/SurfaceRuntime stack, so a popup opened
     * from another popup becomes a true nested POPUP · ENTRY child instead of a
     * second application shell living inside the iframe.
     */
    try {
      if (parent !== window && typeof parent.ManatOS?.popup?.entry?.open === 'function') {
        exportedOpen = (options) => parent.ManatOS.popup.entry.open(options);
      }
    } catch {
      // Same-origin hosting is the normal contract; local open remains a safe fallback.
    }
  }

  window.ManatOS = window.ManatOS || {};
  window.ManatOS.popup = window.ManatOS.popup || {};
  window.ManatOS.popup.entry = Object.freeze({
    open: exportedOpen,
    snapshotDescriptors,
    gentleCloseAll,
    restoreSequentially,
    restoreDescriptor,
  });
})();
