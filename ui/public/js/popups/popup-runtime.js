/**
 * Shared ManatOS popup lifecycle and live CTX contract.
 *
 * Bootstrap modal families and custom popup components should expose the same
 * conceptual runtime shape:
 *
 *   ctx.ui.level...level   // host='popup' child surface
 *     kind
 *     invocation      // why/how this popup was invoked
 *     presentation    // resolved visible chrome
 *     state           // popup-owned mutable lifecycle state
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
  let activeModal = null;

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
    const handle = activeModal instanceof HTMLElement ? surfaceByModal.get(activeModal) : null;
    if (handle?.path) return handle.path;
    return uiLeaf()?.path || 'ctx.ui.level';
  };
  const popupPath = () => activePopupPath();

  const surfaceState = (phase = 'active') => ({
    lifecycle: phase,
    active: phase === 'active',
    dirty: false,
    valid: true,
    loading: false,
    saving: false,
    deleting: false,
    blocked: false,
    navigation: { activeTabId: null, activeInternalTabIds: {} },
  });

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
  } = {}) => {
    const parent = uiLeaf();
    const viewportWidth = Math.max(1, window.innerWidth);
    const viewportHeight = Math.max(1, window.innerHeight);
    const actualWidth = Math.min(Number(width) || ENTRY_POPUP_WIDTH, viewportWidth - 48);
    const actualHeight = Math.min(Number(height) || ENTRY_POPUP_HEIGHT, viewportHeight - 48);
    const centeredX = Math.round((viewportWidth - actualWidth) / 2);
    const centeredY = Math.round((viewportHeight - actualHeight) / 2);

    const parentPopup =
      parent?.level?.host === 'popup' &&
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
    const rawX = parentPopup ? centeredX + POPUP_CASCADE_DELTA_X * openedPopupsCounter : centeredX;
    const rawY = parentPopup
      ? centeredY + POPUP_CASCADE_DELTA_Y * (openedPopupsCounter % 2 === 0 ? 1 : -1)
      : centeredY;

    return Object.freeze({
      x: clampCoordinate(rawX, 8, Math.max(8, viewportWidth - actualWidth - POPUP_VIEWPORT_GUTTER)),
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
  const openUiLevel = ({
    kind = 'custom',
    mode = 'view',
    name = 'popup',
    entityKey = null,
    invocation = {},
    presentation = {},
    state = {},
  } = {}) => {
    const runtime = ctxRuntime();
    const parent = uiLeaf();
    if (!runtime?.replace || !parent?.level || !parent?.path) return null;

    const normalizedName = String(name || 'popup').replace(/[^A-Za-z0-9_$-]/g, '-');
    const childPath = `${parent.path}.level`;
    const child = {
      id: `popup-${kind}-${normalizedName}-${Date.now()}`,
      host: 'popup',
      kind: String(kind || 'custom'),
      mode: String(mode || 'view'),
      name: normalizedName,
      path: `${parent.level.path}/popup:${normalizedName}`,
      scope: String(parent.level.scope || 'sys'),
      ...(entityKey ? { entityKey: String(entityKey) } : {}),
      invocation: { ...invocation },
      presentation: { kind: String(kind || 'custom'), ...presentation },
      state: { ...surfaceState('active'), ...state },
    };

    if (parent.level.state && typeof parent.level.state === 'object') {
      runtime.replace(
        `${parent.path}.state`,
        { ...parent.level.state, lifecycle: 'deactivating', active: false },
        {
          source: 'v2-popup-surface',
          action: 'deactivate-parent-surface',
          triggerPath: childPath,
        },
      );
    }
    runtime.replace(childPath, child, {
      source: 'v2-popup-surface',
      action: 'open-popup-surface',
      triggerPath: childPath,
    });
    return { path: childPath, parentPath: parent.path, id: child.id };
  };

  const updateUiLevel = (handle, patch, options = {}) => {
    const runtime = ctxRuntime();
    if (!runtime?.replace || !handle?.path) return;
    const current = runtime.get?.(handle.path);
    if (!current || typeof current !== 'object') return;
    runtime.replace(
      handle.path,
      { ...current, ...patch },
      {
        source: options.source || 'v2-popup-surface',
        action: options.action || 'update-popup-surface',
        triggerPath: handle.path,
      },
    );
  };

  /**
   * Build the browser-side form of the canonical V2 SurfaceResult contract.
   * Browser popup hosts cannot import the TypeScript runtime directly,
   * but callers still receive the exact semantic envelope used by V2 hosts.
   */
  const surfaceResult = (handle, outcome = 'closed', detail = {}) =>
    Object.freeze({
      outcome: String(outcome || 'closed'),
      surfaceId: String(handle?.id || ''),
      ...(detail.value !== undefined ? { value: detail.value } : {}),
      ...(detail.record && typeof detail.record === 'object' ? { record: detail.record } : {}),
      ...(detail.metadata && typeof detail.metadata === 'object'
        ? { metadata: detail.metadata }
        : {}),
    });

  const closeUiLevel = (handle) => {
    const runtime = ctxRuntime();
    if (!runtime?.delete || !handle?.path) return;
    if (runtime.get?.(handle.path) !== undefined) {
      runtime.delete(handle.path, {
        source: 'v2-popup-surface',
        action: 'close-popup-surface',
        triggerPath: handle.path,
      });
    }
    if (handle.parentPath && runtime.get?.(`${handle.parentPath}.state`) !== undefined) {
      const parentState = runtime.get(`${handle.parentPath}.state`);
      runtime.replace(
        `${handle.parentPath}.state`,
        { ...parentState, lifecycle: 'active', active: true },
        {
          source: 'v2-popup-surface',
          action: 'reactivate-parent-surface',
          triggerPath: handle.parentPath,
        },
      );
    }
  };

  const replaceContext = (payload, options = {}) => {
    if (!(activeModal instanceof HTMLElement)) return;
    const handle = surfaceByModal.get(activeModal);
    if (!handle) return;
    const current = ctxRuntime()?.get?.(handle.path);
    if (!current || typeof current !== 'object') return;
    updateUiLevel(
      handle,
      {
        resources: {
          ...(current.resources && typeof current.resources === 'object' ? current.resources : {}),
          popup: payload,
        },
      },
      {
        source: options.source || 'popup-runtime',
        action: options.action || 'popup-state',
      },
    );
  };

  const clearContext = (options = {}) => {
    if (!(activeModal instanceof HTMLElement)) return;
    const handle = surfaceByModal.get(activeModal);
    if (!handle) return;
    closeUiLevel(handle);
    surfaceByModal.delete(activeModal);
    void options;
  };

  const centerModalInWorkspace = (modal) => {
    if (!workspace || !(modal instanceof HTMLElement)) return;
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

  const popupTitle = (modal) =>
    String(modal.querySelector('.modal-title')?.textContent || '')
      .replace(/\s+/g, ' ')
      .trim();

  const resolveCallingParams = (modal, event) => {
    const trigger = event?.relatedTarget instanceof HTMLElement ? event.relatedTarget : null;
    return Object.freeze({
      purpose: String(
        trigger?.dataset.popupPurpose || modal.dataset.popupPurpose || modal.id || 'popup',
      ),
      popupId: modal.id || null,
      triggerId: trigger?.id || null,
      ...parseJsonObject(modal.dataset.popupCallingParams),
      ...parseJsonObject(trigger?.dataset.popupCallingParams),
    });
  };

  /**
   * Build the canonical live popup payload. Custom popups (for example the
   * Record Selector) use this same builder so CTX consumers never need to
   * learn a different top-level popup contract for each implementation.
   * Domain-specific state may be added without changing the common envelope.
   */
  const createPayload = ({
    kind = 'popup',
    callingParams = {},
    presentation = {},
    state = {},
    ...domainState
  } = {}) => ({
    kind: String(kind || 'popup'),
    callingParams: { ...callingParams },
    presentation: { ...presentation },
    ...domainState,
    state: { ...state },
  });

  const syncModalContext = (modal, phase) => {
    const callingParams = invocationByModal.get(modal) || resolveCallingParams(modal, null);
    let handle = surfaceByModal.get(modal);

    if (phase === 'opening' && !handle) {
      handle = openUiLevel({
        kind: String(modal.dataset.popupKind || 'modal'),
        mode: 'view',
        name: String(modal.id || callingParams.purpose || 'modal'),
        invocation: callingParams,
        presentation: {
          title: String(callingParams.title || popupTitle(modal)),
          layout: String(
            callingParams.presentationMode || modal.dataset.popupPresentation || 'standard',
          ),
        },
      });
      if (handle) surfaceByModal.set(modal, handle);
      return;
    }

    if (!handle) return;
    const current = ctxRuntime()?.get?.(handle.path);
    if (!current || typeof current !== 'object') return;
    const active = phase === 'open';
    updateUiLevel(
      handle,
      {
        state: {
          ...(current.state && typeof current.state === 'object' ? current.state : {}),
          lifecycle: phase === 'closing' ? 'closing' : active ? 'active' : phase,
          active,
        },
      },
      { source: 'bootstrap-popup', action: `popup-${phase}` },
    );
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
    if (!(header instanceof HTMLElement)) return null;

    let button = header.querySelector('[data-popup-ctx-inspect]');
    if (!(button instanceof HTMLButtonElement)) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn btn-sm btn-outline-secondary d-none';
      button.dataset.popupCtxInspect = '';
      button.innerHTML = '<i class="bi bi-bug me-1" aria-hidden="true"></i>CTX';
      const close = header.querySelector('.btn-close');
      if (close) header.insertBefore(button, close);
      else header.append(button);
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

  document.querySelectorAll('.modal').forEach((modal) => {
    if (!(modal instanceof HTMLElement)) return;

    // Universal ManatOS popup policy: dismissal is always explicit.
    modal.dataset.bsBackdrop = 'static';
    modal.dataset.bsKeyboard = 'false';

    // Developer Tools can be deliberately exposed through the CTX action.
    modal.dataset.bsFocus = 'false';

    modal.addEventListener('show.bs.modal', (event) => {
      const trigger =
        event.relatedTarget instanceof HTMLElement
          ? event.relatedTarget
          : document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;

      if (trigger && !modal.contains(trigger)) returnFocus.set(modal, trigger);
      else returnFocus.delete(modal);

      invocationByModal.set(modal, resolveCallingParams(modal, event));
      activeModal = modal;
      ensurePopupCtxButton(modal);
      centerModalInWorkspace(modal);
      syncModalContext(modal, 'opening');
    });

    modal.addEventListener('shown.bs.modal', () => {
      activeModal = modal;
      centerModalInWorkspace(modal);
      syncModalContext(modal, 'open');
    });

    modal.addEventListener('hide.bs.modal', () => {
      if (activeModal === modal) syncModalContext(modal, 'closing');

      // Bootstrap deactivates its focus handling during hide(). Move focus after
      // that synchronous step but before aria-hidden is applied by the fade.
      const active = document.activeElement;
      if (!(active instanceof HTMLElement) || !modal.contains(active)) return;

      queueMicrotask(() => {
        const focused = document.activeElement;
        if (!(focused instanceof HTMLElement) || !modal.contains(focused)) return;
        const target = returnFocus.get(modal);
        if (target instanceof HTMLElement && target.isConnected) {
          target.focus({ preventScroll: true });
        } else {
          focused.blur();
        }
      });
    });

    modal.addEventListener('hidden.bs.modal', () => {
      const ctxButton = modal.querySelector('[data-popup-ctx-inspect]');
      clearInspection(ctxButton);
      ctxButton?.classList.add('d-none');

      const target = returnFocus.get(modal);
      if (target instanceof HTMLElement && target.isConnected) {
        target.focus({ preventScroll: true });
      }
      returnFocus.delete(modal);
      invocationByModal.delete(modal);

      // During modal-to-modal transitions, the next popup may already own the
      // canonical popup CTX node. Never let the previous popup clear it.
      if (activeModal === modal) {
        const handle = surfaceByModal.get(modal);
        if (handle) {
          closeUiLevel(handle);
          surfaceByModal.delete(modal);
        }
        activeModal = null;
      }
    });
  });

  window.addEventListener('resize', refreshVisibleModalCenters);

  window.ManatOSPopupRuntime = Object.freeze({
    popupPath,
    replaceContext,
    clearContext,
    createPayload,
    refreshVisibleModalCenters,
    setInspectionVisible,
    toggleInspection,
    clearInspection,
    uiLeaf,
    preparePopupPlacement,
    openUiLevel,
    updateUiLevel,
    surfaceResult,
    closeUiLevel,
  });
})();
