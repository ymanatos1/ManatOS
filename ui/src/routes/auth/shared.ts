import type { Request, Response } from 'express';

import { type EmailVerificationSource, type ExternalProviderKey, type SysBOUser } from '@manatos/shared';

import { apiClient } from '../../api/client.js';
import { config } from '../../config.js';
import type { ExternalProfile } from '../../auth/providers/contracts.js';
import { externalProviderOption } from '../../auth/providers/runtime-registry.js';

/** API session created by public login or the trusted UI -> API bridge. */
export interface ApiLoginResult {
  accessToken: string;
  tokenType: 'Bearer';
  sessionId: string;
  expiresInSeconds: number;
  expiresAt: string;
  user: SysBOUser;
}

export function verificationSourceLabel(source: EmailVerificationSource): string {
  if (source === 'internal') {
    return 'ManatOS';
  }

  return externalProviderOption(source)?.label ?? source;
}

/**
 * Internal lookup by unique user-name OR email.
 *
 * Used only before an authenticated Bearer session exists, for:
 *
 * - password recovery;
 * - external-registration duplicate checks.
 */

/**
 * Build a friendly, provider-derived user-name suggestion for a new external
 * account. The suggestion is presentation only: the normal API uniqueness
 * validation remains authoritative when the account is created.
 */
export async function suggestExternalUserName(profile: ExternalProfile): Promise<string> {
  const sources = [
    profile.userName,
    profile.displayName,
    [profile.firstName, profile.lastName].filter(Boolean).join(' '),
    profile.email.split('@')[0],
  ];

  const base = sources
    .map((value) => normalizeSuggestedUserName(value ?? ''))
    .find((value) => value.length >= 2) ?? 'User';

  for (let suffix = 0; suffix < 100; suffix += 1) {
    const candidate = suffix === 0 ? base : `${base}${suffix + 1}`;
    if (!(await lookup(candidate))) return candidate;
  }

  return `${base}${Date.now().toString().slice(-6)}`;
}

function normalizeSuggestedUserName(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
    .slice(0, 80);
}

export async function lookup(identity: string): Promise<SysBOUser | null> {
  return (
    await apiClient.get<SysBOUser | null>(
      `/api/v1/internal/auth/lookup?identity=${encodeURIComponent(identity)}`,

      {
        internal: true,
      },
    )
  ).data;
}

/**
 * Resolve an existing normalized external provider identity.
 */
export async function resolveExternalUserId(profile: ExternalProfile): Promise<string | null> {
  const identity = (
    await apiClient.get<{
      userId: string;
    } | null>(
      `/api/v1/internal/external-identities/resolve?provider=${encodeURIComponent(profile.provider)}&subject=${encodeURIComponent(profile.providerSubject)}`,

      {
        internal: true,
      },
    )
  ).data;

  return identity?.userId ?? null;
}

/**
 * Ask the trusted API bridge to mint an ordinary API session for a SysBOUser
 * already authenticated by an approved UI mechanism.
 */
export async function createTrustedApiSession(
  req: Request,

  userId: string,

  clientName: string,
): Promise<ApiLoginResult> {
  const response = await apiClient.post<ApiLoginResult>(
    '/api/v1/internal/auth/session',

    {
      userId,

      clientName,

      ...(req.get('user-agent')
        ? {
            userAgent: req.get('user-agent'),
          }
        : {}),

      ...(req.ip
        ? {
            ipAddress: req.ip,
          }
        : {}),
    },

    {
      internal: true,
    },
  );

  return response.data;
}

/**
 * Establish the server-side browser/UI session after the API session has
 * successfully been created.
 *
 * Regenerating the Express session ID protects against session fixation.
 */
export async function establishUiSession(
  req: Request,

  login: ApiLoginResult,

  authenticationMethod: string,
): Promise<void> {
  await regenerateSession(req);

  req.session.userId = login.user.id;

  // Reuse the user already returned by login instead of refetching the same
  // SysUser during every subsequent page-context hydration.
  req.session.currentUserSnapshot = login.user;

  req.session.authenticationMethod = authenticationMethod;

  req.session.apiAccessToken = login.accessToken;

  req.session.apiSessionId = login.sessionId;

  req.session.apiExpiresAt = login.expiresAt;
}

