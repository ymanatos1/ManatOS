import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { SysBOUserRole } from '@manatos/shared';
import { SYSTEM_AUDIT_ACTOR } from '../../src/audit/audit-service.js';
import { bearer, createTestApi, loginAdmin, seedAdmin } from '../support/test-helpers.js';

describe('SysBOConfiguration API', () => {
  it('allows Superuser inspection, keeps mutation Admin-only, and never returns encrypted secret material', async () => {
    const { app, services } = await createTestApi();
    await seedAdmin(services.users);
    const token = await loginAdmin(app);
    const list = await request(app)
      .get('/api/v1/SysConfigurations')
      .set('Authorization', bearer(token));
    expect(list.status).toBe(200);
    const items = list.body.data.items as Array<Record<string, unknown>>;
    const smtpPassword = items.find((item) => item.name === 'SMTP_PASSWORD');
    expect(smtpPassword).toBeTruthy();
    expect(smtpPassword).not.toHaveProperty('valueEncrypted');
    expect(smtpPassword?.value).toBeNull();
    const viewModes = items.filter((item) => String(item.name).endsWith('_VIEW_MODE'));
    // #16 is closed: no temporary SysBO UI-engine selector remains exposed.
    expect(viewModes).toHaveLength(0);
    expect(items.some((item) => item.name === 'UI_SYSBO_USERS_VIEW_MODE')).toBe(false);
    expect(items.some((item) => item.name === 'UI_SYSBO_PRINCIPALS_VIEW_MODE')).toBe(false);
    expect(items.some((item) => item.name === 'UI_SYSBO_APPLICATIONS_VIEW_MODE')).toBe(false);
    expect(items.some((item) => item.name === 'UI_SYSBO_LICENSES_VIEW_MODE')).toBe(false);
    expect(items.some((item) => item.name === 'UI_SYSBO_EXT_AUTH_PROVIDERS_VIEW_MODE')).toBe(false);

    const superuser = await services.users.createUser(
      {
        name: 'ConfigInspector',
        email: 'config-inspector@example.test',
        password: 'ConfigInspector!123',
        role: SysBOUserRole.Superuser,
        emailVerified: true,
        enabled: true,
      },
      SYSTEM_AUDIT_ACTOR,
    );
    const superLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ identity: superuser.name, password: 'ConfigInspector!123' });
    expect(superLogin.status).toBe(200);
    const superToken = String(superLogin.body?.data?.accessToken ?? '');
    const inspected = await request(app)
      .get('/api/v1/SysConfigurations')
      .set('Authorization', bearer(superToken));
    expect(inspected.status).toBe(200);

    const pageSize = items.find((item) => item.name === 'API_DEFAULT_PAGE_SIZE');
    const forbiddenUpdate = await request(app)
      .patch(`/api/v1/SysConfigurations/${pageSize?.id}/value`)
      .set('Authorization', bearer(superToken))
      .send({ value: '99' });
    expect(forbiddenUpdate.status).toBe(403);

    const update = await request(app)
      .patch(`/api/v1/SysConfigurations/${pageSize?.id}/value`)
      .set('Authorization', bearer(token))
      .send({ value: '25' });
    expect(update.status).toBe(200);
    expect(await services.configurations.resolve('API_DEFAULT_PAGE_SIZE')).toBe('25');
  });
});
