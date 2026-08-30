import { describe, expect, it } from 'vitest';

import request from 'supertest';

import { SysBOUserRole } from '@manatos/shared';

import { SYSTEM_AUDIT_ACTOR } from '../src/audit/audit-service.js';

import {
  bearer,
  createTestApi,
  expectFailure,
  expectQuerySuccess,
  seedAdmin,
} from './test-helpers.js';

/**
 * Protects the distinction between entity-level access and row visibility.
 *
 * A Guest may open the SysUsers area because their own account is manageable,
 * but collection queries must not disclose other SysUser records. The current
 * in-memory adapter applies AuthorizationService.filterListItems() before
 * client filtering and pagination; future RDBMS adapters should push the same
 * policy into their database query predicate.
 */
describe('API integration - SysBOUser row visibility', () => {
  it('returns only the authenticated Guest SysBOUser and blocks direct reads of another user', async () => {
    const context = await createTestApi();
    await seedAdmin(context.services.users);

    const guest = await context.services.users.createUser(
      {
        name: 'ScopedGuest',
        email: 'scoped-guest@example.test',
        password: 'ScopedGuest!123',
        role: SysBOUserRole.Guest,
        emailVerified: true,
        enabled: true,
      },
      SYSTEM_AUDIT_ACTOR,
    );

    const other = await context.services.users.createUser(
      {
        name: 'OtherGuest',
        email: 'other-guest@example.test',
        password: 'OtherGuest!123',
        role: SysBOUserRole.Guest,
        emailVerified: true,
        enabled: true,
      },
      SYSTEM_AUDIT_ACTOR,
    );

    const login = await request(context.app)
      .post('/api/v1/auth/login')
      .send({ identity: guest.name, password: 'ScopedGuest!123' });

    expect(login.status).toBe(200);
    const token = login.body.data.accessToken as string;

    const list = await request(context.app)
      .get('/api/v1/SysUsers?page=1&pageSize=100')
      .set('Authorization', bearer(token));

    expect(list.status).toBe(200);
    expectQuerySuccess(list.body);
    expect(list.body.data.items).toHaveLength(1);
    expect(list.body.data.items[0].id).toBe(guest.id);
    expect(list.body.data.paging.total).toBe(1);
    expect(list.body.data.paging.totalPages).toBe(1);

    const directOther = await request(context.app)
      .get(`/api/v1/SysUsers/${other.id}`)
      .set('Authorization', bearer(token));

    expect(directOther.status).toBe(403);
    expectFailure(directOther.body);
  });
});
