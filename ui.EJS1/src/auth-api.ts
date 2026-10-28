import { signAuthClientIp } from '@manatos/shared/node';

import type { UiAuthorizationContextProjection } from '@manatos/shared-ui';

import { AuthApiFailure, type AuthApiPort, type AuthPublicUser } from '@manatos/shared-ui/node';

type ApiEnvelope<T> = {
  success: true;
  data: T;
};

/** Server-to-server API gateway. Bearer tokens never reach Angular. */
export class Ejs1AuthApi implements AuthApiPort {
  constructor(
    private readonly baseUrl: string,
    private readonly authDelegationSecret: string,
    private readonly internalApiKey?: string,
  ) {}

  /**
   * Authenticate through the public API.
   *
   * Sign the original browser IP alongside this precise request.
   * The API validates the signature before applying its IP limits.
   *
   * The secret and signed headers never pass through Angular.
   */
  login(identity: string, password: string, clientIp: string) {
    const path = '/api/v1/auth/login';
    const body = { identity, password };

    return this.request<{
      accessToken: string;
      expiresAt: string;
      user: AuthPublicUser;
    }>(
      path,
      'POST',
      body,
      undefined,
      signAuthClientIp(this.authDelegationSecret, clientIp, 'POST', path, body),
    );
  }

  currentUser(accessToken: string) {
    return this.request<AuthPublicUser>('/api/v1/auth/me', 'GET', undefined, accessToken);
  }

  authorization(accessToken: string, platformId: string) {
    return this.request<UiAuthorizationContextProjection>(
      `/api/v1/authorization/context/${encodeURIComponent(platformId)}/$capabilities`,
      'GET',
      undefined,
      accessToken,
    );
  }

  /** Public registration: API remains authoritative for Guest creation and uniqueness. */
  registerGuest(
    name: string,
    email: string,
    password: string,
    clientIp: string,
  ): Promise<AuthPublicUser> {
    const path = '/api/v1/auth/register';
    const body = { name, email, password };
    return this.request<AuthPublicUser>(
      path,
      'POST',
      body,
      undefined,
      signAuthClientIp(this.authDelegationSecret, clientIp, 'POST', path, body),
    );
  }

  sendRegistrationEmail(userId: string, verificationUrl: string): Promise<null> {
    return this.internal('/api/v1/internal/email/verification', 'POST', {
      userId,
      verificationUrl,
    });
  }

  markEmailVerified(userId: string): Promise<AuthPublicUser> {
    return this.internal(
      '/api/v1/internal/SysUsers/' + encodeURIComponent(userId) + '/email-verified',
      'PUT',
      { source: 'internal' },
    );
  }

  /** Trusted UI-server operations: no API key or credentials enter Angular. */
  async runtimeProviders(): Promise<import('./oauth-providers.js').RuntimeOAuthProvider[]> {
    const data = await this.internal<{
      items: import('./oauth-providers.js').RuntimeOAuthProvider[];
    }>('/api/v1/internal/external-auth-providers/runtime');
    return data.items;
  }

  async resolveExternal(provider: string, subject: string): Promise<string | null> {
    const result = await this.internal<{ userId: string; enabled: boolean } | null>(
      '/api/v1/internal/external-identities/resolve?' +
        new URLSearchParams({ provider, subject }).toString(),
    );
    // Disabled/revoked provider links must never authenticate.
    return result?.enabled === true ? result.userId : null;
  }

  async trustedSession(userId: string): Promise<{
    accessToken: string;
    expiresAt: string;
    user: AuthPublicUser;
  }> {
    return this.internal('/api/v1/internal/auth/session', 'POST', {
      userId,
      clientName: 'ManatOS NG1 external provider',
    });
  }

  private async internal<T>(
    path: string,
    method: 'GET' | 'POST' | 'PUT' = 'GET',
    body?: unknown,
  ): Promise<T> {
    if (!this.internalApiKey) {
      throw new AuthApiFailure(503, 'OAUTH_NOT_CONFIGURED', 'External login is not configured.');
    }
    return this.request<T>(path, method, body, undefined, {
      'x-internal-api-key': this.internalApiKey,
    });
  }

