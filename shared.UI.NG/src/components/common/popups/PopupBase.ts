import { multilingual } from '@manatos/shared-ui';
import { uiModalHost, type UiModalLease } from '../../../runtime/modal-host';
import {
  Directive,
  ElementRef,
  HostListener,
  Injector,
  OnDestroy,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';

import { appendContextPathMember, type MetadataLanguage } from '@manatos/shared';
import type { ContextTreeRuntime, ManatOSRuntimeRootContext } from '@manatos/shared';

import {
  UiPopupRuntime,
  popupViews,
  type UiLanguageDefinition,
  type UiPageTemplateContext,
  type UiPopupDefinition,
  type UiPopupTabDefinition,
  type UiPublicExternalAuthProvider,
  type UiSurfaceOpenOptions,
  type UiPopupLevel,
  type UiSurfaceCloseReason,
  type UiSurfaceEventListener,
} from '@manatos/shared-ui';

import { PopupContext } from '../../surfaces/PopupContext';

import { PopupBodyOutlet } from './PopupBodyOutlet';

/**
 * Canonical Angular popup lifecycle for every ManatOS popup.
 *
 * Subclasses provide only their shared.UI popup definition.
 * The common Popup.html renders all definitions.
 *
 * One opening creates exactly one UiPopupRuntime and one
 * PopupContext. All components receive that same handle.
 *
 * CTX ownership, rule evaluation, action authorization and
 * tab transitions remain in shared.UI.
 *
 * Angular owns:
 * - DOM and focus
 * - Scroll locking
 * - Keyboard handling
 * - Semantic #layout element registration
 *
 * Closing disposes the runtime and its CTX subscriptions.
 */
@Directive()
export abstract class PopupBase implements OnDestroy {
  protected readonly multilingual = computed(() => multilingual(this.popupLanguage(), []));

  protected abstract definition: UiPopupDefinition;

  readonly contextTree = input.required<ContextTreeRuntime<ManatOSRuntimeRootContext>>();

  /** Owning UI surface; null means the current deepest surface. */
  readonly parentLevelPath = input<string | null>(null);

  /** Scale inherited at opening; subsequent changes belong to this popup only. */
  readonly initialFontScalePercent = input(100);
  readonly fontScaleChanged = output<number>();
  readonly languages = input<readonly UiLanguageDefinition[]>([]);
  readonly currentLanguage = input<UiLanguageDefinition | null>(null);
  readonly languageSelected = output<string>();
  /**
   * Requests inspection of this popup's existing CTX #level.
   * The popup does not create or control a debugger instance.
   */
  readonly debuggerRequested = output<string>();
  readonly flowDebuggerRequested = output<string>();
  readonly debuggerForeground = input(false);
  readonly debuggerAllowed = input(false);

  private unsubscribeSurfaceEvent: (() => void) | null = null;

  /**
   * The application host supplies provider discovery.
   * The popup owns the resulting CTX resource.
   *
   * Embedded components never receive an API client.
   */
  readonly externalProvidersLoader = input<
    (() => Promise<readonly UiPublicExternalAuthProvider[]>) | null
  >(null);

  /**
   * The application host performs authentication.
   * The popup only submits credentials and manages its own lifecycle.
   */
  readonly externalProviderRequested = output<string>();

  readonly signInHandler = input<((identity: string, password: string) => Promise<void>) | null>(
    null,
  );

  readonly debuggerDocked = input(true);
  readonly debuggerDockWidth = input<number | null>(null);
  readonly opened = output<void>();
  readonly closed = output<void>();

  protected readonly popupLanguage = computed<MetadataLanguage>(() =>
    this.currentLanguage()?.id?.toUpperCase() === 'EL' ? 'EL' : 'EN',
  );

  /** Display-only localization; never mutates the popup definition or CTX. */

  protected localizedTitle = computed(() => {
    const title = this.activeTab().title;
    return {
      ...title,
      title: this.multilingual().resolve(title.title),
      subtitle: this.multilingual().resolve(title.subtitle),
    };
  });

  protected readonly fontScalePercent = signal(100);

  /** Feature popups may expose persisted-draft dirty state to the shared footer. */
  protected popupDirty(): boolean {
    return false;
  }

  protected popupSaveMode(): 'create' | 'update' {
    return 'create';
  }

  protected readonly popupContext = signal<PopupContext | null>(null);

  /** Optional domain controller supplied by a feature popup to its registered body. */
  protected readonly popupFeatureContext = signal<unknown>(null);

  /** Static-template context projected from the existing CTX root. */
  protected readonly staticContentContext = computed<UiPageTemplateContext>(() => {
    const company = this.contextTree().root().company;
    const language = this.currentLanguage()?.id ?? 'en';

    return {
      $language: language,
      company,
      platform: company.platforms.find((item) => item.id === company.currentPlatform) ?? null,
    };
  });

  protected readonly views = computed(
    () => this.popupContext()?.views ?? popupViews(this.definition),
  );

  protected readonly activeTab = computed(
    () => this.popupContext()?.activeTab() ?? this.views()[0]!,
  );

  private readonly injector = inject(Injector);

  private readonly dialog = viewChild<ElementRef<HTMLElement>>('dialog');

  private readonly contentHosts = viewChildren(PopupBodyOutlet);

  private modalLease: UiModalLease | null = null;

  private unsubscribeAction: (() => void) | null = null;

  private openSequence = 0;

  open(
    invocation: UiSurfaceOpenOptions = {},
    onSurfaceEvent?: UiSurfaceEventListener<UiPopupLevel>,
  ): PopupContext {
    const existing = this.popupContext();
    if (existing) return existing;
    this.fontScalePercent.set(this.initialFontScalePercent());

    // Build the CTX owner before acquiring browser modal resources.
    //
    // A failed construction must leave focus and body scroll untouched.
    const runtime = new UiPopupRuntime(
      this.contextTree(),
      this.definition,
      this.parentLevelPath(),
      invocation,
    );
    let lease: UiModalLease | null = null;
    let unsubscribe: (() => void) | null = null;
    let unsubscribeSurfaceEvent: (() => void) | null = null;
    try {
      lease = uiModalHost.acquire(
        document,
        () => this.dialog()?.nativeElement ?? null,
        () => this.debuggerForeground(),
      );
      const popup = new PopupContext(runtime);

      unsubscribeSurfaceEvent = onSurfaceEvent ? popup.onSurfaceEvent(onSurfaceEvent) : null;
      this.unsubscribeSurfaceEvent = unsubscribeSurfaceEvent;

      // Concrete popups interpret feature actions; this host only implements
      // the standard dismissal policy and shared lifecycle.
      unsubscribe = popup.onAction((request) => {
        if (request.actionId === 'cancel') {
          this.close(false, 'button', request.actionId);
          return;
        }
        const action = (this.definition.actions ?? popup.activeTab().actions).find(
          (item) => item.id === request.actionId,
        );
        const mapped =
          popup.level().control.flow?.events[request.actionId] ??
          popup.level().control.invocation.events[request.actionId];
        if (action?.dismissIfUnmapped && !mapped) {
          this.close(false, 'button', request.actionId);
          return;
        }
        this.onPopupAction(popup, request.actionId);
      });

      this.modalLease = lease;
      this.unsubscribeAction = unsubscribe;
      this.popupContext.set(popup);

      const opening = ++this.openSequence;
      this.opened.emit();
      // A synchronous opened handler can close this surface; do not resurrect it.
      if (this.popupContext() !== popup) return popup;
      this.focusActiveTab();
      this.onPopupOpened(popup, opening);
      return popup;
    } catch (error) {
      // Detach resources before invoking user-controlled cleanup callbacks.
      ++this.openSequence;
      // A listener may already have closed and reopened this same host.
      // Never clear the replacement owner's state while rolling back this opening.
      if (this.modalLease === lease) {
        this.popupContext.set(null);
        this.unsubscribeAction = null;
        this.modalLease = null;
      }
      try {
        unsubscribe?.();
      } catch {
        /* Preserve the original opening failure. */
      }
      try {
        runtime.dispose();
      } catch {
        /* Preserve the original opening failure. */
      }
      try {
        unsubscribeSurfaceEvent?.();
        if (this.unsubscribeSurfaceEvent === unsubscribeSurfaceEvent)
          this.unsubscribeSurfaceEvent = null;
      } catch {
        /* Preserve the original opening failure. */
      }
      try {
        lease?.release();
      } catch {
        /* Preserve the original opening failure. */
      }
      throw error;
    }
  }

  /** Read native credential controls only at the Flow's submission boundary. */
  readSignInCredentials(): { identity: string; password: string } | null {
    return (
      this.contentHosts()
        .find((host) => host.tab().id === 'signin')
        ?.credentials()
        ?.signInValues() ?? null
    );
  }

  readRegisterCredentials(): {
    name: string;
    email: string;
    password: string;
    confirmation: string;
  } | null {
    return (
      this.contentHosts()
        .find((host) => host.tab().id === 'email')
        ?.credentials()
        ?.registerValues() ?? null
    );
  }

  readResetPasswordCredentials(): { password: string; confirmation: string } | null {
    return (
      this.contentHosts()
        .find((host) => host.tab().id === 'reset')
        ?.credentials()
        ?.resetPasswordValues() ?? null
    );
  }

  readChangePasswordCredentials(): {
    currentPassword: string;
    password: string;
    confirmation: string;
  } | null {
    return (
      this.contentHosts()
        .find((host) => host.tab().id === 'change')
        ?.credentials()
        ?.changePasswordValues() ?? null
    );
  }

  /** Feature popups may resolve an adapter-specific tab label without mutating the stable tab IDs. */
  protected tabStatusIcon(tabId: string): string {
    void tabId;
    return '';
  }

  protected tabTitle(tab: UiPopupTabDefinition): string {
    return this.multilingual().resolve(tab.title.title);
  }

  /** Override only in a popup that owns a feature-specific action/workflow. */
  protected onPopupAction(popup: PopupContext, actionId: string): void {
    void popup;
    void actionId;
  }

  /** Post-mount capability hook. Opening token guards late async completion. */
  protected onPopupOpened(popup: PopupContext, opening: number): void {
    void popup;
    void opening;
  }

  protected isCurrentOpening(popup: PopupContext, opening: number): boolean {
    return this.openSequence === opening && this.popupContext() === popup;
  }

  close(
    force = false,
    reason: UiSurfaceCloseReason = 'flow',
    actionId: string | null = null,
  ): void {
    const popup = this.popupContext();
    if (!popup) return;
    if (popup.busy() && !force) return;

    // Preserve the parent until its child surface has closed.
    const childPath = appendContextPathMember(popup.levelPath, 'level');
    if (this.contextTree().get(childPath) !== undefined) {
      throw new Error(`Close the child surface before closing ${popup.levelPath}.`);
    }

    popup.setClosingResult(reason, actionId);

    // Invalidate outstanding provider responses before CTX disposal.
    // Release the browser modal lease even if reset, disposal or an output listener throws.
    let firstError: unknown;
    const cleanup = (step: () => void): void => {
      try {
        step();
      } catch (error) {
        firstError ??= error;
      }
    };
    ++this.openSequence;
    cleanup(() => {
      for (const content of this.contentHosts()) content.resetCredentials();
    });
    this.popupContext.set(null);
    const unsubscribe = this.unsubscribeAction;
    const unsubscribeSurfaceEvent = this.unsubscribeSurfaceEvent;
    const lease = this.modalLease;
    this.unsubscribeAction = null;
    this.unsubscribeSurfaceEvent = null;
    this.modalLease = null;
    cleanup(() => unsubscribe?.());
    // Release the exact closing lease, even if closed.emit() synchronously reopens.
    cleanup(() => popup.dispose());
    cleanup(() => unsubscribeSurfaceEvent?.());
    cleanup(() => lease?.release());
    cleanup(() => this.closed.emit());
    if (firstError !== undefined) throw firstError;
  }

  protected setFontScalePercent(percent: number): void {
    this.fontScalePercent.set(percent);
  }

  /**
   * Shared.UI controls navigation and validates action eligibility.
   * Angular supplies focus changes after the tab transition.
   */
  protected requestAction(actionId: string): void {
    const popup = this.popupContext();
    if (!popup) return;

    const previousTab = popup.activeTab().id;

    popup.requestAction(actionId);

    if (this.popupContext() !== popup) return; // A Flow callback may close synchronously.
    if (popup.activeTab().id !== previousTab) {
      this.focusActiveTab();
    }
  }

  protected requestFlowDebugger(path: string): void {
    if (!this.debuggerAllowed() || this.contextTree().get(path) === undefined) return;
    this.flowDebuggerRequested.emit(path);
  }

  protected requestDebugger(): void {
    const popup = this.popupContext();
    if (!popup || !this.debuggerAllowed()) return;

    this.debuggerRequested.emit(popup.levelPath);
  }

  protected selectVisibleTab(tabId: string): void {
    const popup = this.popupContext();
    if (!popup || popup.busy() || !popup.tabVisible(tabId) || !popup.tabEnabled(tabId)) return;
    const previous = popup.activeTab().id;
    popup.selectTab(tabId);
    if (popup.activeTab().id !== previous) this.focusActiveTab();
  }

  protected requestEmailMethod(actionId: string): void {
    this.requestAction(actionId);
  }

  protected requestPasswordRecovery(actionId: string): void {
    this.requestAction(actionId);
  }

  /** External-provider intent is published before the existing NG1 handler. */
  protected requestExternalProvider(provider: string): void {
    const popup = this.popupContext();
    if (!popup || popup.busy()) return;
    popup.requestSurfaceAction('externalProvider', provider);
    if (!popup.level().control.flow?.events.externalProvider) {
      this.externalProviderRequested.emit(provider);
    }
  }

  /**
   * Submit through the declared action, not through a duplicate
   * Angular validation/enablement engine.
   */
  protected submit(event: Event, tabId: string): void {
    event.preventDefault();

    const popup = this.popupContext();
    if (!popup || popup.activeTab().id !== tabId) return;

    const submitAction = (this.definition.actions ?? popup.activeTab().actions).find(
      (action) => action.type === 'submit',
    );

    if (submitAction) popup.requestAction(submitAction.id);
  }

  protected requestXClose(): void {
    const popup = this.popupContext();
    if (!popup?.level().control.invocation.allowXClosure) return;

    this.close(false, 'x');
  }

  protected onBackdropClick(event: MouseEvent): void {
    const popup = this.popupContext();

    if (!popup || popup.busy() || !popup.level().control.invocation.allowBackdropClosure) return;

    if (event.target === event.currentTarget && this.modalLease?.isTopmost()) {
      this.close(false, 'backdrop');
    }
  }

  /**
   * Focus the active tab's first meaningful input.
   * On the registration-method tab this is the Email method action.
   */
  protected focusActiveTab(): void {
    afterNextRender(
      () => {
        const popup = this.popupContext();
        if (!popup) return;

        const content = this.contentHosts().find((item) => item.tab().id === popup.activeTab().id);

        // Reconcile declared semantic children after tab activation, independently of DOM.
        popup.reconcileTabLayout(popup.activeTab().id);
        if (this.modalLease?.isTopmost()) {
          if (content) content.focusFirst();
          else
            (
              this.dialog()?.nativeElement.querySelector<HTMLElement>('button:not([disabled])') ??
              this.dialog()?.nativeElement
            )?.focus();
        }
      },
      { injector: this.injector },
    );
  }

  @HostListener('document:keydown', ['$event'])
  protected onDocumentKeydown(event: KeyboardEvent): void {
    if (!this.popupContext() || !this.modalLease?.isTopmost()) return;

    if (event.key === 'Escape') {
      if (this.popupContext()?.busy()) return;

      const popup = this.popupContext();
      if (!popup) return;

      const invocation = popup.level().control.invocation;

      const cancelAvailable = (this.definition.actions ?? popup.activeTab().actions).some(
        (action) =>
          action.id === 'cancel' &&
          popup.actionEnabled(action.id) &&
          popup.actionVisible(action.id),
      );

      if (!invocation.allowXClosure && !invocation.allowBackdropClosure && !cancelAvailable) return;

      const dialog = this.dialog()?.nativeElement;

      // While the debugger is foregrounded, Escape belongs to the
      // debugger when keyboard focus is outside this popup.
      if (
        this.debuggerForeground() &&
        (!dialog || !(event.target instanceof Node) || !dialog.contains(event.target))
      )
        return;

      event.preventDefault();
      this.close(false, 'escape');
      return;
    }

    // When the debugger is in front, keyboard focus may leave the
    // modal and move through the existing debugger panels.
    if (event.key !== 'Tab' || this.debuggerForeground()) return;

    const dialog = this.dialog()?.nativeElement;
    if (!dialog) return;

    const elements = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), ' + 'select:not([disabled]), a[href]',
      ),
    ).filter((element) => !element.closest('[hidden]'));

    if (!elements.length) {
      event.preventDefault();
      dialog.focus();
      return;
    }

    const first = elements[0];
    const last = elements[elements.length - 1];
    const active = document.activeElement;

    if (!dialog.contains(active)) {
      event.preventDefault();
      first.focus();
    } else if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  ngOnDestroy(): void {
    this.close(true, 'host');
  }
}
