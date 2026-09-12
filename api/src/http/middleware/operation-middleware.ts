import type { RequestHandler } from 'express';

import { operationContext } from '@manatos/shared';

/**
 * Run one Express pipeline middleware inside a semantic operation.
 *
 * The wrapped middleware retains its existing Express next(error) contract;
 * this adapter only makes that boundary visible in the request operation tree.
 */
export function operationMiddleware(
  description: string,
  middleware: RequestHandler,
  userDescription?: string,
): RequestHandler {
  return (req, res, next) => {
    void operationContext
      .run(
        description,
        async () =>
          await new Promise<void>((resolve, reject) => {
            let settled = false;
            const finish = (error?: unknown) => {
              if (settled) return;
              settled = true;
              if (error) reject(error);
              else resolve();
            };

            try {
              const result = middleware(req, res, finish);
              Promise.resolve(result).catch(finish);
            } catch (error) {
              finish(error);
            }
          }),
        userDescription,
      )
      .then(
        () => next(),
        (error) => next(error),
      );
  };
}
