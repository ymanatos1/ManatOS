import { describe, expect, it } from 'vitest';

import { SysBOPrincipalType, SysBOUserRole } from '@manatos/shared';
import { SYSTEM_AUDIT_ACTOR } from '../../src/audit/audit-service.js';
import { createTestApi } from '../support/test-helpers.js';

describe('SysUser <-> Person Principal identity relationship', () => {
  it('supports authoritative one-to-one assignment from the User side', async () => {
    const context = await createTestApi();
    const principal = await context.services.principals.create(
      { name: 'Person A', principalType: SysBOPrincipalType.Person, parentId: null, enabled: true },
      SYSTEM_AUDIT_ACTOR,
    );
    const user = await context.services.users.createUser(
      {
        name: 'UserA',
        email: 'user-a@example.test',
        role: SysBOUserRole.User,
        emailVerified: true,
      },
      SYSTEM_AUDIT_ACTOR,
    );

    const linked = await context.services.users.update(
      user.id,
      { principalId: principal.id },
      SYSTEM_AUDIT_ACTOR,
    );
    expect(linked.principalId).toBe(principal.id);

    const other = await context.services.users.createUser(
      {
        name: 'UserB',
        email: 'user-b@example.test',
        role: SysBOUserRole.User,
        emailVerified: true,
      },
      SYSTEM_AUDIT_ACTOR,
    );
    await expect(
      context.services.users.update(other.id, { principalId: principal.id }, SYSTEM_AUDIT_ACTOR),
    ).rejects.toMatchObject({ code: 'USER_PRINCIPAL_ALREADY_LINKED' });
  });

  it('writes the inverse Principal-side endpoint through SysUser.principalId', async () => {
    const context = await createTestApi();
    const principal = await context.services.principals.create(
      { name: 'Person B', principalType: SysBOPrincipalType.Person, parentId: null, enabled: true },
      SYSTEM_AUDIT_ACTOR,
    );
    const user = await context.services.users.createUser(
      {
        name: 'UserC',
        email: 'user-c@example.test',
        role: SysBOUserRole.User,
        emailVerified: true,
      },
      SYSTEM_AUDIT_ACTOR,
    );

    await context.services.principals.update(
      principal.id,
      { userId: user.id } as never,
      SYSTEM_AUDIT_ACTOR,
    );
    expect((await context.services.users.get(user.id))?.principalId).toBe(principal.id);
  });

  it('rejects non-Person identity targets', async () => {
    const context = await createTestApi();
    const company = await context.services.principals.create(
      {
        name: 'Company A',
        principalType: SysBOPrincipalType.Company,
        parentId: null,
        enabled: true,
      },
      SYSTEM_AUDIT_ACTOR,
    );
    const user = await context.services.users.createUser(
      {
        name: 'UserD',
        email: 'user-d@example.test',
        role: SysBOUserRole.User,
        emailVerified: true,
      },
      SYSTEM_AUDIT_ACTOR,
    );
    await expect(
      context.services.users.update(user.id, { principalId: company.id }, SYSTEM_AUDIT_ACTOR),
    ).rejects.toMatchObject({ code: 'USER_PRINCIPAL_MUST_BE_PERSON' });
  });
});