  /** Only the trusted Node host can request recovery credentials and email delivery. */
  requestPasswordRecovery(identity: string, uiOrigin: string): Promise<null> {
    return this.internal('/api/v1/internal/auth/password-recovery/request', 'POST', {
      identity,
      uiOrigin,
    });
  }

  inspectPasswordRecovery(token: string): Promise<{ valid: boolean }> {
    return this.internal('/api/v1/internal/auth/password-recovery/inspect', 'POST', { token });
  }

  completePasswordRecovery(token: string, password: string): Promise<null> {
    return this.internal('/api/v1/internal/auth/password-recovery/complete', 'POST', {
      token,
      password,
    });
  }

  /** Binary user photo. The API enforces its existing SysUser read policy. */
  async userPhoto(
    accessToken: string,
    userId: string,
  ): Promise<{ bytes: Buffer; contentType: string } | null> {
    let response: Response;
    try {
      response = await fetch(
        this.baseUrl + `/api/v1/SysUsers/${encodeURIComponent(userId)}/$picture/photo`,
        {
          headers: { authorization: `Bearer ${accessToken}`, 'x-client-name': 'ManatOS NG1' },
          signal: AbortSignal.timeout(15000),
        },
      );
    } catch {
      throw new AuthApiFailure(503, 'API_UNAVAILABLE', 'Profile image service unavailable.');
    }

    if (response.status === 404 || response.status === 403) return null;
    if (!response.ok) {
      throw new AuthApiFailure(503, 'PICTURE_UNAVAILABLE', 'Profile image unavailable.');
    }

    const contentType = response.headers.get('content-type')?.split(';')[0]?.trim() ?? '';
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(contentType)) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length === 0 || bytes.length > 5 * 1024 * 1024) return null;
    return { bytes, contentType };
  }

  changePassword(
    accessToken: string,
    currentPassword: string | undefined,
    newPassword: string,
  ): Promise<unknown> {
    return this.request(
      '/api/v1/auth/password',
      'PUT',
      { currentPassword, newPassword },
      accessToken,
    );
  }

  async logout(accessToken: string): Promise<void> {
    await this.request('/api/v1/auth/logout', 'POST', undefined, accessToken);
  }

  private async request<T>(
    path: string,
    method: 'GET' | 'POST' | 'PUT',
    body?: unknown,
    accessToken?: string,
    additionalHeaders: Record<string, string> = {},
  ): Promise<T> {
    let response: Response;

    try {
      response = await fetch(this.baseUrl + path, {
        method,
        headers: {
          accept: 'application/json',
          ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
          ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
          'x-client-name': 'ManatOS NG1',
          ...additionalHeaders,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new AuthApiFailure(
        503,
        'API_UNAVAILABLE',
        'The authentication service is currently unavailable.',
      );
    }

    if (!response.ok) {
      let code = 'AUTH_FAILED';

      try {
        const payload = (await response.json()) as {
          error?: { code?: string };
        };
        code = payload.error?.code ?? code;
      } catch {
        // Missing or malformed API error document.
      }

      /**
       * Preserve authoritative API throttling.
       *
       * The API may reject a request even when the UI host has
       * not reached its own independent rate limits.
       */
      const retryAfter = Number(response.headers.get('retry-after'));

      const retryAfterSeconds =
        response.status === 429 && Number.isSafeInteger(retryAfter) && retryAfter > 0
          ? retryAfter
          : undefined;

      const message =
        code === 'AUTH_RATE_LIMITED'
          ? 'Too many authentication attempts. Please try again later.'
          : code === 'EMAIL_NOT_VERIFIED'
            ? 'Your email address must be verified before you can sign in.'
            : response.status === 401 || response.status === 400
              ? 'The supplied credentials could not be verified.'
              : 'The authentication request could not be completed.';

      throw new AuthApiFailure(response.status, code, message, retryAfterSeconds);
    }

    let data: ApiEnvelope<T>;

    try {
      data = (await response.json()) as ApiEnvelope<T>;
    } catch {
      throw new AuthApiFailure(
        502,
        'INVALID_API_RESPONSE',
        'The authentication service returned an invalid response.',
      );
    }

    if (data.success !== true || data.data === undefined) {
      throw new AuthApiFailure(
        502,
        'INVALID_API_RESPONSE',
        'The authentication service returned an invalid response.',
      );
    }

    return data.data;
  }
}
