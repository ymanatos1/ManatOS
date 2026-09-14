import { randomUUID } from 'node:crypto';

import type { RequestHandler } from 'express';

import { operationContext } from '@manatos/shared';

import { apiContextRuntime } from '../../context/api-context-runtime.js';

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
  apiContextRuntime.runRequest(requestId, { method: req.method, path: req.path }, () => {
    operationContext.runRequest(requestId, () => {
      operationContext.beginRequestOperation(`${req.method} ${req.path}`, 'Processing API request');

      /*
       * Both diagnostic operations and semantic API CTX span the complete HTTP
       * lifecycle. Cleanup is idempotent because close may follow finish.
       */
      const complete = () => {
        operationContext.completeRequestOperation();
        apiContextRuntime.endRequest(requestId);
      };
      res.once('finish', complete);
      res.once('close', complete);

      next();
    });
  });
};
