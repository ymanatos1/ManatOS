import { randomUUID } from 'node:crypto';

import type { RequestHandler } from 'express';

import { operationContext } from '@manatos/shared';

/**
 * Establishes the application execution context for every HTTP request.
 *
 * If the caller supplies:
 *
 *   x-request-id
 *
 * that value becomes the correlation ID.
 *
 * Otherwise, the API generates a new UUID.
 *
 * The same request ID is returned in the response headers so that
 * client-side errors, API logs and operation traces can be correlated.
 */
export const requestContextMiddleware: RequestHandler = (req, res, next) => {
  const requestId = req.header('x-request-id') || randomUUID();

  /*
   * Return the correlation identifier to the caller.
   */
  res.setHeader('x-request-id', requestId);

  /*
   * Establish AsyncLocalStorage state before execution continues
   * through the rest of the Express middleware pipeline.
   */
  operationContext.runRequest(requestId, () => {
    operationContext.beginRequestOperation(`${req.method} ${req.path}`, 'Processing API request');

    /*
     * The request root deliberately spans body parsing, authentication, routing
     * and service execution. Successful requests discard it at response end;
     * failures are snapshotted by the central error handler before that point.
     */
    res.once('finish', () => operationContext.completeRequestOperation());

    next();
  });
};
