import type { ContextTreeRuntime, ManatOSRuntimeRootContext } from '@manatos/shared';
import type { ApiHandler, ExternalProviderCatalogue } from '../../api/apiHandler.js';
import type { UiPublicExternalAuthProvider } from '../../popups/popup-definition.js';
import type { UiPopupLevel } from '../../popups/popup-runtime.js';
import type { UiSurfaceHandle, UiSurfaceManager } from '../../runtime/surface/uiSurfaceManager.js';
import type { FlowExecution, FlowStepDefinition } from '../flowRunner.js';
import type { SessionHandler } from './sessionHandler.js';

/** Hardcoded Sign In business steps; all surface interaction is through UiSurfaceManager. */
export class SignInFlow {
  private providerRequest: AbortController | null = null;

  constructor(
    private readonly context: ContextTreeRuntime<ManatOSRuntimeRootContext>,
    private readonly surfaces: UiSurfaceManager,
    private readonly api: ApiHandler,
    private readonly session: SessionHandler,
  ) {}

  steps(): readonly FlowStepDefinition[] {
    return [
      { id: 'checkSignedIn', run: () => (this.checkSignedIn() ? { stop: true } : undefined) },
      {
        id: 'openSignInPopup',
        children: [
          'loadExternalProviders',
          'signIn',
          'externalProvider',
          'sendInstructions',
          'popupDisposing',
        ],
        run: (execution) => this.openSignInPopup(execution),
      },
    ];
  }

  private checkSignedIn(): boolean {
    return this.context.root().runtime.user !== null;
  }

  private openSignInPopup(execution: FlowExecution): Promise<void> {
    const popup = this.surfaces.open('auth.signin', {
      flow: execution.surfaceFlow(execution.stepPath('openSignInPopup'), {
        externalProvider: 'auth.signin.externalProviderClicked',
        signin: 'auth.signin.signInClicked',
        sendInstructions: 'auth.signin.sendInstructionsClicked',
      }),
      allowXClosure: true,
      allowBackdropClosure: false,
    });
    execution.wait('openSignInPopup');

    return new Promise<void>((resolve) => {
      const unsubscribe = execution.bindSurfaceEvents(popup, 'openSignInPopup', {
        shown: {
          step: 'loadExternalProviders',
          run: () => this.loadExternalProvidersStep(popup),
        },
        'auth.signin.signInClicked': {
          step: 'signIn',
          run: (level) => this.signInStep(popup, level, execution),
        },
        'auth.signin.externalProviderClicked': {
          step: 'externalProvider',
          run: (level) => this.externalProviderStep(popup, level, execution),
        },
        'auth.signin.sendInstructionsClicked': {
          step: 'sendInstructions',
          run: (level) => this.sendInstructionsStep(popup, level, execution),
        },
        disposing: {
          step: 'popupDisposing',
          run: () => {
            this.providerRequest?.abort();
            // Read final #control.result/#data synchronously before the CTX level disappears.
            unsubscribe();
            resolve();
          },
        },
      });
    });
  }

  /** Sensitive password comes exclusively from the native credential input. */
  private async signInStep(
    popup: UiSurfaceHandle,
    level: UiPopupLevel,
    execution: FlowExecution,
  ): Promise<void> {
    if (!popup.isOpen() || level.state.rules.canSubmit !== true) return;
    while (popup.isOpen()) {
      const values = popup.readSignInCredentials();
      if (!values) return;
      popup.setBusy(true);
      try {
        const user = await this.api.signIn(values.identity, values.password);
        await this.session.signedIn(user);
        if (popup.isOpen()) {
          popup.setBusy(false);
          popup.close();
        }
        return;
      } catch (error) {
        if (!popup.isOpen()) return;
        popup.setBusy(false);
        const decision = await this.showError(popup, execution, 'signIn', error);
        if (decision !== 'retry') {
          if (popup.isOpen()) popup.close();
          return;
        }
      }
    }
  }

  private async externalProviderStep(
    popup: UiSurfaceHandle,
    level: UiPopupLevel,
    execution: FlowExecution,
  ): Promise<void> {
    if (!popup.isOpen()) return;
    const selected = level.data.selection.externalProviderId;
    const providers = level.data.resources.runtime.externalAuthProviders;
    if (!selected || !Array.isArray(providers)) return;
    const provider = (providers as UiPublicExternalAuthProvider[]).find(
      (candidate) =>
        candidate.provider === selected &&
        candidate.registered &&
        candidate.enabled &&
        candidate.configured &&
        candidate.hostAvailable !== false,
    );
    if (!provider) return;
    try {
      this.api.startExternalSignIn(selected);
      // OAuth leaves the page. Its callback creates the session, and NG1 restores it on return.
    } catch (error) {
      const decision = await this.showError(popup, execution, 'externalProvider', error);
      if (decision === 'retry' && popup.isOpen()) this.api.startExternalSignIn(selected);
      else if (popup.isOpen()) popup.close();
    }
  }

