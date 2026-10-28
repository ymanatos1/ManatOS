import type { RuntimeUserIdentity } from '@manatos/shared';
import type { UiAuthorizationContextProjection } from '../authorization/ui-authorization.js';

export type UiBrowserAuthSession =
  | Readonly<{ status: 'anonymous' }>
  | Readonly<{ status: 'authenticated'; user: RuntimeUserIdentity }>;

export class UiBrowserAuthError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'UiBrowserAuthError';
  }
}

/**
 * Browser-side authentication protocol.
 *
 * API credentials and browser sessions belong to the UI server.
 * This client never reads cookies or stores authentication tokens.
 */
export class UiBrowserAuthClient {
  private csrfToken: string | null = null;

  constructor(private readonly base = '/_manatos/auth') {}

  session(): Promise<UiBrowserAuthSession> {
    return this.request('session');
  }

  /** True only when the UI host has its trusted OAuth callback/configuration boundary. */
  externalAvailability(signal?: AbortSignal): Promise<{ enabled: boolean }> {
    return this.request('oauth/availability', 'GET', undefined, undefined, signal);
  }

  authorization(platformId: string): Promise<UiAuthorizationContextProjection> {
    return this.request(`authorization/${encodeURIComponent(platformId)}`);
  }

  async signIn(
    identity: string,
    password: string,
    signal?: AbortSignal,
  ): Promise<RuntimeUserIdentity> {
    const result = await this.postWithCsrf<{
      user: RuntimeUserIdentity;
      csrfToken: string;
    }>('signin', { identity, password }, signal);

    // Sign In rotates both the HttpOnly session cookie and CSRF token.
    this.csrfToken = result.csrfToken;
    return result.user;
  }

  register(
    name: string,
    email: string,
    password: string,
    confirmation: string,
    signal?: AbortSignal,
  ): Promise<{ created: boolean; emailSent: boolean }> {
    return this.postWithCsrf('register/email', { name, email, password, confirmation }, signal);
  }

  /** Starts the existing trusted UI-host OAuth flow; never handles provider tokens. */
  startExternalSignIn(provider: string): void {
    if (!['google', 'microsoft', 'github', 'facebook'].includes(provider)) {
      throw new UiBrowserAuthError('INVALID_PROVIDER', 'Unsupported external provider.', 400);
    }
    window.location.assign(this.base + '/oauth/' + encodeURIComponent(provider) + '/start');
  }

  requestPasswordRecovery(identity: string, signal?: AbortSignal): Promise<{ requested: boolean }> {
    return this.postWithCsrf('password-recovery/request', { identity }, signal);
  }

  inspectPasswordRecovery(token: string, signal?: AbortSignal): Promise<{ valid: boolean }> {
    return this.postWithCsrf('password-recovery/inspect', { token }, signal);
  }

  completePasswordRecovery(
    token: string,
    password: string,
    signal?: AbortSignal,
  ): Promise<{ changed: boolean }> {
    return this.postWithCsrf('password-recovery/complete', { token, password }, signal);
  }

  changePassword(
    currentPassword: string | undefined,
    newPassword: string,
    signal?: AbortSignal,
  ): Promise<{ changed: boolean }> {
    return this.postWithCsrf('password/change', { currentPassword, newPassword }, signal);
  }

  async signOut(): Promise<void> {
    await this.postWithCsrf('signout', {});
    this.csrfToken = null;
  }

  /**
   * Another browser tab may have rotated the session.
   * Refresh CSRF once rather than requiring the user to retry manually.
   */
  private async postWithCsrf<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const csrf = await this.csrf(signal);

      try {
        return await this.request<T>(path, 'POST', body, csrf, signal);
      } catch (error) {
        if (
          !(error instanceof UiBrowserAuthError) ||
          error.code !== 'CSRF_INVALID' ||
          attempt > 0
        ) {
          throw error;
        }

        this.csrfToken = null;
      }
    }

    throw new UiBrowserAuthError('CSRF_INVALID', 'Your session has changed. Please retry.', 403);
  }

  private async csrf(signal?: AbortSignal): Promise<string> {
    if (this.csrfToken) return this.csrfToken;

    const result = await this.request<{ csrfToken: string }>(
      'csrf',
      'GET',
      undefined,
      undefined,
      signal,
    );
    this.csrfToken = result.csrfToken;
    return result.csrfToken;
  }

  private async request<T>(
    path: string,
    method: 'GET' | 'POST' = 'GET',
    body?: unknown,
    csrf?: string,
    signal?: AbortSignal,
  ): Promise<T> {
    let response: Response;

    try {
      response = await fetch(`${this.base}/${path}`, {
        method,
        credentials: 'same-origin',
        cache: 'no-store',
        ...(signal ? { signal } : {}),
        headers: {
          accept: 'application/json',
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          ...(csrf ? { 'x-manatos-csrf': csrf } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch {
      throw new UiBrowserAuthError('UI_HOST_UNAVAILABLE', 'Cannot reach the sign-in service.', 503);
    }

    let payload: {
      success?: boolean;
      data?: T;
      error?: { code?: string; message?: string };
    };

    try {
      payload = await response.json();
    } catch {
      // Angular's dev proxy returns an HTML/plain-text 502/504 when its
      // Node UI host is down. That is not a malformed API response.
      if ([502, 503, 504].includes(response.status)) {
        throw new UiBrowserAuthError(
          'UI_HOST_UNAVAILABLE',
          'The UI session service is unavailable.',
          503,
        );
      }
      throw new UiBrowserAuthError('INVALID_RESPONSE', 'Unexpected authentication response.', 502);
    }

    if (!response.ok || payload.success !== true || payload.data === undefined) {
      if (response.status === 403 && payload.error?.code === 'CSRF_INVALID') {
        this.csrfToken = null;
      }

      throw new UiBrowserAuthError(
        payload.error?.code ?? 'AUTH_FAILED',
        payload.error?.message ?? 'Authentication operation failed.',
        response.status,
      );
    }

    return payload.data;
  }
}
