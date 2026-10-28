import {
  createUiSurfaceResponseTrace,
  requestAuthenticatedSysBOList,
  requestAuthenticatedSysBOEntry,
  requestAuthenticatedSysBOEntryDraft,
  requestAuthenticatedSysBOEntryCreate,
  requestAuthenticatedSysBOReferenceChoice,
  requestAuthenticatedSysBOReferences,
  requestAuthenticatedExpressionFunction,
  requestAuthenticatedSysBOPicture,
  requestAuthenticatedSysBOPictureItem,
  UiSysBOResourceFailure,
} from '@manatos/shared-ui/node';
import { createHash, timingSafeEqual } from 'node:crypto';

import express, { Router, type Request, type RequestHandler, type Response } from 'express';

import { AUTH_RATE_LIMITS, InMemoryRateLimiter, type RateLimitDecision } from '@manatos/shared';

import { AuthActionTokens, AuthApiFailure, AuthWorkflows } from '@manatos/shared-ui/node';

import { Ejs1AuthApi } from './auth-api.js';
import { createEjs1OAuthRouter } from './oauth-router.js';
import { createEjs1AdministrationRouter } from './administration-router.js';
import type { Ejs1Config } from './config.js';

const COOKIE = 'manatos_ejs1_auth';
// The session is shared with public /auth/oauth callbacks.
const COOKIE_PATH = '/';
const LEGACY_COOKIE_PATH = '/_manatos/auth';

function cookieValue(req: Request): string | null {
  const cookie = req
    .get('cookie')
    ?.split(';')
    .map((value) => value.trim())
    .filter((value) => value.startsWith(`${COOKIE}=`))
    .at(-1); // Prefer the new root-scoped cookie if a legacy cookie is also sent.

  return cookie ? cookie.slice(COOKIE.length + 1) : null;
}

function cookieOptions(config: Ejs1Config) {
  return {
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: 'lax' as const,
    path: COOKIE_PATH,
  };
}

function checkOrigin(req: Request): boolean {
  const origin = req.get('origin');
  const host = req.get('host');

  if (!origin || !host || req.get('sec-fetch-site') === 'cross-site') {
    return false;
  }

  try {
    const url = new URL(origin);
    return url.host === host && (url.protocol === 'http:' || url.protocol === 'https:');
  } catch {
    return false;
  }
}

function sameToken(actual: string, expected: string): boolean {
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);

  return left.length === right.length && timingSafeEqual(left, right);
}

function fail(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({
    success: false,
    error: { code, message },
  });
}

