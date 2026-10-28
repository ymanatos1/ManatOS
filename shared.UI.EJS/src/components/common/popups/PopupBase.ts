import { acquireEjsModal, type EjsModalLease } from '../../../runtime/modal-host.js';
import {
  createPopupBodyRenderers,
  type PopupBodyRendererRegistry,
  type PopupBodyRenderer,
  type PopupBodyKind,
} from './PopupBodyRenderers.js';
import { PopupContext } from '../../surfaces/PopupContext.js';
import { PopupTitle, type MountedPopupTitle } from '../../surfaces/PopupTitle.js';
import { PopupActions } from '../../surfaces/PopupActions.js';
import type { ContextTreeRuntime, ManatOSRuntimeRootContext } from '@manatos/shared';
import {
  UiPopupRuntime,
  multilingual,
  type UiPopupDefinition,
  type UiPopupTabDefinition,
  type UiPopupText,
  type UiPopupLevel,
  type UiLanguageDefinition,
  type UiSurfaceHandle,
  type UiSurfaceOpenOptions,
  type UiSurfaceCloseReason,
  type UiSurfaceEventListener,
} from '@manatos/shared-ui';

function text(value: UiPopupText | undefined, language: 'EN' | 'EL'): string {
  if (value === undefined) return '';
  return multilingual(language, []).resolve(value);
}

interface MountedPopup {
  readonly runtime: UiPopupRuntime;
  readonly context: PopupContext;
  readonly element: HTMLDivElement;
  readonly inputs: Map<string, Map<string, HTMLInputElement>>;
  readonly unsubscribe: () => void;
  readonly close: (reason?: UiSurfaceCloseReason, actionId?: string | null) => void;
}

/**
 * Presentation callbacks belong to the browser/session owner, never to CTX.
 * A concrete popup receives one immutable host boundary. Only the manager
 * owns the registry, popup stack, and cross-popup lifecycle decisions.
 */
export interface EjsPopupHost {
  readonly context: ContextTreeRuntime<ManatOSRuntimeRootContext>;
  readonly language: () => 'EN' | 'EL';
  readonly languages: () => readonly UiLanguageDefinition[];
  readonly revealContext?: (path: string) => boolean;
  readonly selectLanguage?: (language: string) => void;
  readonly initialFontScalePercent: () => number;
  readonly debuggerDockWidth: () => number | null;
  readonly revealFlowStep?: (path: string) => boolean;
  readonly isDebuggerForeground: () => boolean;
  readonly requestClose: (reason: UiSurfaceCloseReason, actionId: string | null) => void;
  readonly opened: () => void;
  readonly closed: () => void;
}

/**
 * One EJS semantic popup instance, equivalent to NG1's PopupBase component.
 *
 * A popup owns one UiPopupRuntime and its one CTX #level, DOM, modal lease,
 * native credential controls, layout reconciliation, and event subscriptions.
 * Inactive tabs remain mounted and keep separate native inputs. The manager
 * decides whether closing is legal (nested surfaces) and in which order.
 */
export class PopupBase {
  private mounted: MountedPopup | null = null;
  private debuggerAvailable = true;
  private title: MountedPopupTitle | null = null;
  private debuggerWidthObserver: ResizeObserver | null = null;
  private observedDebuggerDock: HTMLElement | null = null;
  private readonly actions: PopupActions;
  private readonly bodyRenderers: PopupBodyRendererRegistry;

  constructor(
    private readonly name: string,
    private readonly definition: UiPopupDefinition,
    private readonly invocation: UiSurfaceOpenOptions,
    private readonly host: EjsPopupHost,
  ) {
    this.actions = new PopupActions(host.language);
    this.bodyRenderers = createPopupBodyRenderers(host.language, () => {
      const company = host.context.root().company;
      return {
        company,
        platform: company.platforms.find((item) => item.id === company.currentPlatform) ?? null,
      };
    });
  }

  /** Feature content registers at its concrete popup, not in generic popup infrastructure. */
  protected registerBodyRenderer(kind: PopupBodyKind, renderer: PopupBodyRenderer): void {
    this.bodyRenderers.register(kind, renderer);
  }

