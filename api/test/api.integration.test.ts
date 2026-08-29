import {
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';

import request from 'supertest';

import { config } from '../src/config.js';

import {
  createTestApi,
  bearer,
  expectCommandSuccess,
  expectFailure,
  expectQuerySuccess,
  loginAdmin,
  seedAdmin,
} from './test-helpers.js';

describe('API integration - server and generic SysBO behavior', () => {

  it('public UI bootstrap reports server/API versions without authentication', async () => {
    const context = await createTestApi();

    const response = await request(context.app).get('/api/v1/public/ui-bootstrap');

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      server: { alive: true, implementationVersion: '0.1.0' },
      api: { version: 'v1' },
      ui: { donationsShow: false },
    });
    expect(response.headers['cache-control']).toBe('no-store');
  });


  let context: Awaited<
    ReturnType<typeof createTestApi>
  >;

  beforeEach(async () => {
    context = await createTestApi();

    await seedAdmin(
      context.services.users,
    );
  });

  describe('server endpoints', () => {
    it('returns public liveness and readiness using query envelopes', async () => {
      const health = await request(
        context.app,
      ).get('/health');

      expect(health.status).toBe(200);
      expectQuerySuccess(health.body);
      expect(health.body.data.status).toBe('ok');

      const ready = await request(
        context.app,
      ).get('/ready');

      expect(ready.status).toBe(200);
      expectQuerySuccess(ready.body);
      expect(ready.body.data.status).toBe('ok');
      expect(ready.body.data.storage).toBeDefined();
    });

    it('requires an authenticated Admin to flush the datastore', async () => {
      const anonymous = await request(
        context.app,
      ).post('/flush-db');

      expect(anonymous.status).toBe(401);
      expectFailure(anonymous.body);

      const token = await loginAdmin(
        context.app,
      );

      const response = await request(
        context.app,
      )
        .post('/flush-db')
        .set(
          'Authorization',
          bearer(token),
        );

      expect(response.status).toBe(200);
      expectCommandSuccess(response.body);

      expect(response.body.message).toBe(
        'Database flushed successfully.',
      );

      expect(response.body.data).toMatchObject({
        provider: 'InMemory',
        persistence: 'JSON',
        flushed: true,
      });
    });
  });

  describe('SysBOUser administration commands', () => {
    it('allows Admin email verification only when enabled by configuration', async () => {
      const token = await loginAdmin(context.app);

      const registration = await request(context.app)
        .post('/api/v1/auth/register')
        .send({
          name: 'NeedsVerification',
          email: 'needs-verification@example.test',
          password: 'VerifyMe!123',
        });

      expect(registration.status).toBe(201);

      const userId = registration.body.data.id as string;

      const originalSetting = config.ADMIN_EMAIL_VERIFICATION_ENABLED;

      try {
        /**
         * Disabled configuration must block the explicit Admin command.
         */
        config.ADMIN_EMAIL_VERIFICATION_ENABLED = false;

        const disabled = await request(context.app)
          .post(`/api/v1/SysUsers/${userId}/verify-email`)
          .set('Authorization', bearer(token));

        expect(disabled.status).toBe(403);
        expectFailure(disabled.body);
        expect(disabled.body.error.code).toBe('ADMIN_EMAIL_VERIFICATION_DISABLED');

        /**
         * Enabling the feature allows the Admin command.
         */
        config.ADMIN_EMAIL_VERIFICATION_ENABLED = true;

        const verified = await request(context.app)
          .post(`/api/v1/SysUsers/${userId}/verify-email`)
          .set('Authorization', bearer(token));

        expect(verified.status).toBe(200);
        expectCommandSuccess(verified.body);
        expect(verified.body.data.emailVerified).toBe(true);
        expect(verified.body.data.updatedBy).toBe('Admin');
      } finally {
        config.ADMIN_EMAIL_VERIFICATION_ENABLED = originalSetting;
      }
    });
  });

  describe('generic SysBOApplication REST contract', () => {
    it('rejects anonymous access with the global failure envelope', async () => {
      const response = await request(
        context.app,
      ).get('/api/v1/SysApplications');

      expect(response.status).toBe(401);
      expectFailure(response.body);

      expect(response.body.error.code).toBe(
        'AUTHENTICATION_REQUIRED',
      );
    });


    it('allows a Guest to read SysBOs but blocks generic creation', async () => {
      const registration = await request(
        context.app,
      )
        .post('/api/v1/auth/register')
        .send({
          name: 'ReadOnlyGuest',
          email: 'readonly@example.test',
          password: 'GuestPass!123',
        });

      expect(registration.status).toBe(201);

      const guestId =
        registration.body.data.id as string;

      const {
        SYSTEM_AUDIT_ACTOR,
      } = await import(
        '../src/audit/audit-service.js'
      );

      await context.services.users.setEmailVerified(
        guestId,
        SYSTEM_AUDIT_ACTOR,
      );

      const signedIn = await request(
        context.app,
      )
        .post('/api/v1/auth/login')
        .send({
          identity: 'ReadOnlyGuest',
          password: 'GuestPass!123',
        });

      expect(signedIn.status).toBe(200);

      const guestToken =
        signedIn.body.data.accessToken as string;

      const read = await request(
        context.app,
      )
        .get('/api/v1/SysApplications')
        .set(
          'Authorization',
          bearer(guestToken),
        );

      expect(read.status).toBe(200);
      expectQuerySuccess(read.body);

      const create = await request(
        context.app,
      )
        .post('/api/v1/SysApplications')
        .set(
          'Authorization',
          bearer(guestToken),
        )
        .send({
          name: 'Forbidden Guest App',
          appName: 'forbidden-guest-app',
          fullName: 'Forbidden Guest Application',
          enabled: true,
        });

      expect(create.status).toBe(403);
      expectFailure(create.body);
    });

    it('supports metadata, CRUD, audit fields and the global response envelopes', async () => {
      const token = await loginAdmin(
        context.app,
      );

      const metadata = await request(
        context.app,
      )
        .get('/api/v1/SysApplications/$metadata')
        .set(
          'Authorization',
          bearer(token),
        );

      expect(metadata.status).toBe(200);
      expectQuerySuccess(metadata.body);

      expect(metadata.body.data.metadata).toMatchObject({
        key: 'sys-applications',
        name: 'Application',
      });

      const metadataUI = await request(context.app)
        .get('/api/v1/SysApplications/$metadata-ui')
        .set('Authorization', bearer(token));

      expect(metadataUI.status).toBe(200);
      expectQuerySuccess(metadataUI.body);
      expect(metadataUI.body.data.metadataUI).toMatchObject({
        key: 'sys-applications',
        list: {
          visibleFields: ['name', 'appName', 'fullName', 'version', 'enabled'],
          filterFields: ['name', 'appName', 'fullName'],
        },
      });

      const combinedMetadata = await request(context.app)
        .get('/api/v1/SysApplications?includeMetadataUI=true')
        .set('Authorization', bearer(token));

      expect(combinedMetadata.status).toBe(200);
      expect(combinedMetadata.body.data.metadata).toMatchObject({ key: 'sys-applications' });
      expect(combinedMetadata.body.data.metadataUI).toMatchObject({ key: 'sys-applications' });

      const create = await request(
        context.app,
      )
        .post('/api/v1/SysApplications')
        .set(
          'Authorization',
          bearer(token),
        )
        .send({
          name: 'Accounts',
          appName: 'accounts',
          fullName: 'Accounts Application',
          enabled: true,
        });

      expect(create.status).toBe(201);
      expectCommandSuccess(create.body);

      expect(create.body.message).toContain(
        'Accounts',
      );

      expect(create.body.data).toMatchObject({
        name: 'Accounts',
        appName: 'accounts',
        createdBy: 'Admin',
        updatedBy: 'Admin',
      });

      const applicationId =
        create.body.data.id as string;

      const read = await request(
        context.app,
      )
        .get(
          `/api/v1/SysApplications/${applicationId}`,
        )
        .set(
          'Authorization',
          bearer(token),
        );

      expect(read.status).toBe(200);
      expectQuerySuccess(read.body);

      expect(read.body.data.id).toBe(
        applicationId,
      );

      const update = await request(
        context.app,
      )
        .patch(
          `/api/v1/SysApplications/${applicationId}`,
        )
        .set(
          'Authorization',
          bearer(token),
        )
        .send({
          description:
            'Updated by integration test',

          /**
           * Runtime audit-field tampering attempt.
           * The repository must discard these caller-supplied values.
           */
          createdBy:
            'Attacker',

          updatedBy:
            'Attacker',
        });

      expect(update.status).toBe(200);
      expectCommandSuccess(update.body);

      expect(update.body.data.description).toBe(
        'Updated by integration test',
      );

      expect(update.body.data.createdBy).toBe(
        'Admin',
      );

      expect(update.body.data.updatedBy).toBe(
        'Admin',
      );

      const remove = await request(
        context.app,
      )
        .delete(
          `/api/v1/SysApplications/${applicationId}`,
        )
        .set(
          'Authorization',
          bearer(token),
        );

      expect(remove.status).toBe(200);
      expectCommandSuccess(remove.body);

      expect(remove.body.data.id).toBe(
        applicationId,
      );

      const missing = await request(
        context.app,
      )
        .get(
          `/api/v1/SysApplications/${applicationId}`,
        )
        .set(
          'Authorization',
          bearer(token),
        );

      expect(missing.status).toBe(404);
      expectFailure(missing.body);
    });

    it('returns items, paging and optional metadata for filtered/paged lists', async () => {
      const token = await loginAdmin(
        context.app,
      );

      for (
        const [name, appName]
        of [
          ['Accounts', 'accounts'],
          ['Billing', 'billing'],
          ['Accounts Reports', 'accounts-reports'],
        ] as const
      ) {
        const response = await request(
          context.app,
        )
          .post('/api/v1/SysApplications')
          .set(
            'Authorization',
            bearer(token),
          )
          .send({
            name,
            appName,
            fullName: `${name} Application`,
            enabled: true,
          });

        expect(response.status).toBe(201);
      }

      const response = await request(
        context.app,
      )
        .get('/api/v1/SysApplications')
        .query({
          page: 1,
          pageSize: 1,

          sort: 'name',
          direction: 'desc',

          'filter.name':
            'accounts',

          includeMetadata:
            'true',
        })
        .set(
          'Authorization',
          bearer(token),
        );

      expect(response.status).toBe(200);
      expectQuerySuccess(response.body);

      expect(response.body.data.items).toHaveLength(1);

      expect(response.body.data.items[0].name).toBe(
        'Accounts Reports',
      );

      expect(response.body.data.paging).toMatchObject({
        total: 2,
        page: 1,
        pageSize: 1,
        totalPages: 2,
      });

      expect(response.body.data.metadata.key).toBe(
        'sys-applications',
      );
    });
  });

  describe('OpenAPI and fallback contract', () => {
    it('exposes the current server/auth/SysBO paths in OpenAPI', async () => {
      const response = await request(
        context.app,
      ).get('/api/openapi.json');

      expect(response.status).toBe(200);

      expect(response.body.paths).toHaveProperty(
        '/health',
      );

      expect(response.body.paths).toHaveProperty(
        '/ready',
      );

      expect(response.body.paths).toHaveProperty(
        '/flush-db',
      );

      expect(response.body.paths).toHaveProperty(
        '/api/v1/auth/login',
      );

      expect(response.body.paths).toHaveProperty(
        '/api/v1/auth/sessions',
      );

      expect(response.body.paths).toHaveProperty(
        '/api/v1/SysApplications',
      );

      expect(response.body.paths).toHaveProperty(
        '/api/v1/SysUsers/{id}/verify-email',
      );

      expect(response.body.components.securitySchemes).toHaveProperty(
        'internalApiKey',
      );

      expect(response.body.tags.map((tag: { name: string }) => tag.name)).toEqual([
        'Server',
        'Authentication',
        'System Business Objects',
        'System Configuration',
        'Public UI',
        'External Authentication',
        'External Authentication Credentials',
        'Internal External Authentication Workflow',
      ]);

      expect(response.body.paths['/api/v1/SysConfigurations'].get).toMatchObject({
        tags: ['System Configuration'],
        description: expect.stringContaining('Admin only'),
      });

      expect(response.body.paths['/api/v1/SysExtAuthProviders'].get).toMatchObject({
        tags: ['External Authentication'],
        description: expect.stringContaining('Admin only'),
      });

      expect(response.body.paths['/api/v1/SysExtAuthProviders/{id}'].patch).toMatchObject({
        tags: ['External Authentication'],
        description: expect.stringContaining('Admin only'),
      });

      expect(
        response.body.paths['/api/v1/internal/external-auth-providers/stored-credentials'].post,
      ).toMatchObject({
        tags: ['External Authentication Credentials'],
        'x-manatos-access': expect.stringContaining('Admin Bearer'),
      });

      expect(
        response.body.paths['/api/v1/internal/external-auth-providers/{id}/credentials-for-test'].get,
      ).toMatchObject({
        tags: ['Internal External Authentication Workflow'],
        'x-manatos-access': expect.stringContaining('Internal UI/BFF'),
      });
    });

    it('returns the global failure envelope for an unknown API route', async () => {
      const response = await request(
        context.app,
      ).get('/this-route-does-not-exist');

      expect(response.status).toBe(404);
      expectFailure(response.body);

      expect(response.body.error.code).toBe(
        'HTTP_NOT_FOUND',
      );
    });
  });
});