  private async sendInstructionsStep(
    popup: UiSurfaceHandle,
    level: UiPopupLevel,
    execution: FlowExecution,
  ): Promise<void> {
    if (!popup.isOpen() || level.state.rules.canRequestRecovery !== true) return;
    const identity = level.data.fields.recoveryIdentity?.value?.trim();
    if (!identity) return;
    while (popup.isOpen()) {
      popup.setBusy(true);
      try {
        await this.api.requestPasswordRecovery(identity);
        if (!popup.isOpen()) return;
        popup.setBusy(false);
        await this.showAlert({
          caption: {
            EN: 'Password instructions requested',
            EL: 'Ζητήθηκαν οδηγίες κωδικού πρόσβασης',
          },
          illustration: '/_manatos/pages/messages/assets/password-instructions.png',
          text: {
            EN: 'If an eligible account matches, password instructions have been sent to its registered email address.',
            EL: 'Εάν υπάρχει αντίστοιχος επιλέξιμος λογαριασμός, οι οδηγίες κωδικού πρόσβασης έχουν σταλεί στην καταχωρισμένη διεύθυνση email.',
          },
          buttons: [{ id: 'ok', label: { EN: 'OK', EL: 'Εντάξει' } }],
        });
        if (popup.isOpen()) popup.close();
        return;
      } catch (error) {
        if (!popup.isOpen()) return;
        popup.setBusy(false);
        const decision = await this.showError(popup, execution, 'sendInstructions', error);
        if (decision !== 'retry') {
          if (popup.isOpen()) popup.close();
          return;
        }
      }
    }
  }

  /** A nested ErrorInfo surface returns a decision; it never performs Retry itself. */
  private showError(
    owner: UiSurfaceHandle,
    execution: FlowExecution,
    originatingStep: string,
    error: unknown,
  ): Promise<'retry' | 'cancel'> {
    if (!owner.isOpen()) return Promise.resolve('cancel');
    const message =
      error instanceof Error ? error.message : 'The operation could not be completed.';
    const child = this.surfaces.open('message.error', {
      params: {
        caption: { EN: 'Operation failed', EL: 'Η ενέργεια απέτυχε' },
        illustration: '/_manatos/pages/messages/assets/error-illustration.svg',
        contentPage: { folder: 'messages', name: 'ErrorInfo' },
        text: message,
        errorInfo: { userMessage: message, retryable: true },
        buttons: [
          { id: 'cancel', label: { EN: 'Cancel', EL: 'Άκυρον' } },
          { id: 'retry', label: { EN: 'Retry', EL: 'Επανάληψη' } },
        ],
      },
      flow: execution.surfaceFlow(execution.stepPath('openSignInPopup', originatingStep), {
        retry: 'auth.error.retryClicked',
      }),
      allowXClosure: true,
      allowBackdropClosure: false,
    });
    return new Promise((resolve) => {
      let decision: 'retry' | 'cancel' = 'cancel';
      const unsubscribe = child.onEvent((event) => {
        if (event === 'auth.error.retryClicked') {
          decision = 'retry';
          child.close();
        } else if (event === 'disposing') {
          unsubscribe();
          resolve(decision);
        }
      });
    });
  }

  private showAlert(params: Readonly<Record<string, unknown>>): Promise<void> {
    const child = this.surfaces.open('message.alert', {
      params: {
        ...params,
        illustration:
          params['illustration'] ?? '/_manatos/pages/messages/assets/info-illustration.svg',
        contentPage: params['contentPage'] ?? { folder: 'messages', name: 'Alert' },
      },
      allowXClosure: true,
      allowBackdropClosure: false,
    });
    return new Promise((resolve) => {
      const unsubscribe = child.onEvent((event) => {
        if (event === 'disposing') {
          unsubscribe();
          resolve();
        }
      });
    });
  }

  private async loadExternalProvidersStep(popup: UiSurfaceHandle): Promise<void> {
    if (!popup.isOpen()) return;
    const request = new AbortController();
    this.providerRequest = request;
    popup.setResourceStatus('externalAuthProviders', 'loading');
    try {
      const providers = await this.api.execute(
        async () => {
          const catalogue = await this.api.get<ExternalProviderCatalogue>(
            '/api/v1/public/external-auth-providers',
            { background: true, signal: request.signal },
          );
          const availability = await this.api
            .externalHostAvailability({ background: true, signal: request.signal })
            .catch(() => ({ enabled: false }));
          return catalogue.providers.map((provider): UiPublicExternalAuthProvider => ({
            ...provider,
            hostAvailable: availability.enabled,
          }));
        },
        { presentation: { title: 'Loading external authentication providers' } },
      );
      if (!popup.isOpen()) return;
      popup.setResource('externalAuthProviders', providers);
      popup.setResourceStatus('externalAuthProviders', 'ready');
    } catch (error) {
      if (!popup.isOpen() || request.signal.aborted) return;
      popup.setResourceStatus(
        'externalAuthProviders',
        'error',
        'External providers could not be loaded.',
      );
      console.warn('[SignInFlow] Could not load external providers', error);
    } finally {
      if (this.providerRequest === request) this.providerRequest = null;
    }
  }
}
