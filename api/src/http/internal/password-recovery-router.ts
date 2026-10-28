import { Router } from 'express';
import { InMemoryRateLimiter, AUTH_RATE_LIMITS } from '@manatos/shared';
import type { PasswordRecoveryService } from '../../auth/password-recovery.js';
import { sendCommand, sendQuery, sendFailure } from '../response.js';

/** All endpoints are behind the API's existing internal-key middleware. */
export function createInternalPasswordRecoveryRouter(recovery: PasswordRecoveryService) {
  const router = Router();
  const limiter = new InMemoryRateLimiter();

  router.post('/request', async (req, res) => {
    const decision = limiter.record(
      `recover:${req.ip ?? req.socket.remoteAddress ?? 'unknown'}`,
      AUTH_RATE_LIMITS.registration,
    );
    if (!decision.allowed) {
      res.set('Retry-After', String(decision.retryAfterSeconds));
      return sendFailure(res, 429, 'AUTH_RATE_LIMITED', 'Please try again later.', true);
    }
    // Identity existence, email delivery and mailbox eligibility must not be disclosed.
    try {
      await recovery.request(
        typeof req.body?.identity === 'string' ? req.body.identity : '',
        typeof req.body?.uiOrigin === 'string' ? req.body.uiOrigin : '',
      );
    } catch {
      /* same neutral result */
    }
    return sendCommand(res, 'If an eligible account matches, instructions will be sent.', null);
  });

  router.post('/inspect', (req, res) =>
    sendQuery(res, { valid: recovery.inspect(String(req.body?.token ?? '')) }),
  );

  router.post('/complete', async (req, res) => {
    const decision = limiter.record(
      `recover-complete:${req.ip ?? req.socket.remoteAddress ?? 'unknown'}`,
      AUTH_RATE_LIMITS.loginByIp,
    );
    if (!decision.allowed) {
      res.set('Retry-After', String(decision.retryAfterSeconds));
      return sendFailure(res, 429, 'AUTH_RATE_LIMITED', 'Please try again later.', true);
    }
    const token = typeof req.body?.token === 'string' ? req.body.token : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!token || password.length < 1 || password.length > 4096) {
      return sendFailure(
        res,
        400,
        'INVALID_RESET_REQUEST',
        'The password request is invalid.',
        false,
      );
    }
    try {
      const completed = await recovery.complete(token, password);
      if (!completed)
        return sendFailure(
          res,
          400,
          'INVALID_RESET_TOKEN',
          'The password link is invalid or has expired.',
          false,
        );
      return sendCommand(res, 'Password changed.', null);
    } catch (error) {
      return sendFailure(
        res,
        400,
        'PASSWORD_POLICY',
        error instanceof Error ? error.message : 'Invalid password.',
        false,
      );
    }
  });
  return router;
}
