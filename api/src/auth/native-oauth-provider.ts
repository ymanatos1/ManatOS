/**
 * Server-side provider protocol for API-brokered native OAuth.
 * Provider secrets, authorization codes and access tokens never leave the API.
 * Browser-host OAuth remains independent; moving both to a shared provider
 * package is a separate compatibility-sensitive migration.
 */
import type { ExternalProviderKey } from '@manatos/shared';
import type { RuntimeExternalAuthProvider } from '../services/sysbo/external-auth-provider-service.js';

type Provider = RuntimeExternalAuthProvider;
const PROVIDER_TIMEOUT_MS = 15_000;

function endpoints(p: Provider) {
  switch (p.provider) {
    case 'google':
      return {
        authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
        token: 'https://oauth2.googleapis.com/token',
      };
    case 'microsoft': {
      const tenant = p.tenant?.trim() || 'common';
      if (!/^(?:common|organizations|consumers|[a-zA-Z0-9-]{1,80})$/.test(tenant))
        throw new Error('Invalid Microsoft tenant configuration.');
      const base = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0`;
      return { authorize: `${base}/authorize`, token: `${base}/token` };
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
    default:
      throw new Error('Unsupported external authentication provider.');
  }
}

async function providerFetch(url: string, init: RequestInit): Promise<Response> {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    redirect: 'error',
  });
  if (!response.ok) throw new Error('External authentication provider request failed.');
  return response;
}

export function nativeAuthorizationUrl(
  provider: Provider,
  callback: string,
  state: string,
  codeChallenge: string,
  nonce: string,
): string {
  const url = new URL(endpoints(provider).authorize);
  url.searchParams.set('client_id', provider.clientId);
  url.searchParams.set('redirect_uri', callback);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  if (provider.scope.length) url.searchParams.set('scope', provider.scope.join(' '));
  // Identity below is resolved via authenticated resource endpoints, not an ID token.
  if (provider.provider === 'google' || provider.provider === 'microsoft')
    url.searchParams.set('nonce', nonce);
  return url.toString();
}

export async function nativeProviderIdentity(
  provider: Provider,
  callback: string,
  code: string,
  verifier: string,
): Promise<{ provider: ExternalProviderKey; subject: string }> {
  const body = new URLSearchParams({
    client_id: provider.clientId,
    client_secret: provider.clientSecret,
    code,
    redirect_uri: callback,
    grant_type: 'authorization_code',
    code_verifier: verifier,
  });
  const tokenResponse = await providerFetch(endpoints(provider).token, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  const tokenData = (await tokenResponse.json()) as {
    access_token?: unknown;
    token_type?: unknown;
  };
  if (
    typeof tokenData.access_token !== 'string' ||
    !tokenData.access_token ||
    (typeof tokenData.token_type === 'string' && tokenData.token_type.toLowerCase() !== 'bearer')
  )
    throw new Error('External authentication token exchange failed.');
  const headers = {
    authorization: `Bearer ${tokenData.access_token}`,
    accept: 'application/json',
    'user-agent': 'ManatOS API',
  };
  let subject: string | null = null;
  if (provider.provider === 'google') {
    const profile = (await (
      await providerFetch('https://openidconnect.googleapis.com/v1/userinfo', { headers })
    ).json()) as Record<string, unknown>;
    subject = typeof profile['sub'] === 'string' ? profile['sub'] : null;
  } else if (provider.provider === 'microsoft') {
    const profile = (await (
      await providerFetch('https://graph.microsoft.com/v1.0/me', { headers })
    ).json()) as Record<string, unknown>;
    subject = typeof profile['id'] === 'string' ? profile['id'] : null;
  } else if (provider.provider === 'github') {
    const profile = (await (
      await providerFetch('https://api.github.com/user', { headers })
    ).json()) as Record<string, unknown>;
    subject =
      typeof profile['id'] === 'number' || typeof profile['id'] === 'string'
        ? String(profile['id'])
        : null;
  } else if (provider.provider === 'facebook') {
    const profile = (await (
      await providerFetch('https://graph.facebook.com/v21.0/me?fields=id', { headers })
    ).json()) as Record<string, unknown>;
    subject = typeof profile['id'] === 'string' ? profile['id'] : null;
  }
  if (!subject?.trim()) throw new Error('Provider did not return a stable account identifier.');
  return { provider: provider.provider, subject: subject.trim() };
}
