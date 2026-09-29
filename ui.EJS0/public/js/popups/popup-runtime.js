/**
 * Shared ManatOS popup lifecycle and live CTX contract.
 *
 * Bootstrap modal families and custom popup components should expose the same
 * conceptual runtime shape:
 *
 *   ctx.ui.level...level   // popup child surface
 *     control
 *       host/kind/mode/...
 *       invocation      // why/how this popup was invoked
 *       presentation    // resolved visible chrome
 *       state           // canonical UiRuntime-owned semantic surface state
 *       facts           // universal surface-facts folder
 *
 * This module owns Bootstrap-modal concerns only: explicit dismissal policy,
 * workspace centering, focus return, Developer-Tools CTX inspection, and the
 * generic live popup CTX projection. Domain workflows stay in their callers.
 */
(() => {
  const workspace = document.querySelector('.workspace');
  const developerToolsDock = document.getElementById('developerToolsDock');
  const returnFocus = new WeakMap();
  const invocationByModal = new WeakMap();
  const recoveryOrderByModal = new WeakMap();
  const retryByModal = new WeakMap();
  const physicalSurfaceRetirers = new Set();
  let recoverySequence = 0;
  let activeModal = null;
  let lastPopupTriggerRect = null;

  // Popup DOM may be hosted by a same-origin parent document while its runtime
  // originated in a child document. Realm-specific instanceof checks reject
  // those legitimate nodes, so popup infrastructure uses DOM capability checks.
  const isHtmlElement = (value) =>
    Boolean(value && value.nodeType === 1 && typeof value.querySelector === 'function');

  document.addEventListener(
    'pointerdown',
    (event) => {
      const target =
        event.target instanceof Element ? event.target.closest('button, a, [role="button"]') : null;
      if (!isHtmlElement(target)) return;
      const rect = target.getBoundingClientRect();
      if (!rect.width && !rect.height) return;
      lastPopupTriggerRect = {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      };
    },
    true,
  );

  const ctxRuntime = () => window.ManatOS?.ctx;

  const parseJsonObject = (value) => {
    if (!value) return {};
    try {
      const parsed = JSON.parse(String(value));
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  };

  const nextRecoveryOrder = () => ++recoverySequence;

  const serializeModalControls = (modal) =>
    [...modal.querySelectorAll('input[name], textarea[name], select[name]')]
      .filter((control) => !(control instanceof HTMLInputElement && control.type === 'file'))
      .map((control) => ({
        name: control.name,
        value: control.value,
        ...(control instanceof HTMLInputElement && ['checkbox', 'radio'].includes(control.type)
          ? { checked: control.checked }
          : {}),
      }));

  const applyModalControls = (modal, controls = []) => {
    const occurrence = new Map();
    for (const saved of controls) {
      if (!saved?.name) continue;
      const index = occurrence.get(saved.name) || 0;
      occurrence.set(saved.name, index + 1);
      const candidates = [...modal.querySelectorAll('[name]')].filter(
        (control) => control.name === saved.name,
      );
      const control = candidates[index];
      if (!control) continue;
      if (control instanceof HTMLInputElement && ['checkbox', 'radio'].includes(control.type)) {
        control.checked = saved.checked === true;
      } else if (
        control instanceof HTMLInputElement ||
        control instanceof HTMLTextAreaElement ||
        control instanceof HTMLSelectElement
      ) {
        control.value = typeof saved.value === 'string' ? saved.value : '';
      }
      control.dispatchEvent(new Event('input', { bubbles: true }));
      control.dispatchEvent(new Event('change', { bubbles: true }));
    }
  };

  /** Return the deepest canonical V2 UI level currently projected in CTX. */
  const uiLeaf = () => {
    const runtime = ctxRuntime();
    let level = runtime?.value?.ui?.level;
    if (!level) return null;
    let path = 'ctx.ui.level';
    while (level?.level) {
      level = level.level;
      path += '.level';
    }
    return { level, path };
  };

  // Bootstrap modals are ordinary V2 popup surfaces as well. Keep their
  // browser-created surface handles separate from modal DOM state so generic
  // popup chrome never recreates the retired ctx.page...popup branch.
  const surfaceByModal = new WeakMap();
  const activePopupPath = () => {
    const handle = isHtmlElement(activeModal) ? surfaceByModal.get(activeModal) : null;
    if (handle?.path) return handle.path;
    return uiLeaf()?.path || 'ctx.ui.level';
  };
  const popupPath = () => activePopupPath();

  const ENTRY_POPUP_WIDTH = 1120;
  const ENTRY_POPUP_HEIGHT = 820;
  const POPUP_VIEWPORT_GUTTER = 24;
  const POPUP_CASCADE_DELTA_X = 56;
  const POPUP_CASCADE_DELTA_Y = 24;

  const clampCoordinate = (value, minimum, maximum) =>
    Math.max(minimum, Math.min(maximum, Math.round(Number(value) || minimum)));

  /**
   * Compute the canonical opening geometry for a popup surface.
   *
   * A page-owned popup starts at the same centered location used historically.
   * A popup-owned popup alternates around its parent using the parent's CTX
   * counter, so arbitrary nesting remains visible without entity-specific code.
   */
  const preparePopupPlacement = ({
    width = ENTRY_POPUP_WIDTH,
    height = ENTRY_POPUP_HEIGHT,
    anchorRect = null,
    anchorToTrigger = false,
  } = {}) => {
    const parent = uiLeaf();
    const viewportWidth = Math.max(1, window.innerWidth);
    const viewportHeight = Math.max(1, window.innerHeight);
    const dockRect =
      developerToolsDock && !developerToolsDock.classList.contains('d-none')
        ? developerToolsDock.getBoundingClientRect()
        : null;
    const usableRight =
      dockRect && dockRect.left > 0 && dockRect.left < viewportWidth
        ? dockRect.left
        : viewportWidth;
    const usableWidth = Math.max(1, usableRight);
    const actualWidth = Math.min(Number(width) || ENTRY_POPUP_WIDTH, usableWidth - 16);
    const actualHeight = Math.min(Number(height) || ENTRY_POPUP_HEIGHT, viewportHeight - 48);
    const centeredX = Math.round((usableWidth - actualWidth) / 2);
    const centeredY = Math.round((viewportHeight - actualHeight) / 2);
    const resolvedAnchor = anchorRect || (anchorToTrigger ? lastPopupTriggerRect : null);

    const parentPopup =
      parent?.level?.control?.host === 'popup' &&
      parent.level.state?.popup &&
      typeof parent.level.state.popup === 'object'
        ? parent.level.state.popup
        : null;

    const parentCounter = Number(parentPopup?.openedPopupsCounter);
    const normalizedParentCounter = Number.isFinite(parentCounter) ? parentCounter : 0;
    const openedPopupsCounter = parentPopup ? normalizedParentCounter + 1 : 0;

    /*
     * Nested placement is derived from the normal centered geometry, not from
     * the previous popup's coordinates. This makes position a pure function of
     * nesting depth and avoids accumulated drift when a parent was resized or
     * clamped by a smaller viewport. X fans out by depth; Y alternates above and
     * below the normal position. The first page-owned popup remains unshifted.
     */
    const anchored =
      !parentPopup &&
      resolvedAnchor &&
      Number.isFinite(Number(resolvedAnchor.left)) &&
      Number.isFinite(Number(resolvedAnchor.top));
    const rawX = anchored
      ? Number(resolvedAnchor.left) +
        Math.max(0, Number(resolvedAnchor.width) || 0) / 2 -
        actualWidth / 2
      : parentPopup
        ? centeredX + POPUP_CASCADE_DELTA_X * openedPopupsCounter
        : centeredX;
    const rawY = anchored
      ? Number(resolvedAnchor.bottom ?? resolvedAnchor.top) + 8
      : parentPopup
        ? centeredY + POPUP_CASCADE_DELTA_Y * (openedPopupsCounter % 2 === 0 ? 1 : -1)
        : centeredY;

    return Object.freeze({
      x: clampCoordinate(rawX, 8, Math.max(8, usableRight - actualWidth - POPUP_VIEWPORT_GUTTER)),
      y: clampCoordinate(
        rawY,
        8,
        Math.max(8, viewportHeight - actualHeight - POPUP_VIEWPORT_GUTTER),
      ),
      openedPopupsCounter,
    });
  };

  /**
   * Client-opened popups append one canonical child UI level to the browser-owned
   * page/list/entry chain. This keeps ctx.ui authoritative without introducing a
   * parallel popup-specific context model.
   */
  const openUiLevel = (options = {}) =>
    window.ManatOS?.uiHost?.openSurface?.({
      ...options,
      host: 'popup',
      source: 'popup-runtime',
    }) ?? null;

  const hydrateEntrySurface = (handle, entryBootstrap) =>
    window.ManatOS?.uiHost?.hydrateEntrySurface?.(handle, entryBootstrap) ?? false;

  const updateUiLevel = (handle, patch, options = {}) =>
    window.ManatOS?.uiHost?.updateChildSurface?.(handle, patch, {
      source: options.source || 'popup-runtime',
      action: options.action || 'popup-state',
    });

  /** Build results through the typed V2 runtime; popup code does not own a parallel envelope. */
  const surfaceResult = (handle, outcome = 'closed', detail = {}) =>
    window.ManatOS?.uiHost?.surfaceResult?.(handle, outcome, detail);

  const dismissHandlers = new Map();
  const dismissTargetSurfaces = new WeakMap();
  const authorizedModalHide = new WeakSet();

  const registerDismissHandler = (handle, handler) => {
    if (!handle?.path || typeof handler !== 'function') return () => {};
    const path = String(handle.path);
    dismissHandlers.set(path, handler);
    return () => {
      if (dismissHandlers.get(path) === handler) dismissHandlers.delete(path);
    };
  };

  const bindDismissTarget = (handle, target) => {
    if (!handle?.path || !isHtmlElement(target)) return () => {};
    dismissTargetSurfaces.set(target, handle);
    return () => {
      if (dismissTargetSurfaces.get(target) === handle) dismissTargetSurfaces.delete(target);
    };
  };

  const deepestRegisteredDismissPath = () => {
    let node = ctxRuntime()?.value?.ui?.level;
    if (!node) return null;
    let path = 'ctx.ui.level';
    let candidate = dismissHandlers.has(path) ? path : null;
    while (node?.level) {
      node = node.level;
      path += '.level';
      if (dismissHandlers.has(path)) candidate = path;
    }
    return candidate;
  };

  const requestDismiss = (target = null, reason = 'dismiss') => {
    let path = null;
    if (typeof target === 'string') path = target;
    else if (target?.path) path = String(target.path);
    else if (isHtmlElement(target) && dismissTargetSurfaces.has(target)) {
      path = dismissTargetSurfaces.get(target)?.path || null;
    } else if (isHtmlElement(target) && target.matches('.modal')) {
      const handle = surfaceByModal.get(target);
      path = handle?.path || null;
      if (!path) {
        window.bootstrap?.Modal?.getOrCreateInstance(target)?.hide();
        return true;
      }
    }
    // With no explicit popup target, dismiss the deepest surface that actually
    // owns a dismissal transaction. Embedded child levels (for example a
    // hierarchy/contact editor) must never hide their owning entry surface.
    if (!path) path = deepestRegisteredDismissPath() || uiLeaf()?.path || null;
    if (!path) return false;

    // Acceptance is surface-owned. Escape and visible dismissal chrome converge
    // here, so neither keyboard code nor individual buttons duplicate readiness.
    if (window.ManatOS?.uiHost?.isUserInputReady?.(path) === false) return false;

    const handler = dismissHandlers.get(path);
    if (typeof handler === 'function') return handler(String(reason || 'dismiss')) !== false;

    const modal = [...document.querySelectorAll('.modal.show')]
      .filter((candidate) => surfaceByModal.get(candidate)?.path === path)
      .at(-1);
    if (isHtmlElement(modal)) {
      window.bootstrap?.Modal?.getOrCreateInstance(modal)?.hide();
      return true;
    }
    return false;
  };

  const closeUiLevel = (handle, decision = null) => {
    if (handle?.path) dismissHandlers.delete(String(handle.path));
    return window.ManatOS?.uiHost?.closeSurface?.(handle, 'popup-runtime', decision);
  };

  const replaceContext = (payload, options = {}) => {
    if (!isHtmlElement(activeModal)) return;
    const handle = surfaceByModal.get(activeModal);
    if (!handle) return;
    const current = ctxRuntime()?.get?.(handle.path);
    if (!current || typeof current !== 'object') return;
    const patch =
      options.placement === 'surface'
        ? payload && typeof payload === 'object' && !Array.isArray(payload)
          ? payload
          : {}
        : {
            data: {
              ...(current.data && typeof current.data === 'object' ? current.data : {}),
              resources: {
                ...(current.data?.resources && typeof current.data.resources === 'object'
                  ? current.data.resources
                  : {}),
                popup: payload,
              },
            },
          };
    updateUiLevel(handle, patch, {
      source: options.source || 'popup-runtime',
      action: options.action || 'popup-state',
    });
  };

  const clearContext = (options = {}) => {
    if (!isHtmlElement(activeModal)) return;
    const handle = surfaceByModal.get(activeModal);
    if (!handle) return;
    closeUiLevel(handle);
    surfaceByModal.delete(activeModal);
    void options;
  };

  const centerModalInWorkspace = (modal) => {
    if (!workspace || !isHtmlElement(modal)) return;
    const rect = workspace.getBoundingClientRect();
    const visibleLeft = Math.max(rect.left, 0);
    const visibleRight = Math.min(rect.right, window.innerWidth);
    const visibleTop = Math.max(rect.top, 0);
    const visibleBottom = Math.min(rect.bottom, window.innerHeight);
    const centerX =
      visibleRight > visibleLeft
        ? visibleLeft + (visibleRight - visibleLeft) / 2
        : window.innerWidth / 2;
    const centerY =
      visibleBottom > visibleTop
        ? visibleTop + (visibleBottom - visibleTop) / 2
        : window.innerHeight / 2;

    modal.classList.add('workspace-centered-modal');
    modal.style.setProperty('--workspace-modal-center-x', `${centerX}px`);
    modal.style.setProperty('--workspace-modal-center-y', `${centerY}px`);
  };

  const refreshVisibleModalCenters = () => {
    document.querySelectorAll('.modal.show').forEach((modal) => centerModalInWorkspace(modal));
  };

  const canonicalPopupPresentation = (invocation) => {
    const purpose = String(invocation?.purpose || '');
    return window.ManatOS?.popupPresentationV2?.resolve?.(purpose) || null;
  };

  const popupRecoverable = (invocation) => {
    if (invocation?.behavior?.recoverable === false) return false;
    return canonicalPopupPresentation(invocation)?.recoverable !== false;
  };

  const popupTitle = (modal) =>
    String(modal.querySelector('.modal-title')?.textContent || '')
      .replace(/\s+/g, ' ')
      .trim();

  const resolveInvocation = (modal, event) => {
    const trigger = isHtmlElement(event?.relatedTarget) ? event.relatedTarget : null;
    return Object.freeze({
      purpose: String(
        trigger?.dataset.popupPurpose || modal.dataset.popupPurpose || modal.id || 'popup',
      ),
      popupId: modal.id || null,
      triggerId: trigger?.id || null,
      ...parseJsonObject(modal.dataset.popupInvocation),
      ...parseJsonObject(trigger?.dataset.popupInvocation),
    });
  };

  /**
   * Ensure a physical Bootstrap modal has one canonical V2 popup surface.
   * Bootstrap's shown/hide animation phases are host mechanics only; they must
   * never drive semantic UiLevel lifecycle state. UiRuntime owns activation and
   * closure, while this registry only correlates the DOM modal with its handle.
   */
  const canonicalSurfaceKinds = new Set([
    'static',
    'list',
    'entry',
    'selector',
    'hierarchy',
    'custom',
  ]);

  const semanticPopupKind = (modal, invocation) => {
    const requested = String(invocation?.surfaceKind || modal.dataset.surfaceKind || '').trim();
    return canonicalSurfaceKinds.has(requested) ? requested : 'custom';
  };

  const ensureModalSurface = (modal) => {
    const existing = surfaceByModal.get(modal);
    if (existing) return existing;
    const invocation = invocationByModal.get(modal) || resolveInvocation(modal, null);
    const canonicalPresentation = canonicalPopupPresentation(invocation);
    const purpose = String(invocation.purpose || modal.dataset.popupPurpose || 'popup');
    const handle = openUiLevel({
      kind: semanticPopupKind(modal, invocation),
      mode: 'view',
      name: purpose,
      invocation,
      data:
        invocation?.data && typeof invocation.data === 'object' && !Array.isArray(invocation.data)
          ? invocation.data
          : null,
      presentation: canonicalPresentation || {
        // Transitional compatibility for popup families that do not yet publish
        // a typed presentation descriptor. The typed registry is authoritative
        // whenever a descriptor exists; DOM projection must not override it.
        title: String(invocation.presentation?.title || invocation.title || popupTitle(modal)),
        layout: String(
          invocation.presentation?.layout ||
            invocation.presentationMode ||
            modal.dataset.popupPresentation ||
            'standard',
        ),
      },
    });
    if (handle) {
      surfaceByModal.set(modal, handle);
      // The physical popup host is the canonical DOM root of this UiLevel.
      // DOM identity/highlighting is then resolved exactly like page and embedded hosts.
      modal.setAttribute('data-ui-level-root', '');
      modal.dataset.ctxScopePath = handle.path;
    }
    return handle;
  };

  /**
   * Raise/lower Developer Tools above the popup without changing shell state.
   *
   * Popup inspection is deliberately a z-order toggle, not a Developer Tools
   * show/hide action. The dock therefore keeps its normal shell geometry and
   * the CTX button can be pressed repeatedly to alternate between:
   *
   *   popup above Developer Tools  <->  Developer Tools above popup
   *
   * When raised, the requested CTX path is selected again so returning to the
   * inspection surface always restores the popup node the action represents.
   */
  const setInspectionVisible = (visible, options = {}) => {
    if (!developerToolsDock || developerToolsDock.classList.contains('d-none')) return false;

    const path = String(options.path || popupPath());
    const button = options.button instanceof HTMLButtonElement ? options.button : null;
    const raised = Boolean(visible);

    developerToolsDock.classList.toggle('is-popup-inspection', raised);
    button?.setAttribute('aria-pressed', String(raised));
    button?.classList.toggle('active', raised);

    if (raised) {
      window.ManatOS?.shell?.setDeveloperToolTab?.('ctx', false);
      window.dispatchEvent(
        new CustomEvent('manatos:ctx-viewer-select', {
          detail: { path, expand: true, revealExpandedRange: true },
        }),
      );
    }

    return raised;
  };

  const toggleInspection = (options = {}) =>
    setInspectionVisible(!developerToolsDock?.classList.contains('is-popup-inspection'), options);

  const clearInspection = (button = null) => {
    if (!developerToolsDock) return;
    developerToolsDock.classList.remove('is-popup-inspection');
    if (button instanceof HTMLButtonElement) {
      button.setAttribute('aria-pressed', 'false');
      button.classList.remove('active');
    }
  };

  const ensurePopupCtxButton = (modal) => {
    if (!developerToolsDock || developerToolsDock.classList.contains('d-none')) return null;
    const header = modal.querySelector('.modal-header');
    if (!isHtmlElement(header)) return null;

    let button = header.querySelector('[data-popup-ctx-inspect]');
    if (!(button instanceof HTMLButtonElement)) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn btn-sm btn-outline-secondary d-none ms-auto me-2';
      button.dataset.popupCtxInspect = '';
      button.innerHTML = '<i class="bi bi-bug me-1" aria-hidden="true"></i>CTX';
      const close = header.querySelector('.btn-close');
      if (isHtmlElement(close)) {
        close.classList.add('ms-0');
        header.insertBefore(button, close);
      } else header.append(button);
    }

    button.setAttribute('aria-pressed', 'false');
    if (button.dataset.popupCtxBound !== 'true') {
      button.dataset.popupCtxBound = 'true';
      button.addEventListener('click', () => {
        toggleInspection({
          path: popupPath(),
          button,
        });
      });
    }

    button.classList.remove('d-none');
    return button;
  };

  const normalizeApplicationError = (error) => {
    const source =
      error && typeof error === 'object' && error.error && typeof error.error === 'object'
        ? error.error
        : error && typeof error === 'object'
          ? error
          : {};
    const message =
      source.userMessage ||
      source.message ||
      (error instanceof Error ? error.message : null) ||
      'The operation could not be completed.';
    return Object.freeze({
      name: source.name || (error instanceof Error ? error.name : 'AppError'),
      code: source.code || null,
      message: source.message || message,
      userMessage: message,
      retryable: source.retryable === true,
      operationTrace: Array.isArray(source.operationTrace) ? source.operationTrace : [],
    });
  };

  const presentApplicationError = (error, options = {}) => {
    const modal = document.getElementById('applicationErrorModal');
    if (!isHtmlElement(modal)) return false;

    const normalized = normalizeApplicationError(error);
    const message = modal.querySelector('[data-message-popup-message]');
    const details = modal.querySelector('[data-message-popup-details]');
    const trace = modal.querySelector('[data-message-popup-trace]');
    const retry = modal.querySelector('[data-popup-action="retry"]');

    if (isHtmlElement(message)) {
      message.textContent = normalized.userMessage;
      message.classList.toggle('mb-0', normalized.operationTrace.length === 0);
    }
    if (details instanceof HTMLDetailsElement) {
      details.hidden = normalized.operationTrace.length === 0;
      details.open = false;
    }
    if (isHtmlElement(trace)) {
      trace.textContent = JSON.stringify(normalized.operationTrace, null, 2);
    }
    if (isHtmlElement(retry)) {
      const canRetry = normalized.retryable && typeof options.retry === 'function';
      retry.classList.toggle('d-none', !canRetry);
    }

    const invocation = Object.freeze({ error: normalized });
    invocationByModal.set(modal, invocation);
    modal.dataset.popupInvocation = JSON.stringify(invocation);
    if (typeof options.retry === 'function') retryByModal.set(modal, options.retry);
    else retryByModal.delete(modal);

    window.bootstrap?.Modal?.getOrCreateInstance(modal)?.show();
    return true;
  };

  window.ManatOS ||= {};
  window.ManatOS.errors = Object.freeze({
    present: presentApplicationError,
    fromResponse(response, payload, options = {}) {
      const source =
        payload?.error && typeof payload.error === 'object'
          ? payload.error
          : {
              code: response?.status ? `HTTP_${response.status}` : 'APPLICATION_OPERATION_FAILED',
              message:
                payload?.message ||
                (response?.statusText ? `${response.status} ${response.statusText}` : null) ||
                'The operation could not be completed.',
              userMessage:
                payload?.userMessage || payload?.message || 'The operation could not be completed.',
              retryable: Boolean(response && response.status >= 500),
              operationTrace: Array.isArray(payload?.operationTrace) ? payload.operationTrace : [],
            };
      return presentApplicationError(source, options);
    },
  });

  document.addEventListener('click', (event) => {
    const action =
      event.target instanceof Element ? event.target.closest('[data-popup-action]') : null;
    if (!isHtmlElement(action) || action.dataset.popupAction !== 'retry') return;

    const modal = action.closest('.modal');
    const retry = isHtmlElement(modal) ? retryByModal.get(modal) : null;
    if (typeof retry === 'function') {
      window.bootstrap?.Modal?.getInstance(modal)?.hide();
      void Promise.resolve().then(() => retry());
      return;
    }

    const retryRequest = new CustomEvent('manatos:retry-request', {
      bubbles: true,
      cancelable: true,
      detail: Object.freeze({ source: action }),
    });
    if (action.dispatchEvent(retryRequest)) history.go(0);
  });

  const dismissalReady = (target = null) =>
    window.ManatOS?.uiHost?.isUserInputReady?.(target) === true;

  const registeredModals = new WeakSet();
  const visibleModals = new Set();
  const recoveryRestorers = new Map();

  const popupNestingDepth = () => {
    let level = ctxRuntime()?.value?.ui?.level;
    let depth = 0;
    while (level) {
      if (level.control?.host === 'popup') depth += 1;
      level = level.level;
    }
    return depth;
  };

  // One stacking policy covers Bootstrap popups regardless of which same-origin
  // document created their DOM. Custom popup hosts start at 1100 and advance by
  // 20 per child level, so a Bootstrap child uses the same depth contract.
  const syncBootstrapModalStack = (modal, depth) => {
    if (!isHtmlElement(modal)) return;
    const normalizedDepth = Math.max(1, Number(depth) || 1);
    const modalZ = 1100 + normalizedDepth * 20;
    modal.style.zIndex = String(modalZ);
    const ownerDocument = modal.ownerDocument || document;
    const backdrops = [...ownerDocument.querySelectorAll('.modal-backdrop.show')];
    const backdrop = backdrops.at(-1);
    if (isHtmlElement(backdrop)) backdrop.style.zIndex = String(modalZ - 10);
  };

  // Bootstrap assumes one modal at a time and removes body/modal backdrop state
  // when a nested child closes. Reconcile the remaining physical stack from the
  // visible canonical popup surfaces so the parent immediately resumes as the
  // interactive top popup. This is host mechanics only; UiRuntime still owns
  // semantic activation/focus lifecycle.
  const reconcileBootstrapModalStack = () => {
    const visible = [...document.querySelectorAll('.modal.show')].filter((candidate) =>
      isHtmlElement(candidate),
    );
    if (!visible.length) return;
    document.body.classList.add('modal-open');
    visible.forEach((candidate, index) => syncBootstrapModalStack(candidate, index + 1));
    const top = visible.at(-1);
    if (isHtmlElement(top)) {
      activeModal = top;
      queueMicrotask(() => {
        if (!top.classList.contains('show')) return;
        const focused = document.activeElement;
        if (!isHtmlElement(focused) || !top.contains(focused)) {
          const target = top.querySelector(
            '[autofocus], button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          );
          if (isHtmlElement(target)) target.focus({ preventScroll: true });
        }
      });
    }
  };

  const releaseModalFocus = (modal) => {
    const focused = document.activeElement;
    if (!isHtmlElement(focused) || !modal.contains(focused)) return;
    const target = returnFocus.get(modal);
    if (isHtmlElement(target) && target.isConnected && !modal.contains(target)) {
      target.focus({ preventScroll: true });
    } else {
      focused.blur();
    }
  };

  const registerBootstrapModal = (modal) => {
    if (!isHtmlElement(modal) || registeredModals.has(modal)) return modal;
    registeredModals.add(modal);

    // Universal ManatOS popup policy: dismissal is always explicit.
    modal.dataset.bsBackdrop = 'static';
    modal.dataset.bsKeyboard = 'false';

    // Developer Tools can be deliberately exposed through the CTX action.
    modal.dataset.bsFocus = 'false';

    modal.addEventListener('show.bs.modal', (event) => {
      modal.dataset.manatosPopupState = 'opening';
      visibleModals.add(modal);
      const popupDepth = popupNestingDepth() + 1;
      modal.dataset.manatosPopupDepth = String(popupDepth);
      syncBootstrapModalStack(modal, popupDepth);
      const trigger = isHtmlElement(event.relatedTarget)
        ? event.relatedTarget
        : isHtmlElement(document.activeElement)
          ? document.activeElement
          : null;

      if (trigger && !modal.contains(trigger)) returnFocus.set(modal, trigger);
      else returnFocus.delete(modal);

      invocationByModal.set(modal, invocationByModal.get(modal) || resolveInvocation(modal, event));
      if (!recoveryOrderByModal.has(modal)) recoveryOrderByModal.set(modal, nextRecoveryOrder());
      activeModal = modal;
      const handle = ensureModalSurface(modal);
      const ownerBadge = modal.querySelector('[data-owner-context-badge]');
      if (ownerBadge instanceof HTMLElement) {
        const popupSurface = handle?.path ? ctxRuntime()?.get?.(handle.path) : null;
        const ownerPresentation = window.ManatOS?.ownerContextPresentation?.(popupSurface) || null;
        ownerBadge.classList.toggle('d-none', !ownerPresentation);
        ownerBadge.textContent = ownerPresentation?.label || '';
        ownerBadge.title = ownerPresentation?.title || '';
      }
      ensurePopupCtxButton(modal);
      centerModalInWorkspace(modal);
    });

    modal.addEventListener('shown.bs.modal', () => {
      modal.dataset.manatosPopupState = 'ready';
      syncBootstrapModalStack(modal, Number(modal.dataset.manatosPopupDepth));
      activeModal = modal;
      centerModalInWorkspace(modal);
    });

    modal.addEventListener('hide.bs.modal', (event) => {
      if (!authorizedModalHide.has(modal)) {
        const handle = surfaceByModal.get(modal);
        if (handle) {
          event.preventDefault();
          void Promise.resolve(closeUiLevel(handle)).then((closed) => {
            if (closed !== true) return;
            authorizedModalHide.add(modal);
            window.bootstrap?.Modal?.getOrCreateInstance(modal)?.hide();
          });
          return;
        }
      } else {
        authorizedModalHide.delete(modal);
      }

      modal.dataset.manatosPopupState = 'closing';

      // Release focus synchronously before Bootstrap can apply aria-hidden.
      // Popup semantics remain UiRuntime-owned; this is physical host/a11y mechanics.
      releaseModalFocus(modal);
    });

    modal.addEventListener('hidden.bs.modal', () => {
      modal.dataset.manatosPopupState = 'closed';
      visibleModals.delete(modal);
      const ctxButton = modal.querySelector('[data-popup-ctx-inspect]');
      clearInspection(ctxButton);
      ctxButton?.classList.add('d-none');

      const target = returnFocus.get(modal);
      if (isHtmlElement(target) && target.isConnected) {
        target.focus({ preventScroll: true });
      }
      returnFocus.delete(modal);
      invocationByModal.delete(modal);
      recoveryOrderByModal.delete(modal);
      retryByModal.delete(modal);

      // Retire the exact semantic surface correlated with this physical modal.
      // Do not gate disposal on `activeModal`: a nested modal temporarily becomes
      // active, but its parent still owns a distinct UiLevel that must be closed
      // when that parent is hidden later. Typed UiRuntime closes the exact handle
      // and reactivates its semantic parent; this module only refreshes which
      // visible Bootstrap modal is the current physical interaction target.
      const handle = surfaceByModal.get(modal);
      if (handle) {
        closeUiLevel(handle);
        surfaceByModal.delete(modal);
      }
      // A hidden physical host no longer owns any UiLevel DOM identity. Keeping
      // these attributes after semantic disposal lets a later popup at the same
      // depth correlate with both the retired and current modal.
      modal.removeAttribute('data-ui-level-root');
      delete modal.dataset.ctxScopePath;
      activeModal =
        [...document.querySelectorAll('.modal.show')]
          .filter((candidate) => isHtmlElement(candidate))
          .at(-1) || null;
      // Bootstrap removes shared body/backdrop state while hiding a nested modal.
      // Reconcile after its own hidden handlers have finished so the still-open
      // parent is again the physical interaction target.
      queueMicrotask(reconcileBootstrapModalStack);
    });

    return modal;
  };

  document.querySelectorAll('.modal').forEach((modal) => registerBootstrapModal(modal));

  // UiRuntime owns semantic closure. When it disposes a Bootstrap-backed popup
  // as part of a parent/subtree close, retire the correlated physical modal too.
  // This keeps semantic and DOM lifecycle atomic without making callers know
  // which popup host implementation owns the closed UiLevel.
  window.addEventListener('manatos:ui-level-disposing', (event) => {
    const path = String(event?.detail?.path || '');
    if (!path) return;
    const modal = [...visibleModals].find(
      (candidate) => surfaceByModal.get(candidate)?.path === path,
    );
    if (!isHtmlElement(modal) || !modal.classList.contains('show')) return;
    authorizedModalHide.add(modal);
    window.bootstrap?.Modal?.getOrCreateInstance(modal)?.hide();
  });

  const snapshotDescriptors = () =>
    [...document.querySelectorAll('.modal.show')]
      .filter((modal) => {
        if (!isHtmlElement(modal) || !modal.id) return false;
        const invocation = invocationByModal.get(modal) || resolveInvocation(modal, null);
        return popupRecoverable(invocation);
      })
      .map((modal) => ({
        type: 'modal',
        order: recoveryOrderByModal.get(modal) || 0,
        popupId: modal.id,
        invocation: invocationByModal.get(modal) || resolveInvocation(modal, null),
        controls: serializeModalControls(modal),
      }));

  const gentleCloseAllRecoverableModals = async () => {
    for (const modal of [...document.querySelectorAll('.modal.show')].reverse()) {
      if (!isHtmlElement(modal)) continue;
      const hidden = new Promise((resolve) => {
        const timeout = window.setTimeout(() => resolve(false), 1000);
        modal.addEventListener(
          'hidden.bs.modal',
          () => {
            window.clearTimeout(timeout);
            resolve(true);
          },
          { once: true },
        );
      });
      const dismiss = modal.querySelector('[data-bs-dismiss="modal"]');
      if (isHtmlElement(dismiss)) dismiss.click();
      else window.bootstrap?.Modal?.getInstance(modal)?.hide();
      await hidden;
    }
  };

  /**
   * Final outage-only modal retirement. Recovery has already captured popup
   * descriptors and user changes before this runs, so this deliberately avoids
   * normal Cancel/dismiss workflows that could open another confirmation popup.
   */
  /**
   * Register a physical popup host that is not owned by Bootstrap. Typed UI
   * disposal owns semantic lifecycle; this registry owns only outage-time DOM
   * retirement so every popup implementation obeys the same root-teardown
   * contract without workspace recovery knowing popup-specific selectors.
   */
  const registerPhysicalSurfaceRetirer = (retire) => {
    if (typeof retire !== 'function') return () => {};
    physicalSurfaceRetirers.add(retire);
    return () => physicalSurfaceRetirers.delete(retire);
  };

  const retireAllPhysicalSurfaces = () => {
    for (const retire of [...physicalSurfaceRetirers]) {
      try {
        retire();
      } catch {
        // Outage teardown must continue even if one physical host is stale.
      }
    }
    physicalSurfaceRetirers.clear();
  };

  const retireAllVisibleModals = () => {
    for (const modal of document.querySelectorAll('.modal.show, .modal[style*="display: block"]')) {
      if (!isHtmlElement(modal)) continue;
      releaseModalFocus(modal);
      try {
        window.bootstrap?.Modal?.getInstance(modal)?.dispose();
      } catch {
        // Outage teardown must continue even if Bootstrap already lost instance state.
      }
      modal.classList.remove('show');
      modal.style.display = 'none';
      modal.setAttribute('aria-hidden', 'true');
      modal.removeAttribute('aria-modal');
      modal.removeAttribute('role');
      surfaceByModal.delete(modal);
      visibleModals.delete(modal);
      invocationByModal.delete(modal);
      recoveryOrderByModal.delete(modal);
      retryByModal.delete(modal);
    }
    document.querySelectorAll('.modal-backdrop').forEach((backdrop) => backdrop.remove());
    document.body.classList.remove('modal-open');
    document.body.style.removeProperty('overflow');
    document.body.style.removeProperty('padding-right');
    clearInspection();
    activeModal = null;
  };

  const registerRecoveryRestorer = (purpose, restore) => {
    const key = String(purpose || '').trim();
    if (!key || typeof restore !== 'function') return () => {};
    recoveryRestorers.set(key, restore);
    return () => {
      if (recoveryRestorers.get(key) === restore) recoveryRestorers.delete(key);
    };
  };

  const restoreDescriptor = async (descriptor) => {
    if (!descriptor || descriptor.type !== 'modal' || !descriptor.popupId) return true;
    const invocation = descriptor.invocation || {};
    if (!popupRecoverable(invocation)) return true;
    const purpose = String(invocation?.purpose || '').trim();
    const semanticRestorer = recoveryRestorers.get(purpose);
    if (semanticRestorer) {
      const restored = await semanticRestorer(descriptor);
      if (restored !== true) throw new Error(`Popup did not restore: ${purpose}`);
      return true;
    }
    const modal = document.getElementById(descriptor.popupId);
    if (!isHtmlElement(modal)) throw new Error(`Popup not found: ${descriptor.popupId}`);
    invocationByModal.set(modal, Object.freeze({ ...(descriptor.invocation || {}) }));
    recoveryOrderByModal.set(modal, Number(descriptor.order) || nextRecoveryOrder());
    const shown = new Promise((resolve) => {
      modal.addEventListener('shown.bs.modal', () => resolve(true), { once: true });
      window.setTimeout(() => resolve(false), 10_000);
    });
    window.bootstrap?.Modal?.getOrCreateInstance(modal)?.show();
    if ((await shown) !== true) throw new Error(`Popup did not open: ${descriptor.popupId}`);
    applyModalControls(modal, descriptor.controls || []);
    return true;
  };

  window.addEventListener('resize', refreshVisibleModalCenters);

  window.ManatOS = window.ManatOS || {};
  window.ManatOS.popup = window.ManatOS.popup || {};
  window.ManatOS.popup.runtime = Object.freeze({
    popupPath,
    replaceContext,
    clearContext,
    refreshVisibleModalCenters,
    registerBootstrapModal,
    setInspectionVisible,
    toggleInspection,
    clearInspection,
    uiLeaf,
    preparePopupPlacement,
    openUiLevel,
    hydrateEntrySurface,
    updateUiLevel,
    surfaceResult,
    registerDismissHandler,
    bindDismissTarget,
    requestDismiss,
    dismissalReady,
    closeUiLevel,
    nextRecoveryOrder,
    snapshotDescriptors,
    gentleCloseAllRecoverableModals,
    retireAllVisibleModals,
    registerPhysicalSurfaceRetirer,
    retireAllPhysicalSurfaces,
    registerRecoveryRestorer,
    restoreDescriptor,
  });
})();
