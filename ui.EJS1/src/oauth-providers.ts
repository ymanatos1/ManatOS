/**
 * Provider-specific HTTPS OAuth endpoints and normalized identity profiles.
 *
 * No tokens, provider secrets or raw provider profiles cross the UI-host boundary.
 * A provider identity is identified ONLY by (provider, stable subject); email
 * is informational and is never a replacement for an explicitly linked identity.
 */
import type { ExternalProviderKey } from '@manatos/shared';

export interface RuntimeOAuthProvider {
  provider: ExternalProviderKey;
  label: string;
  icon: string;
  scope: string[];
  clientId: string;
  clientSecret: string;
  callbackPath: string;
  tenant?: string;
}

export interface OAuthIdentity {
  provider: ExternalProviderKey;
  subject: string;
  email: string | null;
  emailVerified: boolean;
}

const timeoutMs = 15_000;

async function providerFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(timeoutMs),
    redirect: 'error',
  });
  if (!response.ok) throw new Error('External authentication provider request failed.');
  return response;
}

function microsoftTenant(value: string | undefined): string {
  const tenant = value?.trim() || 'common';
  if (!/^(?:common|organizations|consumers|[a-zA-Z0-9-]{1,80})$/.test(tenant)) {
    throw new Error('Invalid Microsoft tenant configuration.');
  }
  return tenant;
}

function endpoints(provider: RuntimeOAuthProvider) {
  switch (provider.provider) {
    case 'google':
      return {
        authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
        token: 'https://oauth2.googleapis.com/token',
      };
    case 'microsoft': {
      const origin = `https://login.microsoftonline.com/${microsoftTenant(provider.tenant)}/oauth2/v2.0`;
      return { authorize: `${origin}/authorize`, token: `${origin}/token` };
    }
    case 'github':
      return {
        authorize: 'https://github.com/login/oauth/authorize',
        token: 'https://github.com/login/oauth/access_token',
      };
    case 'facebook':
      return {
        authorize: 'https://www.facebook.com/v21.0/dialog/oauth',
        token: 'https://graph.facebook.com/v21.0/oauth/access_token',
      };
  }
}

/** OAuth code flow: fixed HTTPS endpoints, server-held secret and PKCE S256. */
export function authorizationUrl(
  provider: RuntimeOAuthProvider,
  redirectUri: string,
  state: string,
  codeChallenge: string,
  nonce: string,
): string {
  const url = new URL(endpoints(provider).authorize);
  url.searchParams.set('client_id', provider.clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  if (provider.scope.length) url.searchParams.set('scope', provider.scope.join(' '));
  // Nonce is defense-in-depth for providers returning OIDC tokens; identity
  // resolution below uses independently authenticated resource endpoints.
  if (provider.provider === 'google' || provider.provider === 'microsoft') {
    url.searchParams.set('nonce', nonce);
  }
  return url.toString();
}

/** Exchange a single-use authorization code; never return access tokens to browsers. */
export async function exchangeCode(
  provider: RuntimeOAuthProvider,
  redirectUri: string,
  code: string,
  codeVerifier: string,
): Promise<string> {
  const body = new URLSearchParams({
    client_id: provider.clientId,
    client_secret: provider.clientSecret,
    code,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
    code_verifier: codeVerifier,
  });
  const response = await providerFetch(endpoints(provider).token, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  const payload = (await response.json()) as { access_token?: unknown; token_type?: unknown };
  if (typeof payload.access_token !== 'string' || !payload.access_token) {
    throw new Error('External authentication token exchange failed.');
  }
  if (typeof payload.token_type === 'string' && payload.token_type.toLowerCase() !== 'bearer') {
    throw new Error('Unexpected external authentication token type.');
  }
  return payload.access_token;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** Profiles are fetched from the provider's authenticated user endpoint. */
export async function resolveProviderIdentity(
  provider: ExternalProviderKey,
  token: string,
): Promise<OAuthIdentity> {
  const headers = {
    authorization: `Bearer ${token}`,
    accept: 'application/json',
    'user-agent': 'ManatOS NG1',
  };
  let subject: string | null = null;
  let email: string | null = null;
  let emailVerified = false;

  if (provider === 'google') {
    const profile = (await (
      await providerFetch('https://openidconnect.googleapis.com/v1/userinfo', { headers })
    ).json()) as Record<string, unknown>;
    subject = stringValue(profile['sub']);
    email = stringValue(profile['email']);
    emailVerified = profile['email_verified'] === true;
  } else if (provider === 'microsoft') {
    const profile = (await (
      await providerFetch('https://graph.microsoft.com/v1.0/me', { headers })
    ).json()) as Record<string, unknown>;
    subject = stringValue(profile['id']);
    email = stringValue(profile['mail']) ?? stringValue(profile['userPrincipalName']);
    // Microsoft Graph's mail/UPN is not proof of verified email ownership.
  } else if (provider === 'github') {
    const profile = (await (
      await providerFetch('https://api.github.com/user', { headers })
    ).json()) as Record<string, unknown>;
    subject = profile['id'] === undefined ? null : String(profile['id']);
    const records = (await (
      await providerFetch('https://api.github.com/user/emails', { headers })
    ).json()) as Array<{ email?: string; primary?: boolean; verified?: boolean }>;
    if (!Array.isArray(records)) throw new Error('Unexpected GitHub email response.');
    const match =
      records.find((item) => item.primary && item.verified) ??
      records.find((item) => item.verified) ??
      records.find((item) => item.primary) ??
      records[0];
    email = stringValue(match?.email);
    emailVerified = match?.verified === true;
  } else {
    const profile = (await (
      await providerFetch('https://graph.facebook.com/v21.0/me?fields=id,name,email', { headers })
    ).json()) as Record<string, unknown>;
    subject = stringValue(profile['id']);
    email = stringValue(profile['email']);
    // Facebook email presence does not prove verification.
  }

  if (!subject) throw new Error('Provider did not return a stable account identifier.');
  return { provider, subject, email, emailVerified };
}
