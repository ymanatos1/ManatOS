import createError from 'http-errors';
import type { NextFunction, Request, Response } from 'express';

/**
 * Require entitlement to the currently selected platform.
 *
 * Entitlement is resolved once by the page-context middleware from canonical
 * license/role facts. Platform features consume that resolved fact instead of
 * reimplementing license traversal in each route.
 */
export function requireCurrentPlatformEntitlement(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (res.locals.app?.currentPlatformEntitled) {
    next();
    return;
  }

  const platformName = String(
    res.locals.app?.currentPlatform?.shortName ??
      res.locals.app?.currentPlatform?.name ??
      'current platform',
  );
  next(createError(403, `Access requires a current ${platformName} license entitlement.`));
}