  protected get popupRuntime(): UiPopupRuntime | null {
    return this.mounted?.runtime ?? null;
  }

  protected onDisposed(): void {}

  /** Feature-specific tab readiness, empty for generic UIS popups. */
  protected tabStatusIcon(tabId: string): string {
    void tabId;
    return '';
  }

  /** Concrete popups may provide a live metadata-driven tab title. */
  protected displayTitle(tab: UiPopupTabDefinition): UiPopupTabDefinition['title'] {
    return tab.title;
  }

  get levelPath(): string | null {
    return this.mounted?.runtime.levelPath ?? null;
  }

  /** Refresh only this popup, without iterating or modifying the manager stack. */
  refreshDebuggerControls(allowed: boolean): void {
    this.debuggerAvailable = allowed;
    const popup = this.mounted;
    if (!popup) return;
    const dialog = popup.element.querySelector<HTMLElement>('[role="dialog"]');
    if (dialog) {
      if (this.host.isDebuggerForeground()) dialog.removeAttribute('aria-modal');
      else dialog.setAttribute('aria-modal', 'true');
    }
    this.title?.updateDebugger(allowed, this.host.isDebuggerForeground());
    // Follow live dock resizing, including a debugger moved between the main
    // document and a detached window. Do not subscribe to unrelated CTX state.
    const dock = popup.element.ownerDocument.querySelector<HTMLElement>(
      '[data-manatos-debugger-host] .developer-tools-dock',
    );
    if (dock !== this.observedDebuggerDock) {
      this.debuggerWidthObserver?.disconnect();
      this.observedDebuggerDock = dock;
      if (dock && typeof ResizeObserver !== 'undefined') {
        this.debuggerWidthObserver = new ResizeObserver(() => {
          this.refreshDebuggerControls(this.debuggerAvailable);
        });
        this.debuggerWidthObserver.observe(dock);
      } else {
        this.debuggerWidthObserver = null;
      }
    }
    // Match NG1: a foreground dock must not cover the popup's title controls.
    // Detached debug windows have a different ownerDocument and require no inset.
    const width =
      allowed && this.host.isDebuggerForeground() ? this.host.debuggerDockWidth() : null;
    popup.element.style.paddingRight =
      width !== null && width > 0 ? `${Math.round(width) + 16}px` : '';
  }

