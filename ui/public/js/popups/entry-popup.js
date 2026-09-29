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
    let frameLoadedAt = null;
    let spinnerShownAt = null;

    const runtime = window.ManatOS?.ctx;
    const requestMethod = String(request?.method || 'GET').toUpperCase();
    const directReadonlyRequested = mode === 'view' && requestMethod === 'GET';
    const resourcesAtRequest = performance.getEntriesByType?.('resource')?.length ?? null;
    const apiSequenceAtRequest = measureOpening
      ? fetch('/bo/debug/ui-runtime/api-request-sequence', {
          credentials: 'same-origin',
          cache: 'no-store',
        })
          .then((response) => (response.ok ? response.json() : null))
          .then((payload) =>
            Number.isFinite(Number(payload?.sequence)) ? Number(payload.sequence) : null,
          )
          .catch(() => null)
      : Promise.resolve(null);
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
          <strong data-entry-popup-title></strong>
          <div class="d-flex align-items-center gap-2">
            <button type="button" class="btn btn-sm btn-outline-secondary" data-entry-popup-ctx aria-pressed="false"><i class="bi bi-bug me-1" aria-hidden="true"></i>CTX</button>
            <button type="button" class="btn-close" aria-label="Close" data-entry-popup-close></button>
          </div>
        </div>
        <div class="card-body p-0">
          <div data-entry-popup-direct-host hidden></div>
          <iframe title="${String(title).replaceAll('"', '&quot;')}" data-entry-popup-frame></iframe>
        </div>
      </div>`;
    const titleNode = backdrop.querySelector('[data-entry-popup-title]');
    if (titleNode) titleNode.textContent = title;
    const frame = backdrop.querySelector('[data-entry-popup-frame]');
    if (!(frame instanceof HTMLIFrameElement)) {
      if (v2Surface) popupRuntime?.closeUiLevel?.(v2Surface);
      return null;
    }
    frame.setAttribute('aria-hidden', 'true');
    const directHost = backdrop.querySelector('[data-entry-popup-direct-host]');
    let directActive = false;
    let directForm = null;
    const frameName = `manatos-entry-popup-${token}`;
    frame.name = frameName;
    const startRoutedHost = () => {
      const hostedUrl = new URL(url, window.location.origin);
      frame.hidden = false;
      frame.src = `${hostedUrl.pathname}${hostedUrl.search}${hostedUrl.hash}`;
    };
    if (!directReadonlyRequested && requestMethod !== 'POST') startRoutedHost();
    const popupCard = backdrop.querySelector('.metadata-entry-popup');
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
      try {
        const hostedDocument = directActive ? document : frame.contentDocument;
        const hostedRoot = directActive ? directHost : hostedDocument;
        if (hostedDocument && hostedWindow && hostedRoot) {
          /*
           * Measure the host-neutral entry form's intrinsic vertical extent.
           * formRect.top is meaningful host spacing; mirror at least one normal
           * content gutter below the form so short tabs do not collapse tightly
           * against popup chrome. The body/iframe viewport itself is never a
           * measurement source because it stretches to the popup height.
           */
          const entryForm = hostedRoot.querySelector('.metadata-driven-record-form');
          if (entryForm instanceof hostedWindow.HTMLElement) {
            const formRect = entryForm.getBoundingClientRect();
            // Routed entries are measured in their iframe viewport, where formRect.top
            // is already host-relative. Direct entries live in the outer document, so
            // using the viewport coordinate here accidentally counts the popup's page Y
            // position as content height. Normalize it to the direct host instead.
            const hostTop =
              directActive && directHost instanceof HTMLElement
                ? directHost.getBoundingClientRect().top
                : 0;
            const topInset = Math.max(0, formRect.top - hostTop);
            const bottomGutter = compactEntry ? Math.max(12, topInset) : Math.max(24, topInset);
            const intrinsicFormHeight = Math.max(
              formRect.height,
              entryForm.scrollHeight,
              entryForm.offsetHeight,
            );
            hostedContentHeight = Math.ceil(topInset + intrinsicFormHeight + bottomGutter);
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
      if (directActive) return;
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
        directHost?.removeEventListener?.('shown.bs.tab', hostedTabHandler);
        directHost?.removeEventListener?.('click', hostedTabHandler);
      }
      hostedMutationObserver?.disconnect();
      hostedMutationObserver = null;
      hostedWindow = null;
      hostedTabHandler = null;
    };

    frame.addEventListener('load', () => {
      if (directActive) return;
      if (measureOpening && frameLoadedAt == null) frameLoadedAt = performance.now();
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
      if (slowOpeningTimer != null) window.clearTimeout(slowOpeningTimer);
      slowOpeningTimer = null;
      detachHostedRuntime();
      unregisterDismiss?.();
      unbindDismissTarget?.();
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
        if (slowOpeningTimer != null) window.clearTimeout(slowOpeningTimer);
        slowOpeningTimer = null;
        backdrop.classList.remove('manatos-popup-preparing');
        backdrop.classList.remove('manatos-popup-show-spinner');
        popupCard?.classList.remove('manatos-popup-initializing');
        popupCard?.setAttribute('aria-busy', 'false');
        if (directActive) {
          if (directHost instanceof HTMLElement) directHost.hidden = false;
        } else {
          frame.removeAttribute('aria-hidden');
        }
        syncHostedPresentation();
        scheduleHostedHeightEstimate();
        resolveReady?.(true);
        if (measureOpening) {
          const readyAt = performance.now();
          window.requestAnimationFrame(() => {
            const firstVisibleAt = performance.now();
            let hostedNavigationMs = null;
            let hostedResourceCount = null;
            try {
              if (directActive) {
                const resourceNow = performance.getEntriesByType?.('resource')?.length ?? null;
                hostedNavigationMs = 0;
                hostedResourceCount =
                  resourceNow == null || resourcesAtRequest == null
                    ? null
                    : Math.max(0, resourceNow - resourcesAtRequest);
              } else {
                const hostedPerformance = frame.contentWindow?.performance;
                const navigation = hostedPerformance?.getEntriesByType?.('navigation')?.[0];
                hostedNavigationMs = navigation ? roundedMs(navigation.duration) : null;
                hostedResourceCount =
                  hostedPerformance?.getEntriesByType?.('resource')?.length ?? null;
              }
            } catch {
              // Measurement must never affect the same-origin hosted entry lifecycle.
            }
            void (async () => {
              let apiRequestCount = null;
              let apiRequests = null;
              try {
                const startSequence = await apiSequenceAtRequest;
                if (startSequence != null) {
                  const response = await fetch(
                    `/bo/debug/ui-runtime/api-request-summary?after=${encodeURIComponent(startSequence)}`,
                    { credentials: 'same-origin', cache: 'no-store' },
                  );
                  const payload = response.ok ? await response.json() : null;
                  apiRequestCount = Number.isFinite(Number(payload?.count))
                    ? Number(payload.count)
                    : null;
                  apiRequests = Array.isArray(payload?.requests) ? payload.requests : null;
                }
              } catch {
                // Telemetry must never affect entry opening.
              }
              publishOpeningMetric({
                token,
                entityKey,
                mode,
                uiViewKey: resolvedInvocation.uiViewKey || null,
                density: compactEntry ? 'compact' : 'normal',
                clickToHostMountedMs:
                  hostMountedAt == null ? null : roundedMs(hostMountedAt - requestedAt),
                clickToFrameLoadMs:
                  frameLoadedAt == null ? null : roundedMs(frameLoadedAt - requestedAt),
                clickToReadyMs: roundedMs(readyAt - requestedAt),
                clickToFirstVisibleContentMs: roundedMs(firstVisibleAt - requestedAt),
                spinnerShown: spinnerShownAt != null,
                spinnerShownAfterMs:
                  spinnerShownAt == null ? null : roundedMs(spinnerShownAt - requestedAt),
                hostedNavigationMs,
                hostedResourceCount,
                apiRequestCount,
                apiRequests,
                hostStrategy: directActive ? 'direct' : 'routed',
              });
            })();
          });
        }
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
    const requestHostedCancel = () => {
      if (!recoverable || mode === 'view') return close(makeSurfaceResult('cancelled'));
      try {
        const hostedWindow = frame.contentWindow;
        const cancel = frame.contentDocument?.querySelector(
          '[data-cancel-operation], [data-form-close-cancel]',
        );
        if (hostedWindow && cancel instanceof hostedWindow.HTMLElement) {
          cancel.click();
          return makeSurfaceResult('cancel-requested');
        }
      } catch {
        // If the hosted document is unavailable, closing remains the only safe fallback.
      }
      return close(makeSurfaceResult('cancelled'));
    };

    const unregisterDismiss = popupRuntime.registerDismissHandler?.(v2Surface, () =>
      requestHostedCancel(),
    );
    const unbindDismissTarget = popupRuntime.bindDismissTarget?.(v2Surface, backdrop);
    window.addEventListener('message', handleMessage);
    backdrop.querySelector('[data-entry-popup-close]')?.addEventListener('click', () => {
      popupRuntime.requestDismiss?.(v2Surface, 'close-button');
    });
    document.body.append(backdrop);
    if (measureOpening) hostMountedAt = performance.now();

    const fallbackToRoutedHost = () => {
      directActive = false;
      directForm = null;
      if (directHost instanceof HTMLElement) {
        directHost.replaceChildren();
        directHost.hidden = true;
      }
      startRoutedHost();
    };

    const mountDirectReadonlyHost = async () => {
      if (!directReadonlyRequested || !(directHost instanceof HTMLElement)) return false;
      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: { 'X-ManatOS-Entry-Host': 'direct' },
          credentials: 'same-origin',
        });
        if (!response.ok) throw new Error(`Direct entry host returned HTTP ${response.status}.`);
        const html = await response.text();
        const parsed = new DOMParser().parseFromString(html, 'text/html');
        const bootstrapElement = parsed.getElementById('manatosUiBootstrap');
        const renderedEntry = parsed.querySelector('[data-v2-entity-entry]');
        if (!bootstrapElement || !(renderedEntry instanceof Element)) {
          throw new Error('Direct entry response did not contain the canonical entry payload.');
        }
        const bootstrap = JSON.parse(bootstrapElement.textContent || 'null');
        if (!bootstrap || bootstrap.readOnly !== true) {
          throw new Error('Direct entry response is not a readonly entry surface.');
        }
        if (!window.ManatOS?.uiHost?.hydrateEntrySurface?.(v2Surface, bootstrap)) {
          throw new Error('Direct entry CTX hydration was rejected.');
        }

        const imported = document.importNode(renderedEntry, true);
        const serverScope = imported
          .querySelector('[data-v2-entry-form]')
          ?.getAttribute('data-ctx-scope-path');
        if (!serverScope) throw new Error('Direct entry form has no canonical CTX scope.');
        const rewriteScope = (element) => {
          for (const attribute of [...element.attributes]) {
            if (attribute.value.includes(serverScope)) {
              element.setAttribute(
                attribute.name,
                attribute.value.split(serverScope).join(popupPath),
              );
            }
          }
          for (const child of element.children) rewriteScope(child);
        };
        rewriteScope(imported);

        directActive = true;
        directHost.replaceChildren(imported);
        directForm = directHost.querySelector('form[data-v2-entry-form]');
        if (!(directForm instanceof HTMLFormElement))
          throw new Error('Direct entry form was not mounted.');
        window.ManatOS?.entrySurfaces?.installForm?.(directForm);

        // The direct readonly host lives in this window rather than the iframe.
        // Give sizing/tab observation the same host-window contract as routed
        // entries, and bridge its canonical Close action to the popup lifecycle.
        hostedWindow = window;
        hostedTabHandler = (event) => {
          if (event.type === 'click') {
            const target = event.target instanceof Element ? event.target : null;
            if (!target?.closest('[data-bs-toggle="tab"], [role="tab"]')) return;
          }
          scheduleHostedHeightEstimate();
        };
        directHost.addEventListener('shown.bs.tab', hostedTabHandler);
        directHost.addEventListener('click', hostedTabHandler);
        directHost.addEventListener('click', (event) => {
          const target = event.target instanceof Element ? event.target : null;
          if (!target?.closest('[data-form-close-cancel], [data-cancel-operation]')) return;
          event.preventDefault();
          requestHostedCancel();
        });
        if (typeof MutationObserver === 'function') {
          hostedMutationObserver = new MutationObserver(() => scheduleHostedHeightEstimate());
          hostedMutationObserver.observe(directForm, {
            subtree: true,
            childList: true,
            attributes: true,
            attributeFilter: ['class', 'hidden', 'aria-expanded', 'style'],
          });
        }

        const announceReady = () =>
          handleMessage({
            origin: window.location.origin,
            data: { type: 'manatos:entry-popup-ready', token },
          });
        const initialization = window.ManatOS?.entryInitialization?.forForm?.(directForm);
        if (initialization?.pending === false) announceReady();
        else
          directForm.addEventListener('manatos:form-initialization-settled', announceReady, {
            once: true,
          });
        return true;
      } catch (error) {
        console.warn('Direct readonly entry host failed; using routed compatibility host.', error);
        fallbackToRoutedHost();
        return false;
      }
    };

    if (directReadonlyRequested) void mountDirectReadonlyHost();
    if (requestMethod === 'POST') {
      const requestForm = document.createElement('form');
      requestForm.method = 'post';
      requestForm.action = url;
      requestForm.target = frameName;
      requestForm.hidden = true;
      const requestFields = { ...(request?.fields || {}) };
      for (const [name, value] of Object.entries(requestFields)) {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = name;
        input.value = typeof value === 'string' ? value : JSON.stringify(value ?? '');
        requestForm.append(input);
      }
      document.body.append(requestForm);
      requestForm.submit();
      requestForm.remove();
    }
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
      close,
      ready,
      descriptor: recoveryDescriptor,
      frame,
      recoverable: directReadonlyRequested ? false : recoverable,
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
          userChanges =
            entry.frame.contentWindow?.ManatOS?.entryRecovery?.getUserChanges?.() ?? null;
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
   * Semantic entry links and metadata list actions share one canonical opener.
   * Callers describe intent only; correlation and HTTP transport are derived once.
   */
  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const link = target?.closest('a[data-entry-link], a[data-open-entry-popup]');
    if (!(link instanceof HTMLAnchorElement)) return;
    const listAction = link.matches('[data-open-entry-popup]');
    if (!listAction && !document.body.classList.contains('entry-popup-host')) return;

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

  const openProjectedEntry = (opening) => {
    const adapter = window.ManatOS?.entryOpening;
    if (!adapter?.transport) return null;
    const projected = adapter.transport(opening);
    return open({
      token: opening.token,
      title: opening.title,
      url: projected.url,
      entityKey: opening.target.entityKey,
      mode: opening.mode,
      invocation: projected.invocation,
      request: projected.request,
      onSaved: opening.onSaved,
      onClose: opening.onClose,
    });
  };

  window.ManatOS?.entryOpening?.registerHost?.('popup', openProjectedEntry);

  const openEntry = (descriptor = {}) =>
    window.ManatOS?.entryOpening?.open?.({ ...descriptor, host: 'popup' }) ?? null;

  let exportedOpen = open;
  if (document.body.classList.contains('entry-popup-host')) {
    /*
     * The hosted entry form registers its own canonical dismissal adapter from
     * entry/state.js. The iframe remains transport only; this module only bridges
     * an accepted Close/Cancel action back to the outer PopupHost.
     */

    /*
     * The hosted entry owns its canonical Close/Cancel action. Once that action
     * has passed the normal cancellation guard, bridge the accepted click to the
     * outer PopupHost, which alone owns disposal of the popup UI level. Keeping
     * this on the real button path makes header Close, footer Close/Cancel and
     * Escape converge on one lifecycle instead of maintaining parallel closers.
     */
    document.addEventListener('click', (event) => {
      if (event.defaultPrevented) return;
      const trigger =
        event.target instanceof Element ? event.target.closest('[data-form-close-cancel]') : null;
      if (!(trigger instanceof HTMLElement) || parent === window) return;
      const form = trigger.closest('form[data-v2-entry-form]');
      const token = form?.querySelector('input[name="_entryToken"]')?.value || '';
      if (!token) return;
      parent.postMessage({ type: 'manatos:entry-popup-cancel', token }, window.location.origin);
    });

    /*
     * Hosted entries delegate any child entry popup to their owning window.
     * This keeps every popup in one browser-owned UI-level stack, so a popup opened
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
    openEntry:
      document.body.classList.contains('entry-popup-host') && parent !== window
        ? (descriptor) => parent.ManatOS?.popup?.entry?.openEntry?.(descriptor)
        : openEntry,
    snapshotDescriptors,
    gentleCloseAll,
    restoreSequentially,
    restoreDescriptor,
    measurements: () => [...openingMetrics],
    clearMeasurements: () => openingMetrics.splice(0),
  });
})();