/** EJS1-specific HTTP adapter over the reusable Auth service. */
export function createEjs1AuthRouter(
  config: Ejs1Config,
  registerPublicOAuth?: (router: Router) => void,
): Router & { requireProtectedPage: RequestHandler } {
  const router = Router() as Router & { requireProtectedPage: RequestHandler };
  const api = new Ejs1AuthApi(
    config.apiBaseUrl,
    config.authDelegationSecret,
    config.internalApiKey,
  );
  const workflows = new AuthWorkflows(api);
  /** EJS0-equivalent authenticated-route gate using this router's *same* session store. */
  router.requireProtectedPage = async (req, res, next) => {
    try {
      const result = await workflows.restore(cookieValue(req));
      if (result.status === 'authenticated') {
        next();
        return;
      }
      res.set('Cache-Control', 'no-store');
      // `originalUrl` is a local /bo/... path, never a caller-supplied origin.
      res.redirect(302, `/?auth=signin&next=${encodeURIComponent(req.originalUrl)}`);
    } catch {
      // An unverified host/API session is not an anonymous one. Fail closed,
      // without prompting Sign In or reusing old grants during an outage.
      res.set('Cache-Control', 'no-store');
      res.sendStatus(503);
    }
  };
  const verificationTokens = new AuthActionTokens();
  // Mount the SAME OAuth router at the old internal path (availability compatibility)
  // and the new public path. Both share one challenge store and Auth sessions.
  const oauthRouter = createEjs1OAuthRouter(config, api, workflows);
  router.use('/oauth', oauthRouter);
  registerPublicOAuth?.(oauthRouter);

  /**
   * EJS1's own limiter, independent of the API's counters.
   *
   * The UI host can identify the browser's client IP, whereas
   * server-to-server API requests originate from the UI host.
   *
   * This instance persists across requests, not across restarts.
   */
  const loginLimits = new InMemoryRateLimiter();

  const clientIp = (req: Request) => req.ip ?? req.socket.remoteAddress ?? 'unknown';

  const ipKey = (req: Request) => `ejs1:login:ip:${clientIp(req)}`;

  /**
   * Normalize and hash the identity before storing a counter key.
   * No user name, email address or password is stored in clear text.
   */
  const failureKey = (req: Request, identity: string) => {
    const digest = createHash('sha256').update(identity.trim().toLowerCase()).digest('hex');

    return `ejs1:login:failed:${clientIp(req)}:${digest}`;
  };

  /**
   * Use the existing NG1 Auth response structure.
   * Only denied requests receive HTTP 429 and Retry-After.
   */
  function rejectLimit(res: Response, decision: RateLimitDecision): void {
    res.set('Retry-After', String(decision.retryAfterSeconds));

    fail(
      res,
      429,
      'AUTH_RATE_LIMITED',
      'Too many authentication attempts. Please try again later.',
    );
  }

  // Administrative requests use the same authenticated session and CSRF lifecycle.
  router.use(
    '/admin',
    createEjs1AdministrationRouter(
      config,
      async (req) => {
        const cookie = cookieValue(req);
        const restored = await workflows.restore(cookie);
        const session = cookie ? workflows.sessions.read(cookie) : null;
        return restored.status === 'authenticated' && session?.apiAccessToken
          ? { accessToken: session.apiAccessToken, csrfToken: session.csrfToken }
          : null;
      },
      sameToken,
    ),
  );

  const cookieSettings = cookieOptions(config);
  const clear = (res: Response) => res.clearCookie(COOKIE, cookieSettings);

  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  /** Retire the path-specific pre-OAuth cookie after issuing the canonical cookie. */
  const clearLegacyCookie = (res: Response) => {
    res.clearCookie(COOKIE, { ...cookieSettings, path: LEGACY_COOKIE_PATH });
  };

  /** Initialize or reuse an anonymous session for CSRF protection. */
  router.get('/csrf', (req, res) => {
    const existing = cookieValue(req);
    let session = existing ? workflows.sessions.read(existing) : null;

    if (session && existing) {
      // Move a pre-upgrade session cookie to the canonical shared path.
      res.cookie(COOKIE, existing, {
        ...cookieSettings,
        maxAge: Math.max(1, session.expiresAt - Date.now()),
      });
    }

    if (!session) {
      const issued = workflows.sessions.createAnonymous();
      session = workflows.sessions.read(issued.cookieValue);

      res.cookie(COOKIE, issued.cookieValue, {
        ...cookieSettings,
        maxAge: Math.max(1, issued.expiresAt - Date.now()),
      });
    }

    // Keep the active root-scoped cookie first in Set-Cookie. This also
    // allows clients that read the first issued cookie to retain the CSRF session.
    clearLegacyCookie(res);
    res.json({
      success: true,
      data: { csrfToken: session!.csrfToken },
    });
  });

  /** Read session state without triggering Sign In. */
  router.get('/session', async (req, res) => {
    const cookie = cookieValue(req);

    try {
      const result = await workflows.restore(cookie);

      if (result.status === 'anonymous' && cookie && !workflows.sessions.read(cookie)) {
        clear(res);
      }

      res.json({ success: true, data: result });
    } catch (error) {
      if (error instanceof AuthApiFailure) {
        fail(res, error.status >= 500 ? 503 : error.status, error.code, error.userMessage);
      } else {
        fail(res, 503, 'API_UNAVAILABLE', 'Unable to check the current session.');
      }
    }
  });

  /**
   * Authenticated authorization bridge.
   *
   * The API remains authoritative. Angular receives capability facts,
   * never the server-held API Bearer token.
   */
  router.get('/authorization/:platformId', async (req, res) => {
    const cookie = cookieValue(req);

    try {
      const restored = await workflows.restore(cookie);
      const session = cookie ? workflows.sessions.read(cookie) : null;

      if (restored.status !== 'authenticated' || !session?.apiAccessToken) {
        fail(res, 401, 'SESSION_EXPIRED', 'Please sign in again.');
        return;
      }

      const projection = await api.authorization(
        session.apiAccessToken,
        String(req.params.platformId),
      );

      res.json({ success: true, data: projection });
    } catch (error) {
      if (error instanceof AuthApiFailure) {
        fail(res, error.status >= 500 ? 503 : error.status, error.code, error.userMessage);
      } else {
        fail(res, 503, 'API_UNAVAILABLE', 'Authorization is temporarily unavailable.');
      }
    }
  });

  /** General Surface resource endpoint. Auth session and bearer token stay on this UI server. */
  router.get('/resources/list/:entityKey', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const observe = createUiSurfaceResponseTrace((name, value) => res.setHeader(name, value));
    try {
      const cookie = cookieValue(req);
      const restored = await workflows.restore(cookie);
      const session = cookie ? workflows.sessions.read(cookie) : null;
      if (restored.status !== 'authenticated' || !session?.apiAccessToken) {
        fail(res, 401, 'SESSION_EXPIRED', 'Please sign in again.');
        return;
      }
      const preferSaved = req.query['preferSavedPageSize'] === 'true';
      const previous = cookie ? workflows.sessions.pageSize(cookie) : null;
      const query =
        preferSaved && previous !== null ? { ...req.query, pageSize: String(previous) } : req.query;
      const data = await requestAuthenticatedSysBOList(
        config.apiBaseUrl,
        session.apiAccessToken,
        String(req.params.entityKey),
        query,
        observe,
      );
      // EJS0-compatible endurance: only an explicitly selected Rows size is saved.
      if (
        cookie &&
        req.query['rememberPageSize'] === 'true' &&
        String(data.paging.pageSize) === String(req.query['pageSize'] ?? '')
      )
        workflows.sessions.rememberPageSize(cookie, data.paging.pageSize);
      res.json({ success: true, data });
    } catch (error) {
      if (error instanceof UiSysBOResourceFailure)
        fail(res, error.status, 'RESOURCE_UNAVAILABLE', error.message);
      else if (error instanceof AuthApiFailure)
        fail(res, error.status >= 500 ? 503 : error.status, error.code, error.userMessage);
      else fail(res, 503, 'RESOURCE_UNAVAILABLE', 'List resource unavailable.');
    }
  });

  /** Same-origin picture rendition. API bearer tokens never enter browser URLs. */
  router.get('/resources/picture/:entityKey/:recordId/:field', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const cookie = cookieValue(req);
      const restored = await workflows.restore(cookie);
      const session = cookie ? workflows.sessions.read(cookie) : null;
      if (restored.status !== 'authenticated' || !session?.apiAccessToken) {
        fail(res, 401, 'SESSION_EXPIRED', 'Please sign in again.');
        return;
      }
      const resource = await requestAuthenticatedSysBOPicture(
        config.apiBaseUrl,
        session.apiAccessToken,
        String(req.params.entityKey),
        String(req.params.recordId),
        String(req.params.field),
        String(req.query.variant ?? 'original'),
      );
      res.type(resource.contentType);
      res.set('Cache-Control', 'private, max-age=300');
      res.set('X-ManatOS-Image-Variant', resource.actualVariant);
      res.send(resource.bytes);
    } catch (error) {
      if (error instanceof UiSysBOResourceFailure)
        fail(res, error.status, 'RESOURCE_UNAVAILABLE', error.message);
      else fail(res, 503, 'RESOURCE_UNAVAILABLE', 'Picture resource unavailable.');
    }
  });

  /** Authorized picture-collection item, using the existing authenticated API resource contract. */
  router.get('/resources/pictures/:entityKey/:recordId/:field/:pictureId', async (req, res) => {
    res.set('Cache-Control', 'private, max-age=300');
    try {
      const cookie = cookieValue(req);
      const restored = await workflows.restore(cookie);
      const session = cookie ? workflows.sessions.read(cookie) : null;
      if (restored.status !== 'authenticated' || !session?.apiAccessToken) {
        fail(res, 401, 'SESSION_EXPIRED', 'Please sign in again.');
        return;
      }
      const resource = await requestAuthenticatedSysBOPictureItem(
        config.apiBaseUrl,
        session.apiAccessToken,
        String(req.params.entityKey),
        String(req.params.recordId),
        String(req.params.field),
        String(req.params.pictureId),
      );
      res.type(resource.contentType);
      res.send(resource.bytes);
    } catch (error) {
      if (error instanceof UiSysBOResourceFailure)
        fail(res, error.status, 'RESOURCE_UNAVAILABLE', error.message);
      else fail(res, 503, 'RESOURCE_UNAVAILABLE', 'Picture resource unavailable.');
    }
  });

  /** Authenticated Entry creation uses the same session, CSRF and API policy as other commands. */
  router.get('/resources/entry-draft/:entityKey', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const observe = createUiSurfaceResponseTrace((name, value) => res.setHeader(name, value));
    try {
      const cookie = cookieValue(req);
      const restored = await workflows.restore(cookie);
      const session = cookie ? workflows.sessions.read(cookie) : null;
      if (restored.status !== 'authenticated' || !session?.apiAccessToken) {
        fail(res, 401, 'SESSION_EXPIRED', 'Please sign in again.');
        return;
      }
      const data = await requestAuthenticatedSysBOEntryDraft(
        config.apiBaseUrl,
        session.apiAccessToken,
        String(req.params.entityKey),
        observe,
      );
      res.json({ success: true, data });
    } catch (error) {
      if (error instanceof UiSysBOResourceFailure)
        fail(res, error.status, 'RESOURCE_UNAVAILABLE', error.message);
      else if (error instanceof AuthApiFailure)
        fail(res, error.status >= 500 ? 503 : error.status, error.code, error.userMessage);
      else fail(res, 503, 'RESOURCE_UNAVAILABLE', 'Draft unavailable.');
    }
  });
  router.post(
    '/resources/entry-draft/:entityKey',
    express.json({ limit: '64kb', strict: true }),
    async (req, res) => {
      res.set('Cache-Control', 'no-store');
      if (!checkOrigin(req)) {
        fail(res, 403, 'ORIGIN_REQUIRED', 'Request origin is not allowed.');
        return;
      }
      const cookie = cookieValue(req);
      const session = cookie ? workflows.sessions.read(cookie) : null;
      if (!session || !sameToken(req.get('x-manatos-csrf') ?? '', session.csrfToken)) {
        fail(res, 403, 'CSRF_INVALID', 'Your session has changed. Please retry.');
        return;
      }
      const observe = createUiSurfaceResponseTrace((name, value) => res.setHeader(name, value));
      try {
        const restored = await workflows.restore(cookie);
        const active = cookie ? workflows.sessions.read(cookie) : null;
        if (restored.status !== 'authenticated' || !active?.apiAccessToken) {
          fail(res, 401, 'SESSION_EXPIRED', 'Please sign in again.');
          return;
        }
        const data = await requestAuthenticatedSysBOEntryCreate(
          config.apiBaseUrl,
          active.apiAccessToken,
          String(req.params.entityKey),
          req.body?.record,
          observe,
        );
        res.status(201).json({ success: true, data });
      } catch (error) {
        if (error instanceof UiSysBOResourceFailure)
          fail(res, error.status, 'CREATE_FAILED', error.message);
        else if (error instanceof AuthApiFailure)
          fail(res, error.status >= 500 ? 503 : error.status, error.code, error.userMessage);
        else fail(res, 503, 'CREATE_FAILED', 'Create request unavailable.');
      }
    },
  );

  /** Per-GUID reference eligibility; no browser-provided permission flags are trusted. */
  router.post(
    '/resources/reference-choice',
    express.json({ limit: '4kb', strict: true }),
    async (req, res) => {
      res.set('Cache-Control', 'no-store');
      if (!checkOrigin(req)) {
        fail(res, 403, 'ORIGIN_REQUIRED', 'Request origin is not allowed.');
        return;
      }
      const cookie = cookieValue(req);
      const session = cookie ? workflows.sessions.read(cookie) : null;
      if (!session || !sameToken(req.get('x-manatos-csrf') ?? '', session.csrfToken)) {
        fail(res, 403, 'CSRF_INVALID', 'Your session has changed. Please retry.');
        return;
      }
      const observe = createUiSurfaceResponseTrace((name, value) => res.setHeader(name, value));
      try {
        const restored = await workflows.restore(cookie);
        const active = cookie ? workflows.sessions.read(cookie) : null;
        if (restored.status !== 'authenticated' || !active?.apiAccessToken) {
          fail(res, 401, 'SESSION_EXPIRED', 'Please sign in again.');
          return;
        }
        const data = await requestAuthenticatedSysBOReferenceChoice(
          config.apiBaseUrl,
          active.apiAccessToken,
          req.body,
          observe,
        );
        res.json({ success: true, data });
      } catch (error) {
        if (error instanceof UiSysBOResourceFailure)
          fail(res, error.status, 'REFERENCE_UNAVAILABLE', error.message);
        else if (error instanceof AuthApiFailure)
          fail(res, error.status >= 500 ? 503 : error.status, error.code, error.userMessage);
        else fail(res, 503, 'REFERENCE_UNAVAILABLE', 'Reference unavailable.');
      }
    },
  );

  /** Entry uses the same secure, authenticated UI host resource boundary as List. */
  router.get('/resources/entry/:entityKey/:recordId', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const observe = createUiSurfaceResponseTrace((name, value) => res.setHeader(name, value));
    try {
      const cookie = cookieValue(req);
      const restored = await workflows.restore(cookie);
      const session = cookie ? workflows.sessions.read(cookie) : null;
      if (restored.status !== 'authenticated' || !session?.apiAccessToken) {
        fail(res, 401, 'SESSION_EXPIRED', 'Please sign in again.');
        return;
      }
      const data = await requestAuthenticatedSysBOEntry(
        config.apiBaseUrl,
        session.apiAccessToken,
        String(req.params.entityKey),
        String(req.params.recordId),
        observe,
      );
      res.json({ success: true, data });
    } catch (error) {
      if (error instanceof UiSysBOResourceFailure)
        fail(res, error.status, 'RESOURCE_UNAVAILABLE', error.message);
      else if (error instanceof AuthApiFailure)
        fail(res, error.status >= 500 ? 503 : error.status, error.code, error.userMessage);
      else fail(res, 503, 'RESOURCE_UNAVAILABLE', 'Entry resource unavailable.');
    }
  });

  /** Read-only calculation delegation: same session, CSRF and API authorization boundary. */
  router.post(
    '/resources/expression-function',
    express.json({ limit: '4kb', strict: true }),
    async (req, res) => {
      res.set('Cache-Control', 'no-store');
      if (!checkOrigin(req)) {
        fail(res, 403, 'ORIGIN_REQUIRED', 'Request origin is not allowed.');
        return;
      }
      const cookie = cookieValue(req);
      const session = cookie ? workflows.sessions.read(cookie) : null;
      if (!session || !sameToken(req.get('x-manatos-csrf') ?? '', session.csrfToken)) {
        fail(res, 403, 'CSRF_INVALID', 'Your session has changed. Please retry.');
        return;
      }
      const observe = createUiSurfaceResponseTrace((name, value) => res.setHeader(name, value));
      try {
        const restored = await workflows.restore(cookie);
        const active = cookie ? workflows.sessions.read(cookie) : null;
        if (restored.status !== 'authenticated' || !active?.apiAccessToken) {
          fail(res, 401, 'SESSION_EXPIRED', 'Please sign in again.');
          return;
        }
        const data = await requestAuthenticatedExpressionFunction(
          config.apiBaseUrl,
          active.apiAccessToken,
          req.body,
          observe,
        );
        res.json({ success: true, data });
      } catch (error) {
        if (error instanceof UiSysBOResourceFailure)
          fail(res, error.status, 'RESOURCE_UNAVAILABLE', error.message);
        else if (error instanceof AuthApiFailure)
          fail(res, error.status >= 500 ? 503 : error.status, error.code, error.userMessage);
        else fail(res, 503, 'RESOURCE_UNAVAILABLE', 'Expression capability unavailable.');
      }
    },
  );

  /** Read-only batched related entries; credentials never leave the UI host. */
  router.post(
    '/resources/references',
    express.json({ limit: '24kb', strict: true }),
    async (req, res) => {
      res.set('Cache-Control', 'no-store');
      const observe = createUiSurfaceResponseTrace((name, value) => res.setHeader(name, value));

      try {
        const cookie = cookieValue(req);
        const restored = await workflows.restore(cookie);
        const session = cookie ? workflows.sessions.read(cookie) : null;
        if (restored.status !== 'authenticated' || !session?.apiAccessToken) {
          fail(res, 401, 'SESSION_EXPIRED', 'Please sign in again.');
          return;
        }
        const data = await requestAuthenticatedSysBOReferences(
          config.apiBaseUrl,
          session.apiAccessToken,
          req.body,
          observe,
        );
        res.json({ success: true, data });
      } catch (error) {
        if (error instanceof UiSysBOResourceFailure)
          fail(res, error.status, 'RESOURCE_UNAVAILABLE', error.message);
        else if (error instanceof AuthApiFailure)
          fail(res, error.status >= 500 ? 503 : error.status, error.code, error.userMessage);
        else fail(res, 503, 'RESOURCE_UNAVAILABLE', 'Related records unavailable.');
      }
    },
  );

  /** Same-origin profile image, scoped to the session's own user. */
  router.get('/photo', async (req, res) => {
    try {
      const cookie = cookieValue(req);
      const session = cookie ? workflows.sessions.read(cookie) : null;
      if (!session?.apiAccessToken) {
        res.sendStatus(401);
        return;
      }

      const user = await api.currentUser(session.apiAccessToken);
      if (user.id !== session.userId) {
        res.sendStatus(401);
        return;
      }
      if (!user['photo']) {
        res.sendStatus(404);
        return;
      }

      const picture = await api.userPhoto(session.apiAccessToken, user.id);
      if (!picture) {
        res.sendStatus(404);
        return;
      }
      res.set('Cache-Control', 'private, no-store');
      res.type(picture.contentType).send(picture.bytes);
    } catch {
      res.sendStatus(503);
    }
  });

  /** Protect state-changing Auth operations. */
  const requireCsrf: RequestHandler = (req, res, next) => {
    if (!checkOrigin(req)) {
      fail(res, 403, 'ORIGIN_REQUIRED', 'Request origin is not allowed.');
      return;
    }

    const session = workflows.sessions.read(cookieValue(req) ?? '');

    if (!session || !sameToken(req.get('x-manatos-csrf') ?? '', session.csrfToken)) {
      fail(res, 403, 'CSRF_INVALID', 'Your session has changed. Please retry.');
      return;
    }

    next();
  };

  router.post(
    '/signin',
    requireCsrf,
    express.json({ limit: '8kb', strict: true }),

    /**
     * Count every accepted CSRF-validated Sign In request.
     *
     * This is a separate UI-host limit. The public API remains
     * authoritative for requests made directly to the API.
     */
    (req, res, next) => {
      const decision = loginLimits.record(ipKey(req), AUTH_RATE_LIMITS.loginByIp);

      if (!decision.allowed) {
        rejectLimit(res, decision);
        return;
      }

      next();
    },

    async (req, res) => {
      const identity = typeof req.body?.identity === 'string' ? req.body.identity.trim() : '';
      const password = typeof req.body?.password === 'string' ? req.body.password : '';

      if (!identity || !password || identity.length > 320 || password.length > 4096) {
        fail(res, 400, 'INVALID_CREDENTIALS', 'Enter your user name/email and password.');
        return;
      }

      /**
       * An identity blocked by repeated bad passwords must not
       * reach another API credential-verification attempt.
       */
      const key = failureKey(req, identity);

      /**
       * Reserve a slot BEFORE awaiting the remote API.
       *
       * Multiple browser tabs and windows share these server-side counters.
       * Parallel requests cannot bypass the five-failure allowance.
       */
      const reservation = loginLimits.reserve(key, AUTH_RATE_LIMITS.loginFailures);

      if (!reservation.decision.allowed) {
        rejectLimit(res, reservation.decision);
        return;
      }

      try {
        const result = await workflows.signIn(cookieValue(req), identity, password, clientIp(req));

        reservation.finish('release');

        // Successful Sign In clears completed failures.
        loginLimits.clear(key);

        res.cookie(COOKIE, result.issued.cookieValue, {
          ...cookieSettings,
          maxAge: Math.max(1, result.issued.expiresAt - Date.now()),
        });
        clearLegacyCookie(res);

        res.json({
          success: true,
          data: {
            user: result.user,
            csrfToken: result.csrfToken,
          },
        });
      } catch (error) {
        /**
         * Complete the reservation on every failure path.
         *
         * 401 INVALID_CREDENTIALS: commit a failed attempt.
         * API timeout, unavailable server, 429 or other errors: release it.
         */
        reservation.finish(
          error instanceof AuthApiFailure &&
            error.status === 401 &&
            error.code === 'INVALID_CREDENTIALS'
            ? 'failure'
            : 'release',
        );

        if (error instanceof AuthApiFailure) {
          /**
           * If the public API is already rate-limiting this request,
           * forward its Retry-After value to the browser.
           */
          if (error.status === 429 && error.retryAfterSeconds) {
            res.set('Retry-After', String(error.retryAfterSeconds));
          }

          fail(res, error.status >= 500 ? 503 : error.status, error.code, error.userMessage);
        } else {
          fail(res, 503, 'AUTH_UNAVAILABLE', 'Unable to complete Sign In.');
        }
      }
    },
  );

  /** Email registration follows EJS0: create Guest, send one-use verification link, no session yet. */
  router.post(
    '/register/email',
    requireCsrf,
    express.json({ limit: '8kb', strict: true }),
    async (req, res) => {
      const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
      const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
      const password = typeof req.body?.password === 'string' ? req.body.password : '';
      const confirmation = typeof req.body?.confirmation === 'string' ? req.body.confirmation : '';
      if (
        name.length < 2 ||
        name.length > 128 ||
        email.length > 320 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
        password.length < 9 ||
        password.length > 4096 ||
        !/[A-Za-z]/.test(password) ||
        !/[0-9]/.test(password) ||
        !/[^A-Za-z0-9]/.test(password) ||
        password !== confirmation
      ) {
        fail(res, 400, 'INVALID_REGISTRATION', 'Check the registration fields and try again.');
        return;
      }
      if (!config.publicBaseUrl) {
        fail(res, 503, 'REGISTRATION_UNAVAILABLE', 'Email verification is not configured.');
        return;
      }
      const decision = loginLimits.record(
        'ejs1:register:ip:' + clientIp(req),
        AUTH_RATE_LIMITS.registration,
      );
      if (!decision.allowed) {
        rejectLimit(res, decision);
        return;
      }
      try {
        const user = await api.registerGuest(name, email, password, clientIp(req));
        const token = verificationTokens.issue(user.id, 'verify-email');
        let emailSent = true;
        try {
          await api.sendRegistrationEmail(
            user.id,
            config.publicBaseUrl + '/_manatos/auth/verify-email?token=' + encodeURIComponent(token),
          );
        } catch {
          // Account creation succeeded: never encourage duplicate creation on SMTP failure.
          emailSent = false;
        }
        res.status(201).json({ success: true, data: { created: true, emailSent } });
      } catch (error) {
        if (error instanceof AuthApiFailure) {
          if (error.status === 429 && error.retryAfterSeconds)
            res.set('Retry-After', String(error.retryAfterSeconds));
          fail(res, error.status >= 500 ? 503 : error.status, error.code, error.userMessage);
        } else
          fail(res, 503, 'REGISTRATION_UNAVAILABLE', 'Registration is temporarily unavailable.');
      }
    },
  );

  /** Single-use emailed verification: mark authoritative API account, then establish normal UI session. */
  router.get('/verify-email', async (req, res) => {
    res.set('Referrer-Policy', 'no-referrer');
    const token = typeof req.query.token === 'string' ? req.query.token : '';
    const verified = verificationTokens.consume(token, 'verify-email');
    if (verified.status === 'already-verified') {
      res.redirect(303, '/?emailVerified=already');
      return;
    }
    if (verified.status !== 'valid') {
      res.redirect(303, '/?emailVerified=invalid');
      return;
    }
    try {
      await api.markEmailVerified(verified.userId);
      const login = await api.trustedSession(verified.userId);
      if (login.user.id !== verified.userId) throw new Error('Account identity mismatch.');
      const issued = workflows.establishExternal(cookieValue(req), login);
      res.cookie(COOKIE, issued.cookieValue, {
        ...cookieSettings,
        maxAge: Math.max(1, issued.expiresAt - Date.now()),
      });
      clearLegacyCookie(res);
      res.redirect(303, '/?emailVerified=success');
    } catch {
      // A consumed verification token must never authenticate a second identity.
      res.redirect(303, '/?emailVerified=failed');
    }
  });

  /** Recovery is anonymous, CSRF-bound, and its tokens remain API-authoritative. */
  router.post(
    '/password-recovery/request',
    requireCsrf,
    express.json({ limit: '8kb', strict: true }),
    async (req, res) => {
      const identity = typeof req.body?.identity === 'string' ? req.body.identity.trim() : '';
      if (!identity || identity.length > 320 || !config.publicBaseUrl) {
        fail(res, 400, 'INVALID_RECOVERY_REQUEST', 'Enter your email address or user name.');
        return;
      }
      const decision = loginLimits.record(
        'ejs1:recover:ip:' + clientIp(req),
        AUTH_RATE_LIMITS.registration,
      );
      if (!decision.allowed) {
        rejectLimit(res, decision);
        return;
      }
      // Hide account existence and SMTP delivery details from the browser.
      try {
        await api.requestPasswordRecovery(identity, config.publicBaseUrl);
      } catch {
        /* neutral */
      }
      res.json({ success: true, data: { requested: true } });
    },
  );

  router.post(
    '/password-recovery/inspect',
    requireCsrf,
    express.json({ limit: '8kb', strict: true }),
    async (req, res) => {
      try {
        const token = typeof req.body?.token === 'string' ? req.body.token : '';
        const result = await api.inspectPasswordRecovery(token);
        res.json({ success: true, data: result });
      } catch {
        fail(res, 503, 'RECOVERY_UNAVAILABLE', 'Recovery service is unavailable.');
      }
    },
  );

  router.post(
    '/password-recovery/complete',
    requireCsrf,
    express.json({ limit: '8kb', strict: true }),
    async (req, res) => {
      const token = typeof req.body?.token === 'string' ? req.body.token : '';
      const password = typeof req.body?.password === 'string' ? req.body.password : '';
      if (!token || !password || password.length > 4096) {
        fail(res, 400, 'INVALID_RECOVERY_REQUEST', 'Enter the new password.');
        return;
      }
      const decision = loginLimits.record(
        'ejs1:recover-complete:' + clientIp(req),
        AUTH_RATE_LIMITS.loginByIp,
      );
      if (!decision.allowed) {
        rejectLimit(res, decision);
        return;
      }
      try {
        await api.completePasswordRecovery(token, password);
        res.json({ success: true, data: { changed: true } });
      } catch (error) {
        if (error instanceof AuthApiFailure) {
          fail(res, error.status >= 500 ? 503 : error.status, error.code, error.userMessage);
        } else fail(res, 503, 'RECOVERY_UNAVAILABLE', 'Recovery service is unavailable.');
      }
    },
  );

  /** CSRF-checked authenticated password change via the UI host's own API token. */
  router.post(
    '/password/change',
    requireCsrf,
    express.json({ limit: '8kb', strict: true }),
    async (req, res) => {
      const currentPassword =
        typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : undefined;
      const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';
      if (!newPassword || newPassword.length > 4096 || (currentPassword?.length ?? 0) > 4096) {
        fail(res, 400, 'INVALID_PASSWORD', 'Enter a valid new password.');
        return;
      }
      const cookie = cookieValue(req);
      const session = cookie ? workflows.sessions.read(cookie) : null;
      if (!cookie || !session?.apiAccessToken) {
        fail(res, 401, 'SESSION_EXPIRED', 'Please sign in again.');
        return;
      }
      const decision = loginLimits.record(
        'ejs1:password:change:' + clientIp(req),
        AUTH_RATE_LIMITS.loginByIp,
      );
      if (!decision.allowed) {
        rejectLimit(res, decision);
        return;
      }
      try {
        const restored = await workflows.restore(cookie);
        if (restored.status !== 'authenticated') {
          fail(res, 401, 'SESSION_EXPIRED', 'Please sign in again.');
          return;
        }
        // Restoration may refresh the server-side session; use its current token.
        const activeSession = workflows.sessions.read(cookie);
        if (!activeSession?.apiAccessToken) {
          fail(res, 401, 'SESSION_EXPIRED', 'Please sign in again.');
          return;
        }
        await api.changePassword(activeSession.apiAccessToken, currentPassword, newPassword);
        res.json({ success: true, data: { changed: true } });
      } catch (error) {
        if (error instanceof AuthApiFailure) {
          if (error.status === 429 && error.retryAfterSeconds)
            res.set('Retry-After', String(error.retryAfterSeconds));
          fail(res, error.status >= 500 ? 503 : error.status, error.code, error.userMessage);
        } else {
          fail(res, 503, 'AUTH_UNAVAILABLE', 'Could not change the password.');
        }
      }
    },
  );

  router.post('/signout', requireCsrf, async (req, res) => {
    // The workflow revokes the UI session first, regardless of remote API
    // logout availability. Clear the cookie even if an unexpected error occurs.
    try {
      await workflows.signOut(cookieValue(req));
    } finally {
      clear(res);
      clearLegacyCookie(res);
    }

    res.json({
      success: true,
      data: { status: 'anonymous' },
    });
  });

  return router;
}