  open(): UiSurfaceHandle {
    if (this.mounted) throw new Error(`UI surface already open: ${this.name}`);
    const { name, definition, invocation } = this;
    const presentation = definition.presentation?.content ?? 'standard';
    const variant = definition.presentation?.variant;
    const runtime = new UiPopupRuntime(this.host.context, definition, null, invocation);
    const popupContext = new PopupContext(runtime);
    const element = document.createElement('div');
    element.className = 'ejs-semantic-popup-backdrop';
    // NG1 keeps every hidden tab mounted. Each tab owns native fields independently.
    const inputs = new Map<string, Map<string, HTMLInputElement>>();
    // Preserve native field elements between hidden-tab changes; sensitive values never enter CTX.
    // No other session or popup can access this per-surface map.
    let disposed = false;
    let modalLease: EjsModalLease | null = null;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!modalLease?.isTopmost()) return;
      if (event.key === 'Escape') {
        if (runtime.level.state.busy) return;
        const policy = runtime.level.control.invocation;
        const canCancel = (definition.actions ?? runtime.activeTab.actions).some(
          (action) =>
            action.id === 'cancel' &&
            runtime.level.state.actions[action.id] === true &&
            runtime.level.state.visibleActions[action.id] !== false,
        );
        if (!policy.allowXClosure && !policy.allowBackdropClosure && !canCancel) return;
        // A foreground debugger owns Escape while focus is outside the dialog.
        if (this.host.isDebuggerForeground() && !element.contains(event.target as Node)) return;
        event.preventDefault();
        close('escape');
        return;
      }
      // Native inputs are not inside an HTML form: implement the same keyboard
      // submission semantics as a submit button, without bypassing shared Flow
      // enablement/visibility rules or accidentally submitting a hidden tab.
      if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {
        if (!element.contains(event.target) || event.isComposing || event.repeat) return;
        const action = (definition.actions ?? runtime.activeTab.actions).find(
          (candidate) =>
            candidate.type === 'submit' &&
            runtime.level.state.visibleActions[candidate.id] !== false &&
            runtime.level.state.actions[candidate.id] === true,
        );
        event.preventDefault();
        if (action && !runtime.level.state.busy) runtime.requestAction(action.id);
        return;
      }
      // Keep keyboard navigation inside the foremost semantic surface, including
      // its own title controls. Nested surfaces are handled by stack order.
      if (event.key !== 'Tab' || this.host.isDebuggerForeground()) return;
      const focusable = Array.from(
        element.querySelectorAll<HTMLElement>(
          'button:not([disabled]):not([hidden]), input:not([disabled]):not([hidden]), select:not([disabled]):not([hidden]), textarea:not([disabled]):not([hidden]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((control) => control.getClientRects().length > 0);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) {
        event.preventDefault();
        return;
      }
      if (
        event.shiftKey &&
        (document.activeElement === first || !element.contains(document.activeElement))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last || !element.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    };

    const close = (reason: UiSurfaceCloseReason = 'flow', actionId: string | null = null): void => {
      this.host.requestClose(reason, actionId);
    };
    // Called only by the owning manager after validating nested-surface order.
    // Internal controls request closure rather than disposing an ancestor directly.
    const dispose = (
      reason: UiSurfaceCloseReason = 'flow',
      actionId: string | null = null,
    ): void => {
      if (disposed) return;
      // Flow-driven closure must work while busy; user dismissal must not.
      if (
        runtime.level.state.busy &&
        (reason === 'button' || reason === 'x' || reason === 'backdrop' || reason === 'escape')
      )
        return;
      disposed = true;
      let firstError: unknown;
      const cleanup = (step: () => void): void => {
        try {
          step();
        } catch (error) {
          firstError ??= error;
        }
      };
      // The disposing Flow observer must see the final #control.result while
      // CTX is still alive. Even a throwing observer must not leak the modal.
      cleanup(() => runtime.setClosingResult(reason, actionId));
      cleanup(() => runtime.dispose());
      cleanup(() => this.onDisposed());
      cleanup(() => mounted.unsubscribe());
      for (const tabInputs of inputs.values()) {
        for (const [id, input] of tabInputs) {
          if (definition.fields.some((field) => field.id === id && field.sensitive))
            input.value = '';
        }
        tabInputs.clear();
      }
      inputs.clear();
      if (this.mounted === mounted) this.mounted = null;
      cleanup(() => this.title?.dispose());
      this.title = null;
      this.debuggerWidthObserver?.disconnect();
      this.debuggerWidthObserver = null;
      this.observedDebuggerDock = null;
      document.removeEventListener('keydown', onKeyDown);
      element.remove();
      // Release focus/scroll after removing the owned DOM; the underlying
      // surface (or the initiating control) receives focus exactly once.
      cleanup(() => modalLease?.release());
      modalLease = null;
      cleanup(() => this.host.closed());
      if (firstError !== undefined) throw firstError;
    };

    let activeTab = '';
    // The NG adapter mounts *all* hidden tabs under one popup. Keep their
    // controls and semantic DOM identities instead of replacing a tab's native
    // inputs when switching. Only the active tab participates in actions/focus.
    const focusedFieldByTab = new Map<string, string>();
    const panels = new Map<string, HTMLElement>();
    let composing = false;
    const render = (): void => {
      if (disposed || composing) return;
      composing = true;
      try {
        const tab = runtime.activeTab;
        if (!panels.size) {
          const dialog = document.createElement('section');
          dialog.className = 'ejs-semantic-popup sign-in-dialog';
          dialog.classList.toggle('register-dialog', variant === 'register');
          dialog.classList.toggle('reset-dialog', variant === 'reset');
          dialog.classList.toggle('change-dialog', variant === 'change');
          dialog.classList.toggle('message-dialog', presentation === 'message');
          dialog.classList.toggle('error-dialog', variant === 'error');
          dialog.classList.toggle('change-report-dialog', presentation === 'change-report');
          dialog.classList.toggle('unsaved-dialog', variant === 'unsaved');
          dialog.classList.toggle('storage-dialog', variant === 'storage');
          dialog.dataset.uiLevelPath = runtime.levelPath;
          dialog.dataset.popupActiveTab = tab.id;
          dialog.setAttribute('role', 'dialog');
          dialog.tabIndex = -1;
          if (!this.host.isDebuggerForeground()) dialog.setAttribute('aria-modal', 'true');
          dialog.setAttribute(
            'aria-label',
            text(this.displayTitle(tab).title, this.host.language()),
          );
          element.append(dialog);
          this.title = PopupTitle.mount(dialog, {
            title: this.displayTitle(tab),
            language: this.host.language,
            languages: this.host.languages(),
            selectLanguage: this.host.selectLanguage,
            showLanguageSelection: definition.showLanguageSelection,
            showClose: invocation.allowXClosure !== false,
            showFontScale: definition.allowFontScale === true,
            initialFontScalePercent: this.host.initialFontScalePercent(),
            showDebugger: this.host.revealContext !== undefined,
            flowStepPath: invocation.flow?.stepPath,
            debuggerRequested: () => {
              if (!this.debuggerAvailable) return;
              this.host.revealContext?.(runtime.levelPath);
              this.refreshDebuggerControls(this.debuggerAvailable);
            },
            flowDebuggerRequested: () => {
              if (!this.debuggerAvailable || !invocation.flow?.stepPath) return;
              (this.host.revealFlowStep ?? this.host.revealContext)?.(invocation.flow.stepPath);
              this.refreshDebuggerControls(this.debuggerAvailable);
            },
            closeRequested: () => {
              if (!runtime.level.state.busy) close('x');
            },
          });

          if (definition.presentation?.tabNavigation === 'visible') {
            const navigation = document.createElement('nav');
            navigation.className = 'ejs-storage-tab-navigation';
            navigation.setAttribute('aria-label', 'Storage configuration tabs');
            navigation.dataset.ejsPopupTabNavigation = '';
            for (const view of runtime.views) {
              const button = document.createElement('button');
              button.type = 'button';
              button.dataset.ejsPopupTabButton = view.id;
              button.addEventListener('click', () => {
                if (!runtime.level.state.busy && runtime.canSelectTab(view.id))
                  runtime.selectTab(view.id);
              });
              navigation.append(button);
            }
            dialog.append(navigation);
          }

          // Build every semantic tab once, including its embedded components.
          // Each tab has an independent native credential map, while all tabs
          // publish safe projections into the one UiPopupRuntime CTX level.
          for (const declaredTab of runtime.views) {
            const panel = document.createElement('section');
            panel.className = 'register-tab';
            panel.dataset.ejsTabPanel = declaredTab.id;
            panel.setAttribute('role', 'tabpanel');
            panel.setAttribute(
              'aria-label',
              text(this.displayTitle(declaredTab).title, this.host.language()),
            );
            panel.hidden = declaredTab.id !== tab.id;
            panel.style.display = declaredTab.id === tab.id ? '' : 'none';
            panels.set(declaredTab.id, panel);
            const content = document.createElement('div');
            content.className = 'ejs-semantic-popup-content sign-in-content';
            content.dataset.popupTab = declaredTab.id;
            panel.append(content);
            const tabInputs = new Map<string, HTMLInputElement>();
            inputs.set(declaredTab.id, tabInputs);
            const reconcile = (): void => {
              if (!disposed) popupContext.reconcileTabLayout(declaredTab.id);
            };
            this.bodyRenderers.resolve(presentation).mount({
              root: content,
              runtime,
              tab: declaredTab,
              inputs: tabInputs,
              render,
              reconcile,
            });
            this.actions.render(panel, runtime, close, declaredTab);
            dialog.append(panel);
          }
          // Register all embedded layout owners after all DOM hosts exist.
          for (const declaredTab of runtime.views) popupContext.reconcileTabLayout(declaredTab.id);
        }

        const dialog = element.querySelector<HTMLElement>('[role="dialog"]');
        if (!dialog) return;
        const changingTab = activeTab !== tab.id;
        if (changingTab) {
          const oldFocus = document.activeElement;
          if (oldFocus instanceof HTMLInputElement && activeTab) {
            const oldPanel = panels.get(activeTab);
            const oldId = oldFocus.dataset['ejsCredentialId'];
            if (oldId && oldPanel?.contains(oldFocus)) focusedFieldByTab.set(activeTab, oldId);
          }
        }
        activeTab = tab.id;
        dialog.dataset.popupActiveTab = tab.id;
        dialog.setAttribute('aria-label', text(this.displayTitle(tab).title, this.host.language()));
        this.title?.updateTitle(this.displayTitle(tab));
        for (const button of dialog.querySelectorAll<HTMLButtonElement>(
          '[data-ejs-popup-tab-button]',
        )) {
          const id = button.dataset['ejsPopupTabButton'] ?? '';
          const view = runtime.views.find((candidate) => candidate.id === id);
          const available = runtime.canSelectTab(id);
          button.hidden = !runtime.tabVisible(id);
          button.disabled = runtime.level.state.busy || !available;
          button.classList.toggle('active', id === tab.id);
          button.setAttribute('aria-current', String(id === tab.id));
          if (view) {
            const label = text(this.displayTitle(view).title, this.host.language());
            const icon = this.tabStatusIcon(id);
            button.replaceChildren();
            if (icon) {
              const indicator = document.createElement('i');
              indicator.className = `bi ${icon} me-1`;
              indicator.setAttribute('aria-hidden', 'true');
              button.append(indicator);
            }
            button.append(document.createTextNode(label));
          }
        }

        const panel = panels.get(tab.id);
        if (!panel) return;
        for (const [id, candidate] of panels) {
          const selected = id === tab.id;
          candidate.hidden = !selected;
          candidate.style.display = selected ? '' : 'none';
        }
        const actions = this.actions;
        actions.update(panel, runtime, tab);
        this.title?.updateBusy(runtime.level.state.busy);
        this.bodyRenderers.resolve(presentation).update?.(panel, runtime);
        if (changingTab) {
          const rememberedId = focusedFieldByTab.get(tab.id);
          const content = panel.querySelector<HTMLElement>('.ejs-semantic-popup-content');
          const focus =
            Array.from(
              content?.querySelectorAll<HTMLInputElement>('input:not([disabled])') ?? [],
            ).find((input) => input.dataset['ejsCredentialId'] === rememberedId) ??
            content?.querySelector<HTMLInputElement>('input:not([disabled])');
          if (modalLease?.isTopmost() && !this.host.isDebuggerForeground()) {
            (
              focus ??
              panel.querySelector<HTMLButtonElement>('button:not([disabled]):not([hidden])') ??
              dialog
            ).focus();
          }
        }
      } finally {
        composing = false;
      }
    };
    const unsubscribe = runtime.subscribe(render);
    const mounted: MountedPopup = {
      runtime,
      context: popupContext,
      element,
      inputs,
      unsubscribe,
      close: dispose,
    };
    this.mounted = mounted;
    try {
      modalLease = acquireEjsModal(
        document,
        () => element.querySelector<HTMLElement>('[role="dialog"]'),
        this.host.isDebuggerForeground,
      );
      document.body.append(element);
      // Match NG1 SurfacesHost.opened: a newly mounted nested surface takes
      // foreground ownership back from any popup debugger presentation.
      this.host.opened();
      this.refreshDebuggerControls(this.debuggerAvailable);
      element.addEventListener('mousedown', (event) => {
        if (
          event.target === element &&
          runtime.level.control.invocation.allowBackdropClosure &&
          !runtime.level.state.busy &&
          modalLease?.isTopmost() === true
        )
          close('backdrop');
      });
      document.addEventListener('keydown', onKeyDown);
      render();
      // The title is composed by render(); initialize its debugger controls
      // after the DOM exists as well as updating any underlying popup.
      this.refreshDebuggerControls(this.debuggerAvailable);
      // The caller registers Flow listeners on the returned handle. Never emit
      // shown synchronously before the Flow has subscribed to the surface.
      queueMicrotask(() => {
        if (!disposed) runtime.notifyShown();
      });
    } catch (error) {
      try {
        dispose('host');
      } catch {
        /* The construction failure remains the primary error. */
      }
      throw error;
    }

    return {
      name,
      levelPath: runtime.levelPath,
      instanceId: runtime.instanceId,
      isOpen: () => !disposed,
      close,
      setBusy: (value) => {
        if (!disposed) runtime.setBusy(value);
      },
      onEvent: (listener: UiSurfaceEventListener<UiPopupLevel>) => runtime.onSurfaceEvent(listener),
      setResource: (resource, value) => {
        if (!disposed) runtime.setResource(resource, value);
      },
      setResourceStatus: (resource, status, error) => {
        if (!disposed) runtime.setResourceStatus(resource, status, error);
      },
      // The generic surface contract retains these methods for existing Flows;
      // the selected registered presenter owns the native credential policy.
      readSignInCredentials: () =>
        this.bodyRenderers.resolve(presentation).credentials?.readSignInCredentials(inputs) ?? null,
      readRegisterCredentials: () =>
        this.bodyRenderers.resolve(presentation).credentials?.readRegisterCredentials(inputs) ??
        null,
      readChangePasswordCredentials: () =>
        this.bodyRenderers
          .resolve(presentation)
          .credentials?.readChangePasswordCredentials(inputs) ?? null,
      readResetPasswordCredentials: () =>
        this.bodyRenderers
          .resolve(presentation)
          .credentials?.readResetPasswordCredentials(inputs) ?? null,
    };
  }

