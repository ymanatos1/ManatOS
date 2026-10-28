import { Router, type Request, type Response } from 'express';
import {
  AUTH_RATE_LIMITS,
  EXTERNAL_PROVIDER_KEYS,
  InMemoryRateLimiter,
  type ExternalProviderKey,
} from '@manatos/shared';
import { AuthWorkflows, OAuthStateStore } from '@manatos/shared-ui/node';

import type { Ejs1Config } from './config.js';
import type { Ejs1AuthApi } from './auth-api.js';
import {
  authorizationUrl,
  exchangeCode,
  resolveProviderIdentity,
  type RuntimeOAuthProvider,
} from './oauth-providers.js';

const COOKIE = 'manatos_ejs1_auth';
// The OAuth callback is outside the internal Auth resource prefix.
// One browser session cookie must reach both paths.
const COOKIE_PATH = '/';
const CALLBACK_PREFIX = '/auth/oauth';
const LIMITS = AUTH_RATE_LIMITS.loginByIp;

function existingCookie(req: Request): string | null {
  const value = req
    .get('cookie')
    ?.split(';')
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${COOKIE}=`));
  return value ? value.slice(COOKIE.length + 1) : null;
}

function providerKey(raw: unknown): ExternalProviderKey | null {
  const key = typeof raw === 'string' ? raw.toLowerCase() : '';
  return EXTERNAL_PROVIDER_KEYS.find((item) => item === key) ?? null;
}

function report(res: Response, result: string): void {
  // Fixed reason codes only: never reflect callback query strings or provider errors.
  res.redirect(303, `/?externalAuth=${encodeURIComponent(result)}`);
}

/**
 * EJS0-equivalent external Sign In boundary for NG1.
 *
 * - Only an anonymous, HttpOnly-cookie session can start this flow.
 * - OAuth state is single-use and bound to that exact session and provider.
 * - Provider tokens remain server-side and are discarded after profile lookup.
 * - A provider identity must ALREADY be linked to a SysBOUser in the API.
 * - API Bearer tokens remain server-side in the existing BrowserAuthSessions.
 *
 * New-account registration and account linking are separate, explicit flows;
 * an unlinked provider email can never silently authenticate another account.
 */
export function createEjs1OAuthRouter(
  config: Ejs1Config,
  api: Ejs1AuthApi,
  workflows: AuthWorkflows,
): Router {
  const router = Router();
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('Referrer-Policy', 'no-referrer');
    next();
  });
  const challenges = new OAuthStateStore();
  const attempts = new InMemoryRateLimiter();

  const publicOrigin = config.publicBaseUrl ?? null;

  const options = {
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: 'lax' as const,
    path: COOKIE_PATH,
  };

  async function configured(provider: ExternalProviderKey): Promise<RuntimeOAuthProvider | null> {
    if (
      !config.internalApiKey ||
      !publicOrigin ||
      (config.nodeEnv === 'production' && !publicOrigin.startsWith('https://'))
    ) {
      return null;
    }
    const providers = await api.runtimeProviders();
    return (
      providers.find(
        (item) => item.provider === provider && Boolean(item.clientId && item.clientSecret),
      ) ?? null
    );
  }

  function callbackUri(provider: ExternalProviderKey): string {
    return `${publicOrigin}${CALLBACK_PREFIX}/${provider}/callback`;
  }

  router.get('/availability', (_req, res) => {
    res.json({
      success: true,
      data: {
        enabled: Boolean(
          config.internalApiKey &&
          publicOrigin &&
          (config.nodeEnv !== 'production' || publicOrigin.startsWith('https://')),
        ),
      },
    });
  });

  router.get('/:provider/start', async (req, res) => {
    const provider = providerKey(req.params.provider);
    if (!provider) return report(res, 'unsupported');

    const decision = attempts.record(
      `oauth:${req.ip ?? req.socket.remoteAddress ?? 'unknown'}`,
      LIMITS,
    );
    if (!decision.allowed) {
      res.set('Retry-After', String(decision.retryAfterSeconds));
      return report(res, 'limited');
    }

    try {
      const selected = await configured(provider);
      if (!selected) return report(res, 'not-configured');

      const cookie = existingCookie(req);
      let session = cookie ? workflows.sessions.read(cookie) : null;
      if (session?.apiAccessToken) return report(res, 'already-signed-in');

      if (!session) {
        const issued = workflows.sessions.createAnonymous();
        session = workflows.sessions.read(issued.cookieValue);
        res.cookie(COOKIE, issued.cookieValue, {
          ...options,
          maxAge: Math.max(1, issued.expiresAt - Date.now()),
        });
      }
      if (!session) throw new Error('Anonymous browser session could not be created.');

      const challenge = challenges.start(session.id, provider);
      res.set('Referrer-Policy', 'no-referrer');
      res.redirect(
        302,
        authorizationUrl(
          selected,
          callbackUri(provider),
          challenge.state,
          challenge.codeChallenge,
          challenge.nonce,
        ),
      );
    } catch {
      report(res, 'unavailable');
    }
  });

  router.get('/:provider/callback', async (req, res) => {
    const provider = providerKey(req.params.provider);
    if (!provider) return report(res, 'unsupported');

    const cookie = existingCookie(req);
    const session = cookie ? workflows.sessions.read(cookie) : null;
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    const challenge =
      session && state.length <= 512 ? challenges.consume(session.id, provider, state) : null;
    if (!challenge || !session || !cookie) return report(res, 'expired');

    if (typeof req.query.error === 'string') return report(res, 'cancelled');
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    if (!code || code.length > 4096) return report(res, 'failed');

    try {
      const selected = await configured(provider);
      if (!selected) return report(res, 'not-configured');
      if (session.apiAccessToken || challenge.intent !== 'signin') {
        return report(res, 'already-signed-in');
      }

      const token = await exchangeCode(
        selected,
        callbackUri(provider),
        code,
        challenge.codeVerifier,
      );
      const identity = await resolveProviderIdentity(provider, token);
      const linkedUserId = await api.resolveExternal(identity.provider, identity.subject);
      if (!linkedUserId) return report(res, 'unlinked');

      const login = await api.trustedSession(linkedUserId);
      if (login.user.id !== linkedUserId) throw new Error('API identity mismatch.');
      const issued = workflows.establishExternal(cookie, login);
      challenges.revokeSession(session.id);
      res.cookie(COOKIE, issued.cookieValue, {
        ...options,
        maxAge: Math.max(1, issued.expiresAt - Date.now()),
      });
      report(res, 'success');
    } catch {
      // Fail closed: never issue a browser session on an unsuccessful callback.
      report(res, 'failed');
    }
  });

  return router;
}
