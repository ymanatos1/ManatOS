import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { config } from '../src/config.js';
import { bearer, createTestApi, loginAdmin, seedAdmin } from './test-helpers.js';

async function saveVerified(
  context: Awaited<ReturnType<typeof createTestApi>>,
  token: string,
  body: Record<string, unknown>,
) {
  return request(context.app)
    .post('/api/v1/internal/external-auth-providers/verified-credentials')
    .set('Authorization', bearer(token))
    .set('x-internal-api-key', config.INTERNAL_API_KEY)
    .send(body);
}

async function saveStored(
  context: Awaited<ReturnType<typeof createTestApi>>,
  token: string,
  body: Record<string, unknown>,
) {
  return request(context.app)
    .post('/api/v1/internal/external-auth-providers/stored-credentials')
    .set('Authorization', bearer(token))
    .set('x-internal-api-key', config.INTERNAL_API_KEY)
    .send(body);
}

describe('SysExtAuthProvider API', () => {
  it('stores an unverified credential pair securely and keeps it unavailable to runtime until verified', async () => {
    const context = await createTestApi();
    await seedAdmin(context.services.users);
    const token = await loginAdmin(context.app);

    const created = await saveStored(context, token, {
      provider: 'facebook',
      enabled: true,
      clientId: 'facebook-client',
      clientSecret: 'facebook-secret',
    });

    expect(created.status).toBe(200);
    const id = created.body.data.id as string;

    let read = await request(context.app)
      .get(`/api/v1/SysExtAuthProviders/${id}`)
      .set('Authorization', bearer(token));
    expect(read.body.data).toMatchObject({
      provider: 'facebook',
      enabled: true,
      clientId: 'facebook-client',
      hasClientSecret: true,
      credentialsVerified: false,
      credentialsVerifiedAt: null,
    });
    expect(JSON.stringify(read.body)).not.toContain('facebook-secret');

    let runtime = await request(context.app)
      .get('/api/v1/internal/external-auth-providers/runtime')
      .set('x-internal-api-key', config.INTERNAL_API_KEY);
    expect(runtime.body.data.items).toHaveLength(0);

    const material = await request(context.app)
      .get(`/api/v1/internal/external-auth-providers/${id}/credentials-for-test`)
      .set('Authorization', bearer(token))
      .set('x-internal-api-key', config.INTERNAL_API_KEY);
    expect(material.body.data).toMatchObject({
      id,
      provider: 'facebook',
      clientId: 'facebook-client',
      clientSecret: 'facebook-secret',
    });

    const marked = await request(context.app)
      .post(`/api/v1/internal/external-auth-providers/${id}/credentials-verified`)
      .set('Authorization', bearer(token))
      .set('x-internal-api-key', config.INTERNAL_API_KEY)
      .send({
        clientId: material.body.data.clientId,
        secretUpdatedAt: material.body.data.secretUpdatedAt,
      });
    expect(marked.status).toBe(200);

    read = await request(context.app)
      .get(`/api/v1/SysExtAuthProviders/${id}`)
      .set('Authorization', bearer(token));
    expect(read.body.data.credentialsVerified).toBe(true);
    expect(read.body.data.credentialsVerifiedAt).toBeTruthy();

    runtime = await request(context.app)
      .get('/api/v1/internal/external-auth-providers/runtime')
      .set('x-internal-api-key', config.INTERNAL_API_KEY);
    expect(runtime.body.data.items).toHaveLength(1);
  });

  it('keeps credential writes on trusted internal commands and never returns secret material through normal CRUD', async () => {
    const context = await createTestApi();
    await seedAdmin(context.services.users);
    const token = await loginAdmin(context.app);

    const direct = await request(context.app)
      .post('/api/v1/SysExtAuthProviders')
      .set('Authorization', bearer(token))
      .send({ provider: 'microsoft', enabled: true, clientId: 'client', clientSecret: 'secret' });

    expect(direct.status).toBe(400);

    const created = await saveVerified(context, token, {
      provider: 'microsoft',
      enabled: true,
      clientId: 'microsoft-client',
      clientSecret: 'plain-secret',
      callbackPath: '/auth/microsoft/callback',
      tenant: 'common',
    });

    expect(created.status).toBe(200);
    const id = created.body.data.id as string;

    const read = await request(context.app)
      .get(`/api/v1/SysExtAuthProviders/${id}`)
      .set('Authorization', bearer(token));

    expect(read.body.data).toMatchObject({
      provider: 'microsoft',
      clientId: 'microsoft-client',
      hasClientSecret: true,
      credentialsVerified: true,
    });
    expect(read.body.data.credentialsVerifiedAt).toBeTruthy();
    expect(JSON.stringify(read.body)).not.toContain('plain-secret');
    expect(JSON.stringify(read.body)).not.toContain('clientSecretEncrypted');

    const stored = (await context.services.extAuthProviders.list({ page: 1, pageSize: 10, direction: 'asc', filters: {} })).items[0];
    expect(stored?.clientSecretEncrypted).toBeTruthy();
    expect(stored?.clientSecretEncrypted).not.toContain('plain-secret');
  });

  it('preserves the exact stored credential pair and verification state across unrelated edits', async () => {
    const context = await createTestApi();
    await seedAdmin(context.services.users);
    const token = await loginAdmin(context.app);

    const created = await saveVerified(context, token, {
      provider: 'google',
      enabled: true,
      clientId: 'stable-google-client',
      clientSecret: 'stable-google-secret',
    });
    const id = created.body.data.id as string;
    const before = (await context.services.extAuthProviders.list({ page: 1, pageSize: 10, direction: 'asc', filters: {} })).items[0]!;

    const updated = await request(context.app)
      .patch(`/api/v1/SysExtAuthProviders/${id}`)
      .set('Authorization', bearer(token))
      .send({ enabled: false });

    expect(updated.status).toBe(200);
    const after = (await context.services.extAuthProviders.list({ page: 1, pageSize: 10, direction: 'asc', filters: {} })).items[0]!;
    expect(after.clientId).toBe(before.clientId);
    expect(after.clientSecretEncrypted).toBe(before.clientSecretEncrypted);
    expect(after.credentialsVerified).toBe(true);
    expect(after.credentialsVerifiedAt).toBe(before.credentialsVerifiedAt);

    const rejectedCredentialChange = await request(context.app)
      .patch(`/api/v1/SysExtAuthProviders/${id}`)
      .set('Authorization', bearer(token))
      .send({ clientId: 'changed-directly' });
    expect(rejectedCredentialChange.status).toBe(400);
  });

  it('requires Client ID and Client secret to be replaced together through a trusted credential command', async () => {
    const context = await createTestApi();
    await seedAdmin(context.services.users);
    const token = await loginAdmin(context.app);

    const created = await saveVerified(context, token, {
      provider: 'facebook', enabled: true, clientId: 'old-id', clientSecret: 'old-secret',
    });
    const id = created.body.data.id as string;

    const missingSecret = await saveVerified(context, token, {
      id, provider: 'facebook', enabled: true, clientId: 'new-id', clientSecret: '',
    });
    expect(missingSecret.status).toBe(400);

    const replaced = await saveVerified(context, token, {
      id, provider: 'facebook', enabled: true, clientId: 'new-id', clientSecret: 'new-secret',
    });
    expect(replaced.status).toBe(200);

    const read = await request(context.app)
      .get(`/api/v1/SysExtAuthProviders/${id}`)
      .set('Authorization', bearer(token));
    expect(read.body.data).toMatchObject({ clientId: 'new-id', credentialsVerified: true });
  });

  it('removes both credentials and disables the provider atomically', async () => {
    const context = await createTestApi();
    await seedAdmin(context.services.users);
    const token = await loginAdmin(context.app);
    const created = await saveVerified(context, token, {
      provider: 'github', enabled: true, clientId: 'github-id', clientSecret: 'github-secret',
    });
    const id = created.body.data.id as string;

    const removed = await request(context.app)
      .delete(`/api/v1/internal/external-auth-providers/${id}/credentials`)
      .set('Authorization', bearer(token))
      .set('x-internal-api-key', config.INTERNAL_API_KEY);
    expect(removed.status).toBe(200);

    const read = await request(context.app)
      .get(`/api/v1/SysExtAuthProviders/${id}`)
      .set('Authorization', bearer(token));
    expect(read.body.data).toMatchObject({ enabled: false, clientId: '', hasClientSecret: false, credentialsVerified: false });
    expect(read.body.data.credentialsVerified).toBe(false);
    expect(read.body.data.credentialsVerifiedAt).toBeNull();
  });

  it('offers a provider publicly/runtime only after successful verification', async () => {
    const context = await createTestApi();
    await seedAdmin(context.services.users);
    const token = await loginAdmin(context.app);

    const draft = await request(context.app)
      .post('/api/v1/SysExtAuthProviders')
      .set('Authorization', bearer(token))
      .send({ provider: 'microsoft', enabled: false });
    expect(draft.status).toBe(201);

    let publicState = await request(context.app).get('/api/v1/public/external-auth-providers');
    expect(publicState.body.data.providers.find((x: { provider: string }) => x.provider === 'microsoft')).toMatchObject({ configured: false });

    await saveVerified(context, token, {
      id: draft.body.data.id,
      provider: 'microsoft',
      enabled: true,
      clientId: 'verified-id',
      clientSecret: 'verified-secret',
      tenant: 'common',
    });

    publicState = await request(context.app).get('/api/v1/public/external-auth-providers');
    expect(publicState.body.data.providers.find((x: { provider: string }) => x.provider === 'microsoft')).toMatchObject({ enabled: true, configured: true });
    expect(JSON.stringify(publicState.body)).not.toContain('verified-id');
    expect(JSON.stringify(publicState.body)).not.toContain('verified-secret');

    const runtime = await request(context.app)
      .get('/api/v1/internal/external-auth-providers/runtime')
      .set('x-internal-api-key', config.INTERNAL_API_KEY);
    expect(runtime.body.data.items).toHaveLength(1);
    expect(runtime.body.data.items[0]).toMatchObject({ provider: 'microsoft', clientId: 'verified-id', clientSecret: 'verified-secret' });
  });

  it('keeps callback paths provider-defined and rejects direct overrides', async () => {
    const context = await createTestApi();
    await seedAdmin(context.services.users);
    const token = await loginAdmin(context.app);

    const rejected = await request(context.app)
      .post('/api/v1/SysExtAuthProviders')
      .set('Authorization', bearer(token))
      .send({ provider: 'github', enabled: false, callbackPath: '/auth/custom/callback' });
    expect(rejected.status).toBe(400);
  });
});
