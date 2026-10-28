import type { ContextTreeRuntime, ManatOSRuntimeRootContext } from '@manatos/shared';
import type { ApiHandler, ExternalProviderCatalogue } from '../../api/apiHandler.js';
import type { UiPublicExternalAuthProvider } from '../../popups/popup-definition.js';
import type { UiPopupLevel } from '../../popups/popup-runtime.js';
import type { UiSurfaceHandle, UiSurfaceManager } from '../../runtime/surface/uiSurfaceManager.js';
import type { FlowExecution, FlowStepDefinition } from '../flowRunner.js';

/** One Register surface, with internal Methods and Email tabs, owned by the Flow. */
export class RegisterFlow {
  private providerRequest: AbortController | null = null;
  constructor(
    private readonly context: ContextTreeRuntime<ManatOSRuntimeRootContext>,
    private readonly surfaces: UiSurfaceManager,
    private readonly api: ApiHandler,
  ) {}

  steps(): readonly FlowStepDefinition[] {
    return [
      {
        id: 'checkSignedIn',
        run: () => (this.context.root().runtime.user ? { stop: true } : undefined),
      },
      {
        id: 'openRegisterPopup',
        children: ['loadExternalProviders', 'createAccount', 'externalProvider', 'popupDisposing'],
        run: (execution) => this.open(execution),
      },
    ];
  }

  private open(execution: FlowExecution): Promise<void> {
    const popup = this.surfaces.open('auth.register', {
      flow: execution.surfaceFlow(execution.stepPath('openRegisterPopup'), {
        createAccount: 'auth.register.createAccountClicked',
        externalProvider: 'auth.register.externalProviderClicked',
      }),
      allowXClosure: true,
      allowBackdropClosure: false,
    });
    execution.wait('openRegisterPopup');
    return new Promise((resolve) => {
      const unsubscribe = execution.bindSurfaceEvents(popup, 'openRegisterPopup', {
        shown: { step: 'loadExternalProviders', run: () => this.loadProviders(popup) },
        'auth.register.createAccountClicked': {
          step: 'createAccount',
          run: (level) => this.create(popup, level, execution),
        },
        'auth.register.externalProviderClicked': {
          step: 'externalProvider',
          run: (level) => this.external(popup, level),
        },
        disposing: {
          step: 'popupDisposing',
          run: () => {
            this.providerRequest?.abort();
            unsubscribe();
            resolve();
          },
        },
      });
    });
  }

  private async create(
    popup: UiSurfaceHandle,
    level: UiPopupLevel,
    execution: FlowExecution,
  ): Promise<void> {
    if (!popup.isOpen() || level.state.rules.canCreateAccount !== true) return;
    const credentials = popup.readRegisterCredentials();
    if (!credentials || credentials.password !== credentials.confirmation) return;
    popup.setBusy(true);
    try {
      const result = await this.api.register(
        credentials.name,
        credentials.email,
        credentials.password,
        credentials.confirmation,
      );
      if (!popup.isOpen()) return;
      popup.setBusy(false);
      const message = result.emailSent
        ? {
            EN: 'Your account was created. Check your email for a verification link. Following the link will verify your address and sign you in.',
            EL: 'Ο λογαριασμός σας δημιουργήθηκε. Ελέγξτε το email σας για τον σύνδεσμο επιβεβαίωσης. Ακολουθώντας τον σύνδεσμο θα επιβεβαιώσετε τη διεύθυνσή σας και θα συνδεθείτε.',
          }
        : {
            EN: 'Your account was created, but verification email delivery failed. The account remains unverified. Please contact a ManatOS administrator.',
            EL: 'Ο λογαριασμός δημιουργήθηκε, αλλά η αποστολή του email επιβεβαίωσης απέτυχε. Παραμένει μη επιβεβαιωμένος. Επικοινωνήστε με διαχειριστή του ManatOS.',
          };
      await this.alert({ EN: 'Registration completed', EL: 'Η εγγραφή ολοκληρώθηκε' }, message);
      if (popup.isOpen()) popup.close();
    } catch (error) {
      if (!popup.isOpen()) return;
      popup.setBusy(false);
      await this.error(popup, execution, error);
    }
  }

  private async external(popup: UiSurfaceHandle, level: UiPopupLevel): Promise<void> {
    if (!popup.isOpen()) return;
    // OAuth registration requires distinct explicit account creation/linking; never reuse Sign-in intent.
    const id = level.data.selection.externalProviderId;
    if (!id) return;
    await this.alert(
      { EN: 'External registration', EL: 'Εγγραφή με εξωτερικό πάροχο' },
      {
        EN: 'External-provider registration is not available yet. Please use email registration.',
        EL: 'Η εγγραφή μέσω εξωτερικού παρόχου δεν είναι ακόμη διαθέσιμη. Χρησιμοποιήστε την εγγραφή με email.',
      },
    );
  }

  private async loadProviders(popup: UiSurfaceHandle): Promise<void> {
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
          return catalogue.providers.map((p): UiPublicExternalAuthProvider => ({
            ...p,
            hostAvailable: availability.enabled,
          }));
        },
        { presentation: { title: 'Loading external authentication providers' } },
      );
      if (!popup.isOpen()) return;
      popup.setResource('externalAuthProviders', providers);
      popup.setResourceStatus('externalAuthProviders', 'ready');
    } catch {
      if (popup.isOpen() && !request.signal.aborted)
        popup.setResourceStatus(
          'externalAuthProviders',
          'error',
          'External providers could not be loaded.',
        );
    } finally {
      if (this.providerRequest === request) this.providerRequest = null;
    }
  }

  private alert(
    caption: string | { EN: string; EL: string },
    text: string | { EN: string; EL: string },
  ): Promise<void> {
    const child = this.surfaces.open('message.alert', {
      params: {
        caption,
        text,
        contentPage: { folder: 'messages', name: 'Alert' },
        buttons: [{ id: 'ok', label: { EN: 'OK', EL: 'Εντάξει' } }],
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

  private async error(
    owner: UiSurfaceHandle,
    execution: FlowExecution,
    error: unknown,
  ): Promise<void> {
    if (!owner.isOpen()) return;
    const message = error instanceof Error ? error.message : 'Registration could not be completed.';
    const child = this.surfaces.open('message.error', {
      params: {
        caption: { EN: 'Registration failed', EL: 'Η εγγραφή απέτυχε' },
        text: message,
        contentPage: { folder: 'messages', name: 'ErrorInfo' },
        errorInfo: { userMessage: message, retryable: false },
        buttons: [{ id: 'ok', label: { EN: 'OK', EL: 'Εντάξει' } }],
      },
      flow: execution.surfaceFlow(execution.stepPath('openRegisterPopup', 'createAccount'), {}),
      allowXClosure: true,
      allowBackdropClosure: false,
    });
    await new Promise<void>((resolve) => {
      const unsubscribe = child.onEvent((event) => {
        if (event === 'disposing') {
          unsubscribe();
          resolve();
        }
      });
    });
  }
}
