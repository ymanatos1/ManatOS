import createError from 'http-errors';
import type { NextFunction, Request, Response } from 'express';

import { contextPlatformAccess } from '../context/manatos-context.js';

/**
 * Require entitlement to the currently selected platform.
 *
 * Entitlement is resolved by the API authorization layer and projected by the
 * page-context middleware into ctx.user.permissions.<platform>.capabilities.
 * Platform features consume that server-authoritative CTX fact instead of
 * mirroring it into app.* or reconstructing license/role policy in UI code.
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
