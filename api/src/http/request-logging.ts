import type { RequestHandler } from 'express';

import { logger } from '../logging/logger.js';

/**
 * Central request/response logging.
 *
 * The request-context middleware must run before this middleware so each log
 * entry carries the same x-request-id returned to the caller.
 */
export const requestLoggingMiddleware: RequestHandler = (req, res, next) => {
  const startedAt = performance.now();

  logger.info('HTTP request started', {
    method: req.method,
    path: req.originalUrl,
    ipAddress: req.ip,
  });

  res.on('finish', () => {
    logger.info('HTTP request completed', {
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
    });
  });

  next();
};
