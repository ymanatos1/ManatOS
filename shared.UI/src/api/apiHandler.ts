import type { UiPublicExternalAuthProvider } from '../popups/popup-definition.js';
import type { UiBusyPresentation } from '../runtime/ui-busy-runtime.js';
import type { UiSurfaceManager } from '../runtime/surface/uiSurfaceManager.js';
import type { ManatosApiClient } from './api-client.js';
import type { UiBrowserAuthClient } from '../browser/auth-client.js';

/** Abort stalled foreground/API requests instead of leaving the busy UI active forever. */
export const UI_API_REQUEST_TIMEOUT_MS = 15_000;

/** Background calls opt out of the global spinner (e.g. heartbeat). */
export interface ApiCallOptions {
  readonly background?: boolean;
  /** Cancels this request when its owning Flow/surface ends. */
  readonly signal?: AbortSignal;
  readonly presentation?: UiBusyPresentation;
}

/**
 * Flow-facing API boundary. The transport remains the existing API client or
 * trusted same-origin UI-host Auth client; no secrets move into browser CTX.
 * Every foreground call uses the same delayed, reference-counted busy runtime
 * displayed by the UI shell. A grouped operation can call individual methods
 * with background:true to keep one busy lease across several requests.
 */
export class ApiHandler {
  constructor(
    private readonly api: ManatosApiClient,
    private readonly auth: UiBrowserAuthClient,
    private readonly surfaces: UiSurfaceManager,
  ) {}

  execute<T>(operation: () => Promise<T>, options: ApiCallOptions = {}): Promise<T> {
    return options.background
      ? operation()
      : this.surfaces.withBusy(operation, options.presentation);
  }

  get<T>(path: string, options: ApiCallOptions = {}): Promise<T> {
    return this.execute(
      () =>
        this.withTimeout(
          async (signal) => (await this.api.get<T>(path, signal)).data,
          options.signal,
        ),
      options,
    );
  }

  post<T>(path: string, body?: unknown, options: ApiCallOptions = {}): Promise<T> {
    return this.execute(
      () =>
        this.withTimeout(
          async (signal) => (await this.api.post<T>(path, body, signal)).data,
          options.signal,
        ),
      options,
    );
  }

  put<T>(path: string, body?: unknown, options: ApiCallOptions = {}): Promise<T> {
    return this.execute(
      () =>
        this.withTimeout(
          async (signal) => (await this.api.put<T>(path, body, signal)).data,
          options.signal,
        ),
      options,
    );
  }

  patch<T>(path: string, body?: unknown, options: ApiCallOptions = {}): Promise<T> {
    return this.execute(
      () =>
        this.withTimeout(
          async (signal) => (await this.api.patch<T>(path, body, signal)).data,
          options.signal,
        ),
      options,
    );
  }

  delete<T>(path: string, options: ApiCallOptions = {}): Promise<T> {
    return this.execute(
      () =>
        this.withTimeout(
          async (signal) => (await this.api.delete<T>(path, signal)).data,
          options.signal,
        ),
      options,
    );
  }

  /** Auth operations use the trusted same-origin UI host, not the public API transport. */
  signIn(identity: string, password: string, options: ApiCallOptions = {}) {
    return this.execute(
      () =>
        this.withTimeout((signal) => this.auth.signIn(identity, password, signal), options.signal),
      { ...options, presentation: options.presentation ?? { title: 'Signing in' } },
    );
  }

  register(
    name: string,
    email: string,
    password: string,
    confirmation: string,
    options: ApiCallOptions = {},
  ) {
    return this.execute(
      () =>
        this.withTimeout(
          (signal) => this.auth.register(name, email, password, confirmation, signal),
          options.signal,
        ),
      { ...options, presentation: options.presentation ?? { title: 'Creating account' } },
    );
  }

  requestPasswordRecovery(identity: string, options: ApiCallOptions = {}) {
    return this.execute(
      () =>
        this.withTimeout(
          (signal) => this.auth.requestPasswordRecovery(identity, signal),
          options.signal,
        ),
      {
        ...options,
        presentation: options.presentation ?? { title: 'Requesting password instructions' },
      },
    );
  }

  inspectPasswordRecovery(token: string, options: ApiCallOptions = {}) {
    return this.execute(
      () =>
        this.withTimeout(
          (signal) => this.auth.inspectPasswordRecovery(token, signal),
          options.signal,
        ),
      options,
    );
  }

  completePasswordRecovery(token: string, password: string, options: ApiCallOptions = {}) {
    return this.execute(
      () =>
        this.withTimeout(
          (signal) => this.auth.completePasswordRecovery(token, password, signal),
          options.signal,
        ),
      { ...options, presentation: options.presentation ?? { title: 'Changing password' } },
    );
  }

  changePassword(
    currentPassword: string | undefined,
    newPassword: string,
    options: ApiCallOptions = {},
  ) {
    return this.execute(
      () =>
        this.withTimeout(
          (signal) => this.auth.changePassword(currentPassword, newPassword, signal),
          options.signal,
        ),
      { ...options, presentation: options.presentation ?? { title: 'Changing password' } },
    );
  }

  startExternalSignIn(provider: string): void {
    this.auth.startExternalSignIn(provider);
  }

  externalHostAvailability(options: ApiCallOptions = {}): Promise<{ enabled: boolean }> {
    return this.execute(
      () => this.withTimeout((signal) => this.auth.externalAvailability(signal), options.signal),
      options,
    );
  }

  private async withTimeout<T>(
    operation: (signal: AbortSignal) => Promise<T>,
    cancellation?: AbortSignal,
  ): Promise<T> {
    const controller = new AbortController();
    const abort = (): void => controller.abort();
    cancellation?.addEventListener('abort', abort, { once: true });
    if (cancellation?.aborted) controller.abort();
    const timeout = setTimeout(() => controller.abort(), UI_API_REQUEST_TIMEOUT_MS);
    try {
      return await operation(controller.signal);
    } catch (error) {
      if (controller.signal.aborted && !cancellation?.aborted) {
        throw new Error('The request timed out. Check your connection and try again.', {
          cause: error,
        });
      }
      throw error;
    } finally {
      clearTimeout(timeout);
      cancellation?.removeEventListener('abort', abort);
    }
  }
}

/** Shape of the existing anonymous-safe API catalogue (not an OAuth token). */
export interface ExternalProviderCatalogue {
  readonly providers: readonly UiPublicExternalAuthProvider[];
}
