import type { ManatOSUserContext, ManatOSUserPermissionsContext } from '@manatos/shared';
import type { SurfaceEventSource } from '../surface/contracts.js';
import { RootCtxRuntime } from './root-ctx-runtime.js';

const USER_OWNER = 'current-user-adapter';
const PERMISSIONS_OWNER = 'permissions-adapter';
const PLATFORM_OWNER = 'current-platform-adapter';

/** Server/session-owned authenticated-user projection. */
export class CurrentUserCtxAdapter {
  constructor(private readonly root: RootCtxRuntime) {
    root.registerMutable({
      path: 'ctx.user',
      owner: USER_OWNER,
      authority: 'server-resolved',
      description: 'Authenticated safe user context; null while anonymous.',
    });
  }

  set(user: ManatOSUserContext | null, source: SurfaceEventSource = 'server') {
    return this.root.set({ path: 'ctx.user', value: user, owner: USER_OWNER, source });
  }
}

/**
 * Server-resolved authorization projection used by declarative UX decisions.
 * This is presentation state only; APIs remain the authoritative enforcement
 * boundary for every protected operation.
 */
export class PermissionsCtxAdapter {
  constructor(private readonly root: RootCtxRuntime) {
    root.registerMutable({
      path: 'ctx.user.permissions',
      owner: PERMISSIONS_OWNER,
      authority: 'server-resolved',
      description: 'Resolved current-user/platform authorization facts for UI expressions.',
    });
  }

  set(permissions: ManatOSUserPermissionsContext, source: SurfaceEventSource = 'server') {
    if (this.root.value('ctx.user') == null) {
      throw new Error('V2 permissions cannot be projected while ctx.user is null.');
    }
    return this.root.set({
      path: 'ctx.user.permissions',
      value: permissions,
      owner: PERMISSIONS_OWNER,
      source,
    });
  }
}

/** UI-navigation-owned active platform identity inside the company context. */
export class CurrentPlatformCtxAdapter {
  constructor(private readonly root: RootCtxRuntime) {
    root.registerMutable({
      path: 'ctx.company.currentPlatform',
      owner: PLATFORM_OWNER,
      authority: 'ui-runtime',
      description: 'Canonical current platform id selected by UI navigation.',
    });
    root.registerMutable({
      path: 'ctx.company.currentPlatformIndex',
      owner: PLATFORM_OWNER,
      authority: 'ui-runtime',
      description: 'Canonical current platform index paired with currentPlatform.',
    });
  }

  set(platformId: string, platformIndex: number, source: SurfaceEventSource = 'engine'): void {
    this.root.setMany([
      {
        path: 'ctx.company.currentPlatform',
        value: platformId,
        owner: PLATFORM_OWNER,
        source,
      },
      {
        path: 'ctx.company.currentPlatformIndex',
        value: platformIndex,
        owner: PLATFORM_OWNER,
        source,
      },
    ]);
  }
}
