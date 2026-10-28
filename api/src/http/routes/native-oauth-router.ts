import express, { Router, type Request, type Response } from 'express';
import {
  AppError,
  AUTH_RATE_LIMITS,
  EXTERNAL_PROVIDER_KEYS,
  InMemoryRateLimiter,
  type ExternalProviderKey,
} from '@manatos/shared';
import { NativeOAuthService } from '../../auth/native-oauth-service.js';

function providerKey(value: unknown): ExternalProviderKey | null {
  return typeof value === 'string'
    ? (EXTERNAL_PROVIDER_KEYS.find((provider) => provider === value.toLowerCase()) ?? null)
    : null;
}

function safeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
  );
}

function browserPage(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${safeHtml(title)} · ManatOS</title></head><body><main style="font:16px/1.5 system-ui,sans-serif;max-width:34rem;margin:6vh auto;padding:1.5rem"><h1>${safeHtml(title)}</h1>${body}</main></body></html>`;
}

function browserHeaders(res: Response): void {
  res.set('Cache-Control', 'no-store');
  res.set('Pragma', 'no-cache');
  res.set('Referrer-Policy', 'no-referrer');
  res.set('X-Content-Type-Options', 'nosniff');
  res.set(
    'Content-Security-Policy',
    "default-src 'none'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'; style-src 'unsafe-inline'",
  );
}

function clientIp(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}

function limit(res: Response, decision: { allowed: boolean; retryAfterSeconds: number }): void {
  if (decision.allowed) return;
  res.set('Retry-After', String(decision.retryAfterSeconds));
  throw new AppError(
    'AUTH_RATE_LIMITED',
    'Native authentication rate limit exceeded.',
    'Too many authentication attempts. Please try again later.',
    true,
  );
}

/** Public, native-facing operations: exactly start, claim/poll and cancel. */
export function createNativeOAuthOperations(service: NativeOAuthService): Router {
  const router = Router();
  const limiter = new InMemoryRateLimiter();
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  router.post('/attempts', async (req, res) => {
    limit(res, limiter.record(`native:start:${clientIp(req)}`, AUTH_RATE_LIMITS.oauthInitiation));
    const provider = providerKey(req.body?.provider);
    if (!provider)
      throw new AppError(
        'NATIVE_OAUTH_INVALID_REQUEST',
        'Unsupported native OAuth provider.',
        'Invalid authentication provider.',
        false,
      );
    const data = await service.start(provider, req.body?.challenge, req.body?.clientName);
    res.status(201).json({ success: true, message: 'Native authentication initiated.', data });
  });

  router.post('/attempts/:id/claim', async (req, res) => {
    limit(
      res,
      limiter.record(`native:claim:ip:${clientIp(req)}`, AUTH_RATE_LIMITS.nativeOAuthClaimByIp),
    );
    const id = String(req.params.id ?? '');
    limit(
      res,
      limiter.record(`native:claim:attempt:${id}`, AUTH_RATE_LIMITS.nativeOAuthClaimByAttempt),
    );
    const result = await service.claim(id, req.body?.verifier, {
      ...(req.header('user-agent') ? { userAgent: req.header('user-agent')!.slice(0, 256) } : {}),
      ipAddress: clientIp(req),
    });
    res.status(result.pending ? 202 : 200).json({
      success: true,
      message: result.pending
        ? 'Authentication is pending.'
        : 'Authentication completed successfully.',
      data: result.data,
    });
  });

  router.delete('/attempts/:id', (req, res) => {
    limit(
      res,
      limiter.record(`native:cancel:${clientIp(req)}`, AUTH_RATE_LIMITS.nativeOAuthClaimByIp),
    );
    service.cancel(String(req.params.id ?? ''), req.header('x-native-oauth-verifier'));
    res.status(204).end();
  });
  return router;
}

/** Browser-facing provider callbacks and deliberate native-device confirmation. */
export function createNativeOAuthBrowserRoutes(
  service: NativeOAuthService,
  origin: string,
): Router {
  const router = Router();
  const limiter = new InMemoryRateLimiter();
  router.use((_req, res, next) => {
    browserHeaders(res);
    next();
  });

  router.get('/:provider/callback', async (req, res) => {
    const provider = providerKey(req.params.provider);
    if (!provider) {
      res.status(404).send(browserPage('Authentication unavailable', '<p>Unknown provider.</p>'));
      return;
    }
    // Query values are used only by the callback protocol. Global middleware
    // must not log the query, including on failures or malformed callbacks.
    const result = await service.callbackResult(
      provider,
      req.query.state,
      req.query.code,
      req.query.error,
    );
    if (!result) {
      res
        .status(400)
        .send(
          browserPage(
            'Sign-in was not completed',
            '<p>The authentication attempt expired, was cancelled, or could not be verified. Return to ManatOS and start again.</p>',
          ),
        );
      return;
    }
    const name = safeHtml(result.clientName);
    const id = safeHtml(result.id);
    const token = safeHtml(result.approvalToken);
    res.status(200).send(
      browserPage(
        'Approve native sign-in',
        `
      <p>A ManatOS native application identified as <strong>${name}</strong> requested access to your account.</p>
      <p><strong>Only continue if you personally started this sign-in in your ManatOS app.</strong>
      An attacker can send you a sign-in link: do not approve a request opened from a message or an unexpected website.</p>
      <p>Enter the eight-digit confirmation code displayed in the <strong>initiating ManatOS app</strong>.</p>
      <form method="post" action="/auth/native-oauth/approve">
        <input type="hidden" name="attemptId" value="${id}">
        <input type="hidden" name="approvalToken" value="${token}">
        <label for="code">App confirmation code</label>
        <input id="code" name="confirmationCode" inputmode="numeric" pattern="[0-9]{8}" maxlength="8" required autocomplete="off">
        <button type="submit">Approve this device</button>
      </form>
      <p>The app/device name is supplied by the requesting client and is not independently verified.</p>`,
      ),
    );
  });

  router.post(
    '/native-oauth/approve',
    express.urlencoded({ extended: false, limit: '4kb' }),
    (req, res) => {
      // Browser form authorization: never accept cross-site POSTs, even with a
      // stolen/guessed attempt ID. The hidden approval token is one-time and
      // independent of both native challenge and provider state.
      if (req.get('origin') !== origin) {
        res
          .status(403)
          .send(
            browserPage(
              'Sign-in was not completed',
              '<p>Approval must originate from the ManatOS confirmation page.</p>',
            ),
          );
        return;
      }
      const attemptId = typeof req.body?.attemptId === 'string' ? req.body.attemptId : '';
      limit(
        res,
        limiter.record(`native:approve:ip:${clientIp(req)}`, AUTH_RATE_LIMITS.nativeOAuthApproval),
      );
      limit(
        res,
        limiter.record(`native:approve:attempt:${attemptId}`, AUTH_RATE_LIMITS.nativeOAuthApproval),
      );
      const ok = service.approve(attemptId, req.body?.approvalToken, req.body?.confirmationCode);
      res
        .status(ok ? 200 : 400)
        .send(
          ok
            ? browserPage(
                'Device approved',
                '<p>Return to your ManatOS application. The sign-in can now finish there. You may close this browser tab.</p>',
              )
            : browserPage(
                'Approval failed',
                '<p>The code is incorrect or this approval expired. Return to your ManatOS application and restart sign-in if needed.</p>',
              ),
        );
    },
  );
  return router;
}
