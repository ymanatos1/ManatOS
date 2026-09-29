/**
 * Generic hosted metadata-entry popup.
 *
 * The popup hosts the ordinary metadata-driven Entry surface directly in the
 * current document. The server still owns canonical SSR markup/factual bootstrap,
 * while the outer UiRuntime owns the one popup UiLevel and semantic CTX. There is
 * no iframe, second application shell, or cross-window semantic bridge.
 */
(() => {
  const activePopups = [];
  const openingMetrics = [];
  const metricsEnabled = () => Boolean(document.getElementById('developerToolsDock'));
  const roundedMs = (value) => Math.max(0, Math.round(Number(value || 0) * 10) / 10);
  const publishOpeningMetric = (metric) => {
    if (!metric) return;
    openingMetrics.push(Object.freeze({ ...metric }));
    if (openingMetrics.length > 100) openingMetrics.splice(0, openingMetrics.length - 100);
    const latest = openingMetrics.at(-1);
    window.dispatchEvent(new CustomEvent('manatos:entry-opening-measured', { detail: latest }));

    // Developer-only runtime telemetry is mirrored through the UI server so the
    // same measurement visible through ManatOS.popup.entry.measurements() is also
    // captured by verify-run.log. This is diagnostic bookkeeping only: failure to
    // write the log must never affect popup opening or semantic CTX state.
    if (metricsEnabled() && latest) {
      const csrf = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '';
      if (window.ManatOS?.clientDiagnostics?.send) {
        window.ManatOS.clientDiagnostics.send({ type: 'entry-opening-measurement', ...latest });
      } else {
        void fetch('/bo/debug/ui-runtime/entry-opening-measurement', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ _csrf: csrf, measurement: latest }),
          keepalive: true,
        }).catch(() => {});
      }
    }
  };

  const open = ({
    url,
    token,
    title = 'Entry',
    entityKey = null,
    mode = 'view',
    invocation = {},
    request = null,
    onSaved = null,
    onClose = null,
  } = {}) => {
    if (!url || !token) return null;

    const measureOpening = metricsEnabled();
    const requestedAt = performance.now();
    let hostMountedAt = null;
    let spinnerShownAt = null;

    const requestMethod = String(request?.method || 'GET').toUpperCase();
    // Direct same-document hosting is canonical: every popup owns one re-entrant Entry surface.
    const popupRuntime = window.ManatOS?.popup?.runtime;
    const resolvedInvocation = Object.freeze({ ...invocation });
    const compactEntry = resolvedInvocation.presentation?.entryDensity === 'compact';
    const recoverable = resolvedInvocation.behavior?.recoverable !== false;
    const requestedWidth = compactEntry ? 540 : 1120;
    const requestedHeight = compactEntry ? 300 : 820;
    const anchorToTrigger = resolvedInvocation.presentation?.anchorToTrigger === true;
    const popupPlacement = popupRuntime?.preparePopupPlacement?.({
      width: requestedWidth,
      height: requestedHeight,
      anchorToTrigger,
    }) ?? {
      x: Math.max(
        8,
        Math.round((window.innerWidth - Math.min(requestedWidth, window.innerWidth - 48)) / 2),
      ),
      y: Math.max(
        8,
        Math.round((window.innerHeight - Math.min(requestedHeight, window.innerHeight - 48)) / 2),
      ),
      openedPopupsCounter: 0,
    };
    const recoveryUrl = (() => {
      const parsed = new URL(url, window.location.origin);
      parsed.searchParams.delete('_entryToken');
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
      ...(request ? { request: { ...request, fields: { ...(request.fields || {}) } } } : {}),
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
        entryDensity: compactEntry ? 'compact' : 'normal',
      },
      state: { popup: { ...popupPlacement } },
      supportsUserChanges: recoverable && mode !== 'view',
    });
    // A hosted entry popup is always a canonical child V2 surface. Do not
    // create a parallel ctx.ui...popup projection or silently fall back to the
    // owning entry: one popup invocation has one CTX owner.
    if (!v2Surface) return null;
    const popupPath = v2Surface.path;

    const backdrop = document.createElement('div');
    backdrop.className = 'manatos-popup-backdrop manatos-popup-preparing';
    backdrop.dataset.entryPopupBackdrop = '';
    let slowOpeningTimer = window.setTimeout(() => {
      backdrop.classList.add('manatos-popup-show-spinner');
      if (measureOpening && spinnerShownAt == null) spinnerShownAt = performance.now();
      slowOpeningTimer = null;
    }, 220);
    backdrop.innerHTML = `
      <div class="card shadow-lg metadata-entry-popup manatos-popup-initializing" role="dialog" aria-modal="true" aria-busy="true">
        <div class="card-header d-flex align-items-center justify-content-between gap-3">
          <strong data-entry-popup-title data-v2-layout-caption="surface"></strong>
          <span class="surface-owner-context-badge badge text-bg-light border d-none" data-owner-context-badge></span>
          <div class="d-flex align-items-center gap-2">
            <button type="button" class="btn btn-sm btn-outline-secondary" data-entry-popup-ctx aria-pressed="false"><i class="bi bi-bug me-1" aria-hidden="true"></i>CTX</button>
            <button type="button" class="btn-close" aria-label="Close" data-entry-popup-close></button>
          </div>
        </div>
        <div class="card-body p-0" data-entry-popup-content></div>
      </div>`;
    const titleNode = backdrop.querySelector('[data-entry-popup-title]');
    if (titleNode) titleNode.textContent = title;
    const ownerBadge = backdrop.querySelector('[data-owner-context-badge]');
    if (ownerBadge instanceof HTMLElement) {
      const popupSurface = window.ManatOS?.ctx?.get?.(popupPath) || null;
      const ownerPresentation = window.ManatOS?.ownerContextPresentation?.(popupSurface) || null;
      ownerBadge.classList.toggle('d-none', !ownerPresentation);
      ownerBadge.textContent = ownerPresentation?.label || '';
      ownerBadge.title = ownerPresentation?.title || '';
    }
    const contentHost = backdrop.querySelector('[data-entry-popup-content]');
    if (!(contentHost instanceof HTMLElement)) {
      popupRuntime?.closeUiLevel?.(v2Surface);
      return null;
    }
    const popupCard = backdrop.querySelector('.metadata-entry-popup');
    if (popupCard instanceof HTMLElement) {
      popupCard.dataset.uiLevelRoot = '';
      popupCard.dataset.ctxScopePath = popupPath;
    }
    if (popupCard instanceof HTMLElement) {
      popupCard.classList.add('is-positioned');
      popupCard.classList.toggle('is-compact-entry', compactEntry);
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
    const POPUP_HEIGHT_ESTIMATE_CORRECTION = compactEntry ? 18 : 25;

    /*
     * Height fitting is independent from popup cascade placement. The opening
     * geometry establishes this popup's baseline center; applying a delta grows
     * or shrinks around that center. Only viewport clamping may move the center.
     */
    const popupHeightLimits = () => {
      const requestedMinimum = 280;
      const maximum = Math.max(requestedMinimum, window.innerHeight - 32);
      const minimum = Math.min(requestedMinimum, maximum);
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
      const idealTop = anchorToTrigger ? originalPopupTop : baselineCenterY - targetHeight / 2;
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
      const entryForm = contentHost.querySelector('.metadata-driven-record-form');
      if (entryForm instanceof HTMLElement) {
        const formRect = entryForm.getBoundingClientRect();
        const hostRect = contentHost.getBoundingClientRect();
        const topInset = Math.max(0, formRect.top - hostRect.top);
        const bottomGutter = compactEntry ? Math.max(12, topInset) : Math.max(24, topInset);
        const intrinsicFormHeight = Math.max(
          formRect.height,
          entryForm.scrollHeight,
          entryForm.offsetHeight,
        );
        hostedContentHeight = Math.ceil(topInset + intrinsicFormHeight + bottomGutter);
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

    let hostedMutationObserver = null;
    let hostedTabHandler = null;
    let hostedViewHandler = null;

    const syncDirectViewTools = () => {
      const form = contentHost.querySelector('form[data-v2-entry-form]');
      const source = form?.querySelector(
        '[data-entry-view-tools-caption-source] [data-surface-tools-anchor][data-surface-tools-kind="entry"]',
      );
      const oldCaptionTools = backdrop.querySelector('[data-entry-popup-view-tools]');
      oldCaptionTools?.remove();
      if (!(source instanceof HTMLElement) || !(ctxButton instanceof HTMLElement)) return;
      const captionTools = document.createElement('div');
      captionTools.dataset.entryPopupViewTools = '';
      captionTools.className = 'd-flex align-items-center gap-2';
      captionTools.dataset.surfaceToolsAnchor = '';
      captionTools.dataset.surfaceToolsKind = 'entry';
      captionTools.dataset.surfaceToolsDirection = 'end';
      captionTools.dataset.entryUiViewKey = source.dataset.entryUiViewKey || '';
      captionTools.dataset.entryUiViewCatalog = source.dataset.entryUiViewCatalog || '[]';
      if (form?.dataset?.ctxScopePath)
        captionTools.dataset.surfaceToolsCtxPath = form.dataset.ctxScopePath;
      ctxButton.parentElement?.insertBefore(captionTools, ctxButton);
      window.ManatOS?.surfaceTools?.render?.(captionTools);
    };

    const detachHostedRuntime = () => {
      if (hostedTabHandler) {
        document.removeEventListener('shown.bs.tab', hostedTabHandler);
        document.removeEventListener('click', hostedTabHandler);
      }
      if (hostedViewHandler) {
        window.removeEventListener('manatos:entry-view-rematerialized', hostedViewHandler);
      }
      hostedMutationObserver?.disconnect();
      hostedMutationObserver = null;
      hostedTabHandler = null;
      hostedViewHandler = null;
    };

    const directRequest = async () => {
      const hostedUrl = new URL(url, window.location.origin);
      hostedUrl.searchParams.set('_entryDirectHost', '1');
      hostedUrl.searchParams.set('_entryCtxPath', popupPath);
      const options = { credentials: 'same-origin', headers: { Accept: 'application/json' } };
      if (requestMethod === 'POST') {
        options.method = 'POST';
        const body = new URLSearchParams();
        for (const [name, value] of Object.entries(request?.fields || {})) {
          body.set(name, typeof value === 'string' ? value : JSON.stringify(value ?? ''));
        }
        body.set('_entryDirectHost', '1');
        body.set('_entryCtxPath', popupPath);
        body.set('_entryHost', 'popup');
        body.set('_entryMode', mode);
        options.body = body;
        options.headers['Content-Type'] = 'application/x-www-form-urlencoded;charset=UTF-8';
      }
      const response = await fetch(hostedUrl, options);
      const payload = await response.json().catch(() => null);
      if (
        !response.ok ||
        payload?.success !== true ||
        !payload?.data?.html ||
        !payload?.data?.bootstrap
      ) {
        throw new Error(
          payload?.error?.message || `Entry host request failed (HTTP ${response.status}).`,
        );
      }
      return payload.data;
    };

    const activateDirectHostScripts = (host) => {
      // Assigning trusted same-origin SSR markup through innerHTML does not execute
      // script elements. Full-document entry pages do execute those component
      // bootstraps, so a direct popup host must perform the equivalent physical
      // mount step. This is a browser-host adapter responsibility only: semantic
      // entry/collection state has already been hydrated into typed CTX.
      for (const inertScript of [...host.querySelectorAll('script')]) {
        const script = document.createElement('script');
        for (const attribute of [...inertScript.attributes]) {
          script.setAttribute(attribute.name, attribute.value);
        }
        script.textContent = inertScript.textContent;
        inertScript.replaceWith(script);
      }
    };

    const mountDirectEntry = async () => {
      const data = await directRequest();
      const runtime = window.ManatOS?.ctx;
      for (const rootKey of ['entities', 'enums']) {
        const incoming = data.context?.[rootKey];
        if (!incoming || typeof incoming !== 'object' || !runtime?.replace) continue;
        const current = runtime.get?.(`ctx.${rootKey}`);
        runtime.replace(
          `ctx.${rootKey}`,
          { ...(current && typeof current === 'object' ? current : {}), ...incoming },
          { source: 'entry-popup', action: 'merge-direct-host-context', triggerPath: popupPath },
        );
      }
      if (popupRuntime?.hydrateEntrySurface?.(v2Surface, data.bootstrap) !== true) {
        throw new Error('Direct entry CTX hydration failed.');
      }
      contentHost.innerHTML = data.html;
      activateDirectHostScripts(contentHost);
      window.ManatOS?.entrySurfaces?.scan?.(contentHost);
      const form = contentHost.querySelector('form[data-v2-entry-form]');
      if (!(form instanceof HTMLFormElement)) {
        throw new Error('Direct entry markup did not contain an Entry form.');
      }
      if (form.dataset.ctxScopePath !== popupPath) {
        throw new Error('Direct entry markup was rendered for the wrong CTX owner.');
      }
      // A uiView switch reuses this canonical entry URL to request only a fresh
      // physical materialization. Typed CTX remains the semantic owner.
      form.dataset.entryMaterializeUrl = String(url);

      if (data.title) {
        if (titleNode) {
          titleNode.textContent = String(data.title)
            .replace(/\s+-\s+ManatOS\s*$/, '')
            .trim();
        }
      }
      syncDirectViewTools();
      hostedViewHandler = (event) => {
        const rematerializedForm = event instanceof CustomEvent ? event.detail?.form : null;
        if (
          rematerializedForm instanceof HTMLFormElement &&
          contentHost.contains(rematerializedForm)
        ) {
          hostedMutationObserver?.disconnect();
          hostedMutationObserver?.observe(rematerializedForm, {
            subtree: true,
            childList: true,
            attributes: true,
            attributeFilter: ['class', 'hidden', 'aria-expanded', 'style'],
          });
        }
        syncDirectViewTools();
        scheduleHostedHeightEstimate();
      };
      window.addEventListener('manatos:entry-view-rematerialized', hostedViewHandler);
      hostedTabHandler = (event) => {
        if (event.type === 'click') {
          const target = event.target instanceof Element ? event.target : null;
          if (
            !contentHost.contains(target) ||
            !target?.closest('[data-bs-toggle="tab"], [role="tab"]')
          )
            return;
        }
        scheduleHostedHeightEstimate();
      };
      document.addEventListener('shown.bs.tab', hostedTabHandler);
      document.addEventListener('click', hostedTabHandler);
      hostedMutationObserver = new MutationObserver(() => scheduleHostedHeightEstimate());
      hostedMutationObserver.observe(form, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['class', 'hidden', 'aria-expanded', 'style'],
      });

      await window.ManatOS?.entryInitialization?.forForm?.(form)?.readyForWork?.();
      if (preparingFallbackTimer != null) window.clearTimeout(preparingFallbackTimer);
      preparingFallbackTimer = null;
      if (slowOpeningTimer != null) window.clearTimeout(slowOpeningTimer);
      slowOpeningTimer = null;
      backdrop.classList.remove('manatos-popup-preparing', 'manatos-popup-show-spinner');
      popupCard?.classList.remove('manatos-popup-initializing');
      popupCard?.setAttribute('aria-busy', 'false');
      scheduleHostedHeightEstimate();
      resolveReady?.(true);
      if (measureOpening) {
        const readyAt = performance.now();
        window.requestAnimationFrame(() =>
          publishOpeningMetric({
            token,
            entityKey,
            mode,
            uiViewKey: resolvedInvocation.uiViewKey || null,
            density: compactEntry ? 'compact' : 'normal',
            clickToHostMountedMs:
              hostMountedAt == null ? null : roundedMs(hostMountedAt - requestedAt),
            clickToReadyMs: roundedMs(readyAt - requestedAt),
            clickToFirstVisibleContentMs: roundedMs(performance.now() - requestedAt),
            spinnerShown: spinnerShownAt != null,
            spinnerShownAfterMs:
              spinnerShownAt == null ? null : roundedMs(spinnerShownAt - requestedAt),
            hostStrategy: 'direct',
          }),
        );
      }
      return form;
    };

    const makeSurfaceResult = (outcome, detail = {}) =>
      popupRuntime.surfaceResult(v2Surface, outcome, detail);

    let preparingFallbackTimer = window.setTimeout(() => {
      // Fail open visually rather than trapping the user behind a permanent
      // loading veil if hosted initialization cannot report readiness.
      backdrop.classList.remove('manatos-popup-preparing');
      preparingFallbackTimer = null;
    }, 10000);

    let closing = false;
    const close = (surfaceResult = makeSurfaceResult('closed'), uiLevelAlreadyClosed = false) => {
      if (closing) return surfaceResult;
      closing = true;

      const ownIndex = activePopups.findIndex((entry) => entry.token === token);
      if (ownIndex >= 0) {
        const descendants = activePopups.slice(ownIndex + 1).reverse();
        for (const descendant of descendants) descendant.close();
      }

      window.removeEventListener('manatos:entry-popup-saved', handleSaved);
      window.removeEventListener('manatos:surface-cancellation-confirmed', confirmedCancelHandler);
      if (preparingFallbackTimer != null) window.clearTimeout(preparingFallbackTimer);
      preparingFallbackTimer = null;
      if (slowOpeningTimer != null) window.clearTimeout(slowOpeningTimer);
      slowOpeningTimer = null;
      detachHostedRuntime();
      unregisterDismiss?.();
      unbindDismissTarget?.();
      // Ordinary visual-host retirement closes its UiLevel through the popup
      // runtime. Canonical surfaceClosure confirmations arrive only after the
      // UiLevel has already been closed, so never issue a second close there.
      if (!uiLevelAlreadyClosed) popupRuntime.closeUiLevel(v2Surface);
      popupRuntime?.clearInspection?.(ctxButton);
      backdrop.remove();
      const index = activePopups.findIndex((entry) => entry.token === token);
      if (index >= 0) activePopups.splice(index, 1);
      const resumedParent = activePopups.at(-1);
      if (resumedParent?.backdrop instanceof HTMLElement) {
        resumedParent.backdrop.style.pointerEvents = '';
        resumedParent.backdrop.removeAttribute('aria-hidden');
      }
      resolveReady?.(false);
      window.dispatchEvent(new CustomEvent('manatos:entry-popup-closed'));
      if (typeof onClose === 'function') onClose(surfaceResult);
      return surfaceResult;
    };
    let pendingSavedCloseResult = null;
    const handleSaved = (event) => {
      const data = event?.detail;
      if (!data || data.token !== token) return;
      const surfaceResult = makeSurfaceResult('saved', {
        value: data.id,
        record: data.record,
        metadata: {
          entityKey: data.entityKey,
          representation: data.representation,
          ownerResult: data.ownerResult ?? null,
          ownerAccepted: data.ownerAccepted === true,
        },
      });
      if (typeof onSaved === 'function') onSaved(surfaceResult);
      if (data.close === true) {
        pendingSavedCloseResult = surfaceResult;
        requestHostedCancel();
      }
    };
    window.addEventListener('manatos:entry-popup-saved', handleSaved);

    const requestHostedCancel = () => {
      const cancel = contentHost.querySelector('[data-cancel-operation], [data-form-close-cancel]');
      if (cancel instanceof HTMLElement) {
        void window.ManatOS?.surfaceClosure?.requestTrigger?.(cancel, popupPath);
        return makeSurfaceResult('cancel-requested');
      }
      return close(makeSurfaceResult('cancelled'));
    };

    const confirmedCancelHandler = (event) => {
      if (event.detail?.path !== popupPath) return;
      const result = pendingSavedCloseResult || makeSurfaceResult('cancelled');
      pendingSavedCloseResult = null;
      close(result, true);
    };
    window.addEventListener('manatos:surface-cancellation-confirmed', confirmedCancelHandler);

    const unregisterDismiss = popupRuntime.registerDismissHandler?.(v2Surface, () =>
      requestHostedCancel(),
    );
    const unbindDismissTarget = popupRuntime.bindDismissTarget?.(v2Surface, backdrop);
    backdrop.querySelector('[data-entry-popup-close]')?.addEventListener('click', () => {
      popupRuntime.requestDismiss?.(v2Surface, 'close-button');
    });
    // Popup DOM surfaces are siblings. CTX nesting is lifecycle ownership, not DOM nesting.
    const parentPopup = activePopups.at(-1);
    if (parentPopup?.backdrop instanceof HTMLElement) {
      parentPopup.backdrop.style.pointerEvents = 'none';
      parentPopup.backdrop.setAttribute('aria-hidden', 'true');
    }
    backdrop.style.zIndex = String(1100 + activePopups.length * 20);
    document.body.append(backdrop);
    // The popup shell is not yet a rendered Entry surface here. Direct-host CTX
    // hydration and entity-registry enrichment happen in mountDirectEntry(); the
    // canonical Entry form runtime publishes manatos:ui-surface-rendered only after
    // that boundary is complete. Publishing it from the empty shell races typed
    // Entry adoption against metadata registration for heterogeneous owned entries.
    if (measureOpening) hostMountedAt = performance.now();

    void mountDirectEntry().catch((error) => {
      console.error('[ManatOS] Direct Entry popup mount failed.', error);
      resolveReady?.(false);
      close(makeSurfaceResult('failed', { error: String(error?.message || error) }));
    });
    if (resolvedInvocation.presentation?.autoCloseOnBackdrop === true) {
      backdrop.addEventListener('mousedown', (event) => {
        if (event.target === backdrop) requestHostedCancel();
      });
    }
    if (popupCard instanceof HTMLElement) {
      const originalRect = popupCard.getBoundingClientRect();
      originalPopupHeight = Math.round(originalRect.height);
      originalPopupTop = Math.round(originalRect.top);
    }
    scheduleHostedHeightEstimate();
    activePopups.push({
      token,
      backdrop,
      close,
      ready,
      descriptor: recoveryDescriptor,
      contentHost,
      popupPath,
      recoverable,
    });
    window.dispatchEvent(new CustomEvent('manatos:entry-popup-opened'));
    return Object.freeze({ token, close, ready, popupPath, invocation: resolvedInvocation });
  };

  const snapshotDescriptors = () =>
    activePopups
      .filter((entry) => entry.recoverable !== false)
      .map((entry) => {
        let navigation = [];
        try {
          navigation = [
            ...entry.contentHost.querySelectorAll(
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
          const form = entry.contentHost?.querySelector('form[data-v2-entry-form]');
          userChanges =
            window.ManatOS?.entrySurfaces?.recoveryAdapter?.(form)?.getUserChanges?.() ?? null;
        } catch {
          userChanges = null;
        }
        return { ...entry.descriptor, path: entry.popupPath || null, navigation, userChanges };
      });

  const gentleCloseAll = async () => {
    while (activePopups.length) {
      const entry = activePopups[activePopups.length - 1];
      try {
        const form = entry.contentHost?.querySelector('form[data-v2-entry-form]');
        await window.ManatOS?.entrySurfaces?.recoveryAdapter?.(form)?.prepareGentleClose?.();
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
        const button = entry.contentHost?.querySelector('[data-form-close-cancel]');
        if (button instanceof HTMLElement) {
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
    const restored = openEntry({
      target: { entityKey: descriptor.entityKey || null, url: descriptor.url },
      title: descriptor.title || 'Entry',
      mode: descriptor.mode || 'view',
      purpose: descriptor.invocation?.purpose || 'view',
      uiViewKey: descriptor.invocation?.uiViewKey || null,
      presentation: descriptor.invocation?.presentation || {},
      behavior: descriptor.invocation?.behavior || {},
      request: descriptor.request
        ? { ...descriptor.request, fields: { ...(descriptor.request.fields || {}) } }
        : null,
    });
    if (!restored || (await restored.ready) !== true) {
      throw new Error(`Could not restore popup ${descriptor.title || descriptor.url}.`);
    }
    const token = restored.token;

    // The popup itself has now completed its normal hosted-entry lifecycle.
    // Re-select its remembered tabs before the recovery loop opens the next
    // nested popup, preserving parent presentation/lifecycle ordering.
    const popupEntry = activePopups.find((entry) => entry.token === token);
    const hostedDocument = popupEntry?.contentHost;
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
        if (!(target instanceof HTMLElement)) continue;
        const tab = window.bootstrap?.Tab?.getOrCreateInstance(target);
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
      const form = popupEntry?.contentHost?.querySelector('form[data-v2-entry-form]');
      window.ManatOS?.entrySurfaces
        ?.recoveryAdapter?.(form)
        ?.applyUserChanges?.(descriptor.userChanges);
    }
    return true;
  };

  const restoreSequentially = async (descriptors = []) => {
    for (const descriptor of descriptors) await restoreDescriptor(descriptor);
  };

  /*
   * Semantic entry links and metadata list actions share one canonical opener.
   * Callers describe intent only; correlation and HTTP transport are derived once.
   */
  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const link = target?.closest('a[data-entry-link], a[data-open-entry-popup]');
    if (!(link instanceof HTMLAnchorElement)) return;
    const listAction = link.matches('[data-open-entry-popup]');

    event.preventDefault();
    const entryOpening = window.ManatOS?.entryOpening;
    if (!entryOpening?.open) return;
    const targetUrl = new URL(link.href, window.location.origin);
    entryOpening.open({
      host: 'popup',
      target: {
        entityKey: listAction
          ? link.dataset.entryPopupEntityKey || null
          : link.dataset.entryLinkEntityKey || null,
        url: `${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}`,
      },
      mode: listAction ? link.dataset.entryPopupMode || 'view' : 'view',
      uiViewKey: listAction ? link.dataset.entryPopupUiView || null : null,
      title:
        link.getAttribute('aria-label') || link.title || link.textContent?.trim() || 'View entry',
      purpose: 'view',
      presentation: { layout: 'entry' },
    });
  });

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
    const entryOpening = window.ManatOS?.entryOpening;
    if (!entryOpening?.open) return;

    const targetUrl = new URL(link.href, window.location.origin);
    entryOpening.open({
      host: 'popup',
      target: {
        entityKey: link.dataset.relatedEntryEntityKey || null,
        url: `${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}`,
      },
      title: link.dataset.relatedEntryTitle || link.textContent?.trim() || 'View entry',
      mode: 'view',
      purpose: 'view',
      presentation: { layout: 'entry' },
    });
  });

  const openValueObject = ({ entityKey, title = 'Details', record = {}, fields = [] } = {}) => {
    if (!entityKey || !record || typeof record !== 'object') return null;
    const popupRuntime = window.ManatOS?.popup?.runtime;
    const placement = popupRuntime?.preparePopupPlacement?.({ width: 620, height: 420 }) || {
      x: 80,
      y: 80,
      openedPopupsCounter: 0,
    };
    const handle = popupRuntime?.openUiLevel?.({
      kind: 'entry',
      mode: 'view',
      name: `${entityKey}-entry`,
      entityKey,
      invocation: { purpose: 'view-value-object' },
      presentation: { title, layout: 'entry', entryDensity: 'compact' },
      state: { popup: { ...placement } },
      entry: { original: record, current: record },
    });
    if (!handle) return null;

    const backdrop = document.createElement('div');
    backdrop.className = 'manatos-popup-backdrop';
    backdrop.dataset.valueObjectPopup = '';
    backdrop.style.zIndex = String(1100 + activePopups.length * 20);
    const parentPopup = activePopups.at(-1);
    if (parentPopup?.backdrop instanceof HTMLElement) {
      parentPopup.backdrop.style.pointerEvents = 'none';
      parentPopup.backdrop.setAttribute('aria-hidden', 'true');
    }
    const card = document.createElement('div');
    card.className = 'card shadow-lg metadata-entry-popup is-positioned is-compact-entry';
    card.style.left = `${placement.x}px`;
    card.style.top = `${placement.y}px`;
    card.style.height = 'auto';
    card.style.minHeight = '280px';
    card.innerHTML = `<div class="card-header d-flex align-items-center justify-content-between gap-3">
      <strong data-value-object-title></strong><div class="d-flex align-items-center gap-2">
      <button type="button" class="btn btn-sm btn-outline-secondary" data-value-object-ctx><i class="bi bi-bug me-1" aria-hidden="true"></i>CTX</button>
      <button type="button" class="btn-close" aria-label="Close" data-value-object-close></button></div></div>
      <div class="card-body p-3"><div class="account-summary-grid authentication-summary-grid" data-value-object-fields></div></div>
      <div class="card-footer d-flex justify-content-end"><button type="button" class="btn btn-secondary" data-value-object-footer-close>Close</button></div>`;
    const titleNode = card.querySelector('[data-value-object-title]');
    if (titleNode) titleNode.textContent = title;
    const grid = card.querySelector('[data-value-object-fields]');
    for (const field of fields) {
      const label = document.createElement('div');
      label.className = 'account-summary-label';
      label.textContent = String(field.label || field.key || '');
      const value = document.createElement('div');
      value.className = 'account-summary-value';
      const raw = record[field.key];
      const rendered =
        raw === null || raw === undefined || raw === ''
          ? '—'
          : typeof raw === 'boolean'
            ? raw
              ? 'Yes'
              : 'No'
            : String(raw);
      if (field.representation === 'badge' && rendered !== '—') {
        const badge = document.createElement('span');
        badge.className = 'badge text-bg-secondary';
        badge.textContent = rendered;
        value.append(badge);
      } else if (field.type === 'email' && rendered !== '—') {
        value.classList.add('metadata-compact-value', 'metadata-readonly-email');
        value.title = 'Email address';
        const icon = document.createElement('i');
        icon.className = 'bi bi-envelope';
        icon.setAttribute('aria-hidden', 'true');
        const text = document.createElement('span');
        text.textContent = rendered;
        value.append(icon, text);
      } else {
        value.textContent = rendered;
      }
      grid.append(label, value);
    }
    backdrop.append(card);
    document.body.append(backdrop);
    const token = `value-object-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    let closed = false;
    let unregisterDismiss = null;
    let unbindDismissTarget = null;
    const close = () => {
      if (closed) return;
      closed = true;
      unregisterDismiss?.();
      unbindDismissTarget?.();
      backdrop.remove();
      popupRuntime?.closeUiLevel?.(handle);
      const index = activePopups.findIndex((entry) => entry.token === token);
      if (index >= 0) activePopups.splice(index, 1);
      const resumedParent = activePopups.at(-1);
      if (resumedParent?.backdrop instanceof HTMLElement) {
        resumedParent.backdrop.style.pointerEvents = '';
        resumedParent.backdrop.removeAttribute('aria-hidden');
      }
    };
    unregisterDismiss = popupRuntime?.registerDismissHandler?.(handle, () => {
      close();
      return true;
    });
    unbindDismissTarget = popupRuntime?.bindDismissTarget?.(handle, backdrop);
    card
      .querySelector('[data-value-object-close]')
      ?.addEventListener('click', () => popupRuntime?.requestDismiss?.(handle, 'close-button'));
    card
      .querySelector('[data-value-object-footer-close]')
      ?.addEventListener('click', () =>
        popupRuntime?.requestDismiss?.(handle, 'footer-close-button'),
      );
    card
      .querySelector('[data-value-object-ctx]')
      ?.addEventListener('click', (event) =>
        popupRuntime?.toggleInspection?.({ path: handle.path, button: event.currentTarget }),
      );
    activePopups.push({
      token,
      backdrop,
      close,
      ready: Promise.resolve(true),
      descriptor: null,
    });
    return { close, ready: Promise.resolve(true), surface: handle };
  };

  document.addEventListener('click', (event) => {
    const target =
      event.target instanceof Element ? event.target.closest('[data-value-object-entry]') : null;
    if (!(target instanceof HTMLElement)) return;
    event.preventDefault();
    try {
      const descriptor = JSON.parse(target.dataset.valueObjectEntry || '{}');
      openValueObject(descriptor);
    } catch {
      // Malformed presentation metadata is non-actionable.
    }
  });

  const openProjectedEntry = (opening) => {
    const adapter = window.ManatOS?.entryOpening;
    if (!adapter?.transport) return null;
    const projected = adapter.transport(opening);
    const options = {
      token: opening.token,
      title: opening.title,
      url: projected.url,
      entityKey: opening.target.entityKey,
      mode: opening.mode,
      invocation: projected.invocation,
      request: projected.request,
      onSaved: opening.onSaved,
      onClose: opening.onClose,
    };
    return open(options);
  };

  window.ManatOS = window.ManatOS || {};
  window.ManatOS.entryPopupPresenter = openProjectedEntry;

  const openEntry = (descriptor = {}) =>
    window.ManatOS?.entryOpening?.open?.({ ...descriptor, host: 'popup' }) ?? null;

  const exportedOpen = open;

  window.ManatOS = window.ManatOS || {};
  window.ManatOS.popup = window.ManatOS.popup || {};
  window.ManatOS.popup.entry = Object.freeze({
    open: exportedOpen,
    openValueObject,
    openEntry,
    snapshotDescriptors,
    gentleCloseAll,
    restoreSequentially,
    restoreDescriptor,
    measurements: () => [...openingMetrics],
    clearMeasurements: () => openingMetrics.splice(0),
  });
})();
