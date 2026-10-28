import {
  UiBrowserAuthClient,
  UiBrowserAuthError,
  runtimeUserWithoutPlatform,
  type ApplicationState,
} from '@manatos/shared-ui';
import type { RuntimeUserIdentity } from '@manatos/shared';

export type Ejs1SessionStatus =
  'anonymous' | 'restoring' | 'authenticated' | 'unverified' | 'signing-out';

export interface Ejs1SessionNotice {
  readonly severity: 'warning' | 'danger';
  readonly message: string;
  readonly retry: boolean;
  /** Optional display translations for externally supplied callback notices. */
  readonly localizedMessage?: readonly [english: string, greek: string];
}

/** The Flow and session manager share one auth client to serialize cookie mutations. */
export class Ejs1TrackedBrowserAuthClient extends UiBrowserAuthClient {
  private pendingSignIn: Promise<RuntimeUserIdentity> | null = null;

  get signInInFlight(): boolean {
    return this.pendingSignIn !== null;
  }

  override async signIn(
    identity: string,
    password: string,
    signal?: AbortSignal,
  ): Promise<RuntimeUserIdentity> {
    const request = super.signIn(identity, password, signal);
    this.pendingSignIn = request;
    try {
      return await request;
    } finally {
      if (this.pendingSignIn === request) this.pendingSignIn = null;
    }
  }

  async settlePendingSignIn(): Promise<void> {
    if (!this.pendingSignIn) return;
    try {
      await this.pendingSignIn;
    } catch {
      // A failed sign-in still needs a subsequent host logout attempt.
    }
  }
}

/**
 * Trusted host-session boundary, equivalent to NG1's application-level lifecycle.
 * Cookies and CSRF credentials stay in the host/auth client, never CTX or storage.
 * A session whose validity cannot be established has NO active capabilities.
 */
export class Ejs1BrowserSession {
  private generation = 0;
  private user: RuntimeUserIdentity | null = null;
  private restoring: Promise<void> | null = null;
  private signingOut: Promise<void> | null = null;
  private retryTimer: ReturnType<typeof setInterval> | null = null;
  private outage = false;
  private pendingLogout = false;
  private sessionStatus: Ejs1SessionStatus = 'restoring';
  private authNotice: Ejs1SessionNotice | null = null;
  /** Incremented only when a host session has been confirmed authenticated. */
  private acceptedSessionRevision = 0;

  constructor(
    private readonly state: ApplicationState,
    private readonly changed: (
      user: RuntimeUserIdentity | null,
      pending: boolean,
      notice: Ejs1SessionNotice | null,
    ) => void,
    private readonly auth: Ejs1TrackedBrowserAuthClient = new Ejs1TrackedBrowserAuthClient(),
  ) {}

  get logoutPending(): boolean {
    return this.pendingLogout;
  }

  get authenticated(): boolean {
    return this.sessionStatus === 'authenticated' && this.user !== null;
  }

  /** Header photos must refresh after session restoration even for the same user. */
  get photoRevision(): number {
    return this.acceptedSessionRevision;
  }

  get status(): Ejs1SessionStatus {
    return this.sessionStatus;
  }

  get notice(): Ejs1SessionNotice | null {
    return this.authNotice;
  }

  get identity(): RuntimeUserIdentity | null {
    return this.authenticated ? this.user : null;
  }

  refreshPresentation(): void {
    this.changed(this.identity, this.sessionStatus === 'restoring', this.authNotice);
  }

  dismissNotice(): void {
    this.authNotice = null;
    this.refreshPresentation();
  }

  /** OAuth failures use the same notice lifecycle as session errors in NG1. */
  presentNotice(notice: Ejs1SessionNotice): void {
    if (this.authenticated || this.outage) return;
    this.authNotice = notice;
    this.refreshPresentation();
  }

  /** Transient API failure also revokes verified platform grants until revalidation. */
  blockForTransportFailure(): void {
    if (this.outage || this.sessionStatus !== 'authenticated') return;
    ++this.generation;
    this.clear('unverified', {
      severity: 'warning',
      message: 'The API authentication service is unavailable. Reconnecting…',
      retry: true,
    });
    this.startRecovery();
  }

  /** A latched API outage must not restore an old identity on a successful heartbeat. */
  blockForOutage(): void {
    this.outage = true;
    ++this.generation;
    this.stopRecovery();
    this.user = null;
    this.state.setRuntimeUser(null);
    this.sessionStatus = 'unverified';
    this.authNotice = null;
    this.refreshPresentation();
  }

  /** Called only after an explicit API Retry AND a confirmed host logout. */
  unblockAfterRecovery(): void {
    this.outage = false;
    this.pendingLogout = false;
    this.user = null;
    this.sessionStatus = 'anonymous';
    this.authNotice = null;
    this.stopRecovery();
    this.refreshPresentation();
  }

  async revokeAfterOutage(): Promise<void> {
    await this.auth.settlePendingSignIn();
    await this.auth.signOut();
  }

  restore(): Promise<void> {
    if (this.outage) return Promise.resolve();
    if (this.pendingLogout) return this.signOut();
    if (this.restoring) return this.restoring;
    if (this.auth.signInInFlight) return Promise.resolve();
    const generation = ++this.generation;
    this.sessionStatus = 'restoring';
    // NG1 retains the CTX user/preference owner until the host confirms or
    // rejects the session. The restoring status still blocks privileged UI,
    // debugger access and authenticated operations throughout the check.
    this.refreshPresentation();
    const operation = (async () => {
      try {
        const session = await this.auth.session();
        if (generation !== this.generation || this.outage) return;
        if (session.status === 'authenticated') await this.accept(session.user, generation);
        else this.clear('anonymous');
      } catch (error) {
        if (generation !== this.generation || this.outage) return;
        this.clear('unverified', this.failureNotice(error));
        this.startRecovery();
      }
    })();
    this.restoring = operation;
    void operation.finally(() => {
      if (this.restoring === operation) this.restoring = null;
    });
    return operation;
  }

