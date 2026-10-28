import { BrowserAuthSessions, type IssuedBrowserSession } from './browser-sessions.js';

/** Public user data supplied by the API. Never includes credentials. */
export type AuthPublicUser = Readonly<{
  id: string;
  name: string;
  [property: string]: unknown;
}>;

/** The existing API remains the authentication authority. */
export interface AuthApiPort {
  login(
    identity: string,
    password: string,
    clientIp: string,
  ): Promise<{
    accessToken: string;
    expiresAt: string;
    user: AuthPublicUser;
  }>;

  currentUser(accessToken: string): Promise<AuthPublicUser>;
  logout(accessToken: string): Promise<void>;
}

/**
 * Authentication failure returned by the existing API.
 *
 * Preserve the API's status and safe error information.
 *
 * retryAfterSeconds is populated only when the API returns a
 * throttling response. UI hosts can then forward Retry-After
 * instead of presenting a generic authentication failure.
 */
export class AuthApiFailure extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly userMessage: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(userMessage);
    this.name = 'AuthApiFailure';
  }
}

export type AuthSessionSnapshot =
  Readonly<{ status: 'anonymous' }> | Readonly<{ status: 'authenticated'; user: AuthPublicUser }>;

/**
 * Server-side authentication workflows.
 *
 * Browser sessions hold API tokens securely on the UI server.
 * Expiration does not automatically open a Sign In popup.
 */
export class AuthWorkflows {
  constructor(
    private readonly api: AuthApiPort,
    readonly sessions: BrowserAuthSessions = new BrowserAuthSessions(),
  ) {}

  async signIn(
    previousCookie: string | null,
    identity: string,
    password: string,
    clientIp: string,
  ): Promise<{
    issued: IssuedBrowserSession;
    user: AuthPublicUser;
    csrfToken: string;
  }> {
    const login = await this.api.login(identity, password, clientIp);
    const apiExpiresAt = Date.parse(login.expiresAt);

    if (!Number.isFinite(apiExpiresAt) || apiExpiresAt <= Date.now()) {
      throw new AuthApiFailure(
        502,
        'INVALID_API_SESSION',
        'The authentication server returned an invalid session.',
      );
    }

    const issued = this.sessions.establish(
      previousCookie,
      login.user.id,
      login.accessToken,
      apiExpiresAt,
    );

    const session = this.sessions.read(issued.cookieValue);

    if (!session) {
      throw new Error('Failed to establish the browser session.');
    }

    return { issued, user: login.user, csrfToken: session.csrfToken };
  }

  /**
   * Establish the SAME browser session as local Sign In after a trusted API
   * session was issued for an explicitly linked external provider subject.
   */
  establishExternal(
    previousCookie: string | null,
    login: { accessToken: string; expiresAt: string; user: AuthPublicUser },
  ): IssuedBrowserSession {
    const expiresAt = Date.parse(login.expiresAt);
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      throw new AuthApiFailure(502, 'INVALID_API_SESSION', 'Invalid API session expiry.');
    }
    return this.sessions.establish(previousCookie, login.user.id, login.accessToken, expiresAt);
  }

  /** Validate a session only when requested. */
  async restore(cookie: string | null): Promise<AuthSessionSnapshot> {
    const session = cookie ? this.sessions.read(cookie) : null;

    if (!session?.apiAccessToken) {
      return { status: 'anonymous' };
    }

    try {
      const user = await this.api.currentUser(session.apiAccessToken);

      if (user.id !== session.userId) {
        this.sessions.revoke(cookie!);
        return { status: 'anonymous' };
      }

      return { status: 'authenticated', user };
    } catch (error) {
      if (error instanceof AuthApiFailure && error.status === 401) {
        this.sessions.revoke(cookie!);
        return { status: 'anonymous' };
      }

      // Connectivity errors and 403 must not silently log out the user.
      throw error;
    }
  }

  /** Remove local authentication even if the API is temporarily unavailable. */
  async signOut(cookie: string | null): Promise<void> {
    const session = cookie ? this.sessions.read(cookie) : null;

    if (cookie) this.sessions.revoke(cookie);

    if (session?.apiAccessToken) {
      try {
        await this.api.logout(session.apiAccessToken);
      } catch {
        // Local session is already revoked; remote token expires independently.
      }
    }
  }
}