/**
 * Regenerate the Express browser session.
 */
function regenerateSession(req: Request): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    req.session.regenerate((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

/**
 * Build an absolute website URL.
 */
/**
 * Complete an Admin credential-test popup without navigating the dirty editor.
 * Only a status/message cross the window boundary; secret material never does.
 */
export function sendProviderCredentialTestResult(
  res: Response,
  status: 'verified' | 'failed',
  message: string,
): void {
  const payload = JSON.stringify({
    type: 'manatos:provider-credential-test-result',
    status,
    message,
  }).replace(/</g, '\\u003c');
  const origin = JSON.stringify(new URL(config.PUBLIC_BASE_URL).origin);

  res.type('html').send(`<!doctype html>
<html><head><meta charset="utf-8"><title>Credential test</title></head>
<body>
  <p style="font-family:system-ui,sans-serif;padding:1.5rem">${status === 'verified' ? 'Credentials verified. Returning to ManatOS…' : 'Credential test failed. Returning to ManatOS…'}</p>
  <script>
    // postMessage is only a fast-path. The Admin editor independently polls
    // the server-side test state, because OAuth/browser opener isolation can
    // sever window.opener during a cross-origin provider round trip.
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage(${payload}, ${origin});
    }
    window.setTimeout(() => window.close(), 250);
    window.setTimeout(() => {
      const paragraph = document.querySelector('p');
      if (paragraph) paragraph.textContent = 'Credential test completed. You may close this window and return to ManatOS.';
    }, 1200);
  </script>
</body></html>`);
}

export function providerCredentialTestCallbackError(
  provider: ExternalProviderKey,
  error: string,
  description: string,
): string {
  const normalizedDescription = description.replace(/\s+/g, ' ').trim().slice(0, 300);
  const normalizedError = error.replace(/\s+/g, ' ').trim().slice(0, 100);
  const providerLabel = provider.charAt(0).toUpperCase() + provider.slice(1);

  if (normalizedError === 'access_denied') {
    return normalizedDescription
      ? `${providerLabel} denied the credential-test authorization: ${normalizedDescription}`
      : `${providerLabel} denied or cancelled the credential-test authorization.`;
  }

  return normalizedDescription
    ? `${providerLabel} rejected the credential test: ${normalizedDescription}`
    : `${providerLabel} rejected the credential test (${normalizedError || 'OAuth error'}).`;
}

export function providerCredentialTestError(error: unknown): string {
  if (!(error instanceof Error)) return 'The provider rejected the proposed credentials or OAuth configuration.';
  const normalized = error.message.replace(/\s+/g, ' ').trim();
  if (/AADSTS7000215|invalid client secret/i.test(normalized)) return 'Microsoft rejected the Client secret. Confirm that you entered the secret Value, not the Secret ID.';
  if (/invalid_client|client credential|client secret/i.test(normalized)) return 'The provider rejected the Client ID / Client secret pair.';
  return normalized.slice(0, 300) || 'The provider rejected the proposed credentials or OAuth configuration.';
}

export function absoluteUrl(
  req: Request,

  path: string,
): string {
  return `${req.protocol}://${req.get('host')}${path}`;
}

/**
 * Copy an external profile into the exact temporary Express-session shape.
 *
 * Undefined optional fields are omitted for exactOptionalPropertyTypes.
 */
export function sessionExternalProfile(profile: ExternalProfile) {
  return {
    provider: profile.provider,

    providerSubject: profile.providerSubject,

    email: profile.email,

    emailVerified: profile.emailVerified,

    ...(profile.displayName
      ? {
          displayName: profile.displayName,
        }
      : {}),

    ...(profile.userName
      ? {
          userName: profile.userName,
        }
      : {}),

    ...(profile.firstName
      ? {
          firstName: profile.firstName,
        }
      : {}),

    ...(profile.lastName
      ? {
          lastName: profile.lastName,
        }
      : {}),
  };
}
