import { describe, expect, it } from 'vitest';

import { SysBOPrincipalType, SysBOUserRole } from '@manatos/shared';
import { SYSTEM_AUDIT_ACTOR } from '../../src/audit/audit-service.js';
import { createTestApi } from '../support/test-helpers.js';

describe('Person Principal -> SysUser identity relationship', () => {
  it('persists the authoritative optional one-to-one assignment on Principal.userId', async () => {
    const context = await createTestApi();
    const user = await context.services.users.createUser(
      {
        name: 'UserA',
        email: 'user-a@example.test',
        role: SysBOUserRole.User,
        emailVerified: true,
      },
      SYSTEM_AUDIT_ACTOR,
    );
    const principal = await context.services.principals.create(
      {
        name: 'Person A',
        principalType: SysBOPrincipalType.Person,
        parentId: null,
        userId: user.id,
        enabled: true,
      },
      SYSTEM_AUDIT_ACTOR,
    );

    expect(principal.userId).toBe(user.id);
    expect((await context.services.users.get(user.id))?.principalId).toBe(principal.id);
  });

  it('enforces one-to-one uniqueness from the Principal owner', async () => {
    const context = await createTestApi();
    const user = await context.services.users.createUser(
      {
        name: 'UserB',
        email: 'user-b@example.test',
        role: SysBOUserRole.User,
        emailVerified: true,
      },
      SYSTEM_AUDIT_ACTOR,
    );
    await context.services.principals.create(
      {
        name: 'Person B1',
        principalType: SysBOPrincipalType.Person,
        parentId: null,
        userId: user.id,
        enabled: true,
      },
      SYSTEM_AUDIT_ACTOR,
    );
    await expect(
      context.services.principals.create(
        {
          name: 'Person B2',
          principalType: SysBOPrincipalType.Person,
          parentId: null,
          userId: user.id,
          enabled: true,
        },
        SYSTEM_AUDIT_ACTOR,
      ),
    ).rejects.toMatchObject({ code: 'PRINCIPAL_USER_ALREADY_LINKED' });
  });

  it('rejects a User identity link on a non-Person Principal', async () => {
    const context = await createTestApi();
    const user = await context.services.users.createUser(
      {
        name: 'UserC',
        email: 'user-c@example.test',
        role: SysBOUserRole.User,
        emailVerified: true,
      },
      SYSTEM_AUDIT_ACTOR,
    );
    await expect(
      context.services.principals.create(
        {
          name: 'Company A',
          principalType: SysBOPrincipalType.Company,
          parentId: null,
          userId: user.id,
          enabled: true,
        },
        SYSTEM_AUDIT_ACTOR,
      ),
    ).rejects.toMatchObject({ code: 'PRINCIPAL_USER_REQUIRES_PERSON' });
  });

  it('projects and writes User.principalId through the authoritative inverse Principal.userId endpoint', async () => {
    const context = await createTestApi();
    const user = await context.services.users.createUser(
      {
        name: 'UserD',
        email: 'user-d@example.test',
        role: SysBOUserRole.User,
        emailVerified: true,
      },
      SYSTEM_AUDIT_ACTOR,
    );
    const first = await context.services.principals.create(
      {
        name: 'Person D1',
        principalType: SysBOPrincipalType.Person,
        parentId: null,
        userId: null,
        enabled: true,
      },
      SYSTEM_AUDIT_ACTOR,
    );
    const second = await context.services.principals.create(
      {
        name: 'Person D2',
        principalType: SysBOPrincipalType.Person,
        parentId: null,
        userId: null,
        enabled: true,
      },
      SYSTEM_AUDIT_ACTOR,
    );

    await context.services.users.update(user.id, { principalId: first.id }, SYSTEM_AUDIT_ACTOR);
    expect((await context.services.users.get(user.id))?.principalId).toBe(first.id);
    expect((await context.services.principals.get(first.id))?.userId).toBe(user.id);

    await context.services.users.update(user.id, { principalId: second.id }, SYSTEM_AUDIT_ACTOR);
    expect((await context.services.principals.get(first.id))?.userId).toBeNull();
    expect((await context.services.principals.get(second.id))?.userId).toBe(user.id);
    expect((await context.services.users.get(user.id))?.principalId).toBe(second.id);
  });
});
