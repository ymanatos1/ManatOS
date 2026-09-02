import createError from 'http-errors';
import type { NextFunction, Request, Response } from 'express';

import { contextPlatformAccess } from '../context/manatos-context.js';

/**
 * Require entitlement to the currently selected platform.
 *
 * Entitlement is resolved once by the page-context middleware from canonical
 * license/role facts and stored under ctx.user.permissions.<platform>.capabilities.
 * Platform features consume that authoritative server-built CTX fact instead of
 * mirroring it into app.* or reimplementing license traversal in each route.
 */
export function requireCurrentPlatformEntitlement(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  const platformId = String(res.locals.ctx?.company?.currentPlatform ?? '');
  if (contextPlatformAccess(res.locals.ctx, platformId)) {
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
