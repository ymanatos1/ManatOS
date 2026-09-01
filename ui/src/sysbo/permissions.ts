import createError from 'http-errors';

import { SysBOUserRole, type SysBOUser } from '@manatos/shared';

import type { SysBODefinition } from './types.js';

/** UI projection of the role/record authorization contract for one SysBO. */
export interface UIEntityPermissions {
  view: boolean;
  create: boolean;
  edit: boolean;
  delete: boolean;
}

/**
 * Resolve UI capabilities for one SysBO record.
 *
 * The API remains authoritative; this helper keeps page/feature routes from
 * duplicating role checks and preserves the own-SysUser record invariant.
 */
export function uiPermissions(
  user: SysBOUser | null,
  definition: SysBODefinition,
  recordId?: string,
): UIEntityPermissions {
  const role = user?.role;
  const allowed = (roles: SysBOUserRole[]) => Boolean(role && roles.includes(role));

  const base: UIEntityPermissions = {
    view: allowed(definition.permissions.view),
    create: allowed(definition.permissions.create),
    edit: allowed(definition.permissions.edit),
    delete: allowed(definition.permissions.delete),
  };

  if (user && definition.key === 'sys-users' && recordId === user.id) {
    return {
      ...base,
      view: true,
      edit: true,
      delete: false,
    };
  }

  return base;
}

/** Throw the standard UI 403 used by both generic and platform feature routes. */
export function requirePermission(allowed: boolean, message: string): void {
  if (!allowed) throw createError(403, message);
}