  /** Called by the EJS1 language switch; keeps inputs and CTX alive. */
  refreshLanguage(): void {
    const mounted = this.mounted;
    if (!mounted) return;
    const { element, runtime } = mounted;
    const dialog = element.querySelector<HTMLElement>('[role="dialog"]');
    this.title?.updateTitle(this.displayTitle(runtime.activeTab));
    this.title?.updateLanguage();
    // Rendering capabilities own localization; host only broadcasts a language change.
    this.bodyRenderers
      .resolve(runtime.definition.presentation?.content ?? 'standard')
      .refreshLanguage?.(element, runtime, this.host.language(), (id) => {
        if (this.mounted === mounted) mounted.context.reconcileTabLayout(id);
      });
    this.title?.updateDebugger(this.debuggerAvailable, this.host.isDebuggerForeground());
    for (const panel of element.querySelectorAll<HTMLElement>('[data-ejs-tab-panel]')) {
      const tab = runtime.views.find((item) => item.id === panel.dataset['ejsTabPanel']);
      if (tab)
        panel.setAttribute('aria-label', text(this.displayTitle(tab).title, this.host.language()));
    }
    dialog?.setAttribute(
      'aria-label',
      text(this.displayTitle(runtime.activeTab).title, this.host.language()),
    );
    for (const button of element.querySelectorAll<HTMLButtonElement>(
      '[data-ejs-popup-tab-button]',
    )) {
      const tab = runtime.views.find((item) => item.id === button.dataset['ejsPopupTabButton']);
      if (tab) {
        const icon = this.tabStatusIcon(tab.id);
        button.replaceChildren();
        if (icon) {
          const indicator = document.createElement('i');
          indicator.className = `bi ${icon} me-1`;
          indicator.setAttribute('aria-hidden', 'true');
          button.append(indicator);
        }
        button.append(
          document.createTextNode(text(this.displayTitle(tab).title, this.host.language())),
        );
      }
    }
    const currentPanel = element.querySelector<HTMLElement>(
      `[data-ejs-tab-panel="${runtime.activeTab.id}"]`,
    );
    if (currentPanel) this.actions.update(currentPanel, runtime);
  }

  /** Manager-only disposal. The manager closes descendants before an ancestor. */
  dispose(reason: UiSurfaceCloseReason = 'host', actionId: string | null = null): void {
    this.mounted?.close(reason, actionId);
  }
}
