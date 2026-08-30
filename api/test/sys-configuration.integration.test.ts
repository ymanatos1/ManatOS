import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { bearer, createTestApi, loginAdmin, seedAdmin } from './test-helpers.js';

describe('SysBOConfiguration API', () => {
  it('is Admin-only, updates typed values and never returns encrypted secret material', async () => {
    const { app, services } = await createTestApi();
    await seedAdmin(services.users);
    const token = await loginAdmin(app);
    const list = await request(app).get('/api/v1/SysConfigurations').set('Authorization', bearer(token));
    expect(list.status).toBe(200);
    const items = list.body.data.items as Array<Record<string, unknown>>;
    const smtpPassword = items.find((item) => item.name === 'SMTP_PASSWORD');
    expect(smtpPassword).toBeTruthy();
    expect(smtpPassword).not.toHaveProperty('valueEncrypted');
    expect(smtpPassword?.value).toBeNull();
    const viewModes = items.filter((item) => String(item.name).endsWith('_VIEW_MODE'));
    // SysUsers and SysPrincipals are locked to metadata-driven mode while #16
    // closes, so only the three entities still under comparison retain settings.
    expect(viewModes).toHaveLength(3);
    expect(viewModes.every((item) => item.value === 'CurrentEJS')).toBe(true);
    expect(items.some((item) => item.name === 'UI_SYSBO_USERS_VIEW_MODE')).toBe(false);
    expect(items.some((item) => item.name === 'UI_SYSBO_PRINCIPALS_VIEW_MODE')).toBe(false);

    const applicationsViewMode = items.find((item) => item.name === 'UI_SYSBO_APPLICATIONS_VIEW_MODE');
    const viewModeUpdate = await request(app)
      .patch(`/api/v1/SysConfigurations/${applicationsViewMode?.id}/value`)
      .set('Authorization', bearer(token))
      .send({ value:'MetadataDriven' });
    expect(viewModeUpdate.status).toBe(200);
    expect(await services.configurations.resolve('UI_SYSBO_APPLICATIONS_VIEW_MODE')).toBe('MetadataDriven');

    const pageSize = items.find((item) => item.name === 'API_DEFAULT_PAGE_SIZE');
    const update = await request(app).patch(`/api/v1/SysConfigurations/${pageSize?.id}/value`).set('Authorization', bearer(token)).send({ value:'25' });
    expect(update.status).toBe(200);
    expect(await services.configurations.resolve('API_DEFAULT_PAGE_SIZE')).toBe('25');
  });
});
