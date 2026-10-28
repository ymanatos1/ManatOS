import { describe, expect, it } from 'vitest';

import {
  MANATOS_COMPANY,
  createEffectiveRuntimeContext,
  createRuntimeSemanticContext,
  resolvePlatform,
} from '../src/index.js';

describe('effective runtime context', () => {
  it('keeps semantic projection separate from user state', () => {
    const protoCrm = resolvePlatform(MANATOS_COMPANY, 'protocrm');
    const semantic = createRuntimeSemanticContext(MANATOS_COMPANY, protoCrm);

    const anonymous = createEffectiveRuntimeContext(MANATOS_COMPANY, protoCrm, null, semantic);
    const user = {
      scope: 'sys',
      entityName: 'sysUsers',
      mode: { kind: 'pointer' as const, value: 'view' },
      fields: {},
      permissions: { userRole: 'Admin', platforms: {} },
    };
    const authenticated = createEffectiveRuntimeContext(MANATOS_COMPANY, protoCrm, user, semantic);

    expect(authenticated.subsystems).toBe(anonymous.subsystems);
    expect(authenticated.entities).toBe(anonymous.entities);
    expect(authenticated.enums).toBe(anonymous.enums);
    expect(authenticated.user).toBe(user);
  });

  it('projects different effective semantics for None, protoCRM and Panoptes', () => {
    const none = createRuntimeSemanticContext(MANATOS_COMPANY, null);
    const protoCrm = createRuntimeSemanticContext(
      MANATOS_COMPANY,
      resolvePlatform(MANATOS_COMPANY, 'protocrm'),
    );
    const panoptes = createRuntimeSemanticContext(
      MANATOS_COMPANY,
      resolvePlatform(MANATOS_COMPANY, 'panoptes'),
    );

    expect(none.subsystems.applications).toBeUndefined();
    expect(protoCrm.subsystems.applications?.selected).toBe(true);
    expect(panoptes.subsystems.applications).toBeUndefined();

    expect(protoCrm.entities.sysApplications?.key).toBe('sys-applications');
    expect(panoptes.entities.sysApplications).toBeUndefined();
    expect(none.entities.sysApplications).toBeUndefined();
  });
});