  async signedIn(user: RuntimeUserIdentity): Promise<void> {
    if (this.outage || this.pendingLogout) {
      throw new Error('Sign In is unavailable until the session is verified.');
    }
    const generation = ++this.generation;
    await this.accept(user, generation);
  }

  async platformChanged(): Promise<void> {
    if (!this.authenticated || !this.user || this.outage) return;
    const generation = ++this.generation;
    // Revoke capabilities from the previous platform synchronously.
    this.state.setRuntimeUser(runtimeUserWithoutPlatform(this.user, this.state.currentPlatformId));
    await this.refreshAuthorization(this.user, generation);
  }

  signOut(): Promise<void> {
    if (this.signingOut) return this.signingOut;
    ++this.generation;
    this.pendingLogout = true;
    this.clear('signing-out', {
      severity: 'warning',
      message: 'Signing out…',
      retry: false,
    });
    const operation = (async () => {
      try {
        // NG1 awaits the outstanding sign-in before revoking the host cookie.
        await this.auth.settlePendingSignIn();
        await this.auth.signOut();
        this.pendingLogout = false;
        this.clear('anonymous');
      } catch {
        // The response may have been interrupted after the host revoked the cookie.
        try {
          const session = await this.auth.session();
          if (session.status === 'anonymous') {
            this.pendingLogout = false;
            this.clear('anonymous');
            return;
          }
        } catch {
          // No verified answer from the trusted host: keep the local session blocked.
        }
        this.clear('unverified', {
          severity: 'danger',
          message:
            'Sign Out could not be confirmed. The local session is blocked; retry to finish signing out.',
          retry: true,
        });
        this.startRecovery();
      }
    })();
    this.signingOut = operation;
    void operation.finally(() => {
      if (this.signingOut === operation) this.signingOut = null;
    });
    return operation;
  }

  retry(): void {
    if (this.outage) return;
    if (this.pendingLogout) void this.signOut();
    else void this.restore();
  }

  destroy(): void {
    ++this.generation;
    this.stopRecovery();
  }

  private async accept(user: RuntimeUserIdentity, generation: number): Promise<void> {
    if (generation !== this.generation || this.outage || this.pendingLogout) return;
    this.user = user;
    this.sessionStatus = 'authenticated';
    ++this.acceptedSessionRevision;
    this.authNotice = null;
    this.stopRecovery();
    this.state.setRuntimeUser(runtimeUserWithoutPlatform(user, this.state.currentPlatformId));
    this.refreshPresentation();
    await this.refreshAuthorization(user, generation);
  }

  private async refreshAuthorization(user: RuntimeUserIdentity, generation: number): Promise<void> {
    const platformId = this.state.currentPlatformId;
    if (!platformId) return;
    try {
      const projection = await this.auth.authorization(platformId);
      if (
        generation !== this.generation ||
        this.outage ||
        this.state.currentPlatformId !== platformId
      )
        return;
      if (projection.user.id !== user.id) throw new Error('Session identity mismatch.');
      this.state.applyAuthorizationContext(projection);
      this.authNotice = null;
      this.stopRecovery();
      this.refreshPresentation();
    } catch (error) {
      if (generation !== this.generation || this.outage) return;
      if (error instanceof UiBrowserAuthError && error.status === 401) {
        this.clear('anonymous', {
          severity: 'warning',
          message: 'Your session has expired. Please sign in again.',
          retry: false,
        });
      } else {
        this.authNotice = {
          severity: 'warning',
          message: 'Platform permissions are temporarily unavailable.',
          retry: true,
        };
        this.refreshPresentation();
        this.startRecovery();
      }
    }
  }

  private failureNotice(error: unknown): Ejs1SessionNotice {
    if (error instanceof UiBrowserAuthError) {
      if (error.code === 'UI_HOST_UNAVAILABLE')
        return {
          severity: 'warning',
          message: 'The UI session service is unavailable. Reconnecting…',
          retry: true,
        };
      if (error.code === 'API_UNAVAILABLE')
        return {
          severity: 'warning',
          message: 'The API authentication service is unavailable. Reconnecting…',
          retry: true,
        };
      if (error.status >= 500)
        return {
          severity: 'warning',
          message: 'Session verification is temporarily unavailable. Reconnecting…',
          retry: true,
        };
    }
    return {
      severity: 'danger',
      message: 'Session verification failed unexpectedly. Retry to continue.',
      retry: true,
    };
  }

  private clear(status: Ejs1SessionStatus, notice: Ejs1SessionNotice | null = null): void {
    this.user = null;
    this.sessionStatus = status;
    this.authNotice = notice;
    this.state.setRuntimeUser(null);
    if (status === 'anonymous') this.stopRecovery();
    this.refreshPresentation();
  }

  private startRecovery(): void {
    if (!this.retryTimer && !this.outage) this.retryTimer = setInterval(() => this.retry(), 10_000);
  }

  private stopRecovery(): void {
    if (this.retryTimer !== null) clearInterval(this.retryTimer);
    this.retryTimer = null;
  }
}
