import type { RequestHandler } from 'express';

import { ForbiddenAppError } from '@manatos/shared';

import { config } from '../config.js';

/**
 * Protects internal API endpoints using the configured internal API key.
 *
 * The caller must provide:
 *
 *   x-internal-api-key: <configured key>
 *
 * This mechanism is intended for trusted internal communication and
 * must not be used as the normal end-user authentication mechanism.
 */
export const requireInternalApiKey: RequestHandler = (req, _res, next) => {
  const suppliedApiKey = req.header('x-internal-api-key');

  if (suppliedApiKey !== config.INTERNAL_API_KEY) {
    next(new ForbiddenAppError('Missing or invalid internal API key.'));

    return;
  }

  next();
};
