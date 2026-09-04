import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import request from 'supertest';

import { createApp } from '../src/app.js';
import { JsonFilePersistence } from '../src/storage/json-file-persistence.js';
import { InMemoryDataStore } from '../src/storage/in-memory-data-store.js';

import { SysBOUserService } from '../src/services/sys-user-service.js';

import {
  ExternalIdentityService,
  SysBOApplicationService,
  SysBOLicenseService,
  SysBOPrincipalService,
  UserPrincipalService,
} from '../src/services/index.js';
import { SecretsEncryptionService } from '../src/security/secrets-encryption-service.js';
import { SysBOExtAuthProviderService } from '../src/services/sys-ext-auth-provider-service.js';
import { SysBOConfigurationService } from '../src/services/sys-configuration-service.js';

/**
 * Standard credentials used by integration tests.
 *
 * The password intentionally satisfies the ManatOS password policy:
 * - at least 9 characters;
 * - alphabetic character;
 * - numeric character;
 * - symbol character.
 */
export const TEST_ADMIN = {
  name: 'Admin',
  email: 'admin@test.manatos.local',
  password: 'Admin!1234',
} as const;

/**
 * Build a completely isolated API + in-memory datastore.
 *
 * Every test gets a unique temporary JSON file, so tests never touch:
 *
 *   data/database.json
 *
 * or another test's persisted business data.
 */
export async function createTestApi() {
  const directory = await mkdtemp(join(tmpdir(), 'manatos-api-test-'));

  const databasePath = join(directory, 'database.json');

  const store = new InMemoryDataStore(
    new JsonFilePersistence(databasePath),
  );

  await store.initialize();

  const users = new SysBOUserService(store);

  const encryption = new SecretsEncryptionService('test', Buffer.alloc(32, 7).toString('base64'));
  const configurations = new SysBOConfigurationService(store, encryption);
  await configurations.seedMissing();

  const services = {
    users,
    configurations,

    email: {
      async verifyConnection() {},
      async sendWelcomeAndVerificationEmail() {},
      async sendPasswordResetEmail() {},
      async sendPasswordChangedEmail() {},
    },

    extAuthProviders: new SysBOExtAuthProviderService(
      store,
      encryption,
    ),

    principals: new SysBOPrincipalService(store),

    applications: new SysBOApplicationService(store),

    licenses: new SysBOLicenseService(store),

    externalIdentities: new ExternalIdentityService(store, users),

    userPrincipals: new UserPrincipalService(
      store,
      users,
    ),
  };

  const app = createApp(
    store,
    services,
  );

  return {
    app,
    store,
    services,
    databasePath,
  };
}

/**
 * Create the standard Admin account directly through the service layer.
 *
 * This is test setup, not the behavior under test. The actual login still
 * occurs through the public HTTP endpoint.
 */
export async function seedAdmin(
  users: SysBOUserService,
): Promise<void> {
  await users.bootstrapAdmin(
    TEST_ADMIN.name,
    TEST_ADMIN.email,
    TEST_ADMIN.password,
  );
}

/**
 * Log the standard Admin in through the real API and return its Bearer token.
 */
export async function loginAdmin(
  app: ReturnType<typeof createApp>,
  clientName = 'Vitest Admin',
): Promise<string> {
  const response = await request(app)
    .post('/api/v1/auth/login')
    .set('x-client-name', clientName)
    .send({
      identity: TEST_ADMIN.name,
      password: TEST_ADMIN.password,
    });

  expectStatus(response.status, 200, response.body);

  const token = response.body?.data?.accessToken;

  if (typeof token !== 'string' || token.length === 0) {
    throw new Error(
      `Admin login did not return an access token: ${JSON.stringify(response.body)}`,
    );
  }

  return token;
}

/**
 * Add the standard Bearer Authorization header to a Supertest request.
 */
export function bearer(token: string): string {
  return `Bearer ${token}`;
}

/**
 * Assertions for the global ManatOS response-envelope convention.
 */
export function expectQuerySuccess(
  body: unknown,
): asserts body is {
  success: true;
  data: unknown;
} {
  const response = body as Record<string, unknown>;

  if (response.success !== true) {
    throw new Error(`Expected success=true: ${JSON.stringify(body)}`);
  }

  if (!('data' in response)) {
    throw new Error(`Expected query response data: ${JSON.stringify(body)}`);
  }

  if ('message' in response) {
    throw new Error(
      `Successful GET/query responses must not contain a root message: ${JSON.stringify(body)}`,
    );
  }
}

export function expectCommandSuccess(
  body: unknown,
): asserts body is {
  success: true;
  message: string;
  data: unknown;
} {
  const response = body as Record<string, unknown>;

  if (response.success !== true) {
    throw new Error(`Expected success=true: ${JSON.stringify(body)}`);
  }

  if (
    typeof response.message !== 'string' ||
    response.message.length === 0
  ) {
    throw new Error(
      `Expected non-empty command response message: ${JSON.stringify(body)}`,
    );
  }

  if (!('data' in response)) {
    throw new Error(`Expected command response data: ${JSON.stringify(body)}`);
  }
}

export function expectFailure(
  body: unknown,
): asserts body is {
  success: false;
  errorMessage: string;
  error: {
    code: string;
    message: string;
    retryable: boolean;
  };
} {
  const response = body as {
    success?: unknown;
    errorMessage?: unknown;
    error?: {
      code?: unknown;
      message?: unknown;
      retryable?: unknown;
    };
  };

  if (response.success !== false) {
    throw new Error(`Expected success=false: ${JSON.stringify(body)}`);
  }

  if (
    typeof response.errorMessage !== 'string' ||
    response.errorMessage.length === 0
  ) {
    throw new Error(`Expected root failure errorMessage: ${JSON.stringify(body)}`);
  }

  if (
    !response.error ||
    typeof response.error.code !== 'string' ||
    typeof response.error.message !== 'string'
  ) {
    throw new Error(`Expected structured error object: ${JSON.stringify(body)}`);
  }

  if (response.errorMessage !== response.error.message) {
    throw new Error(
      `Root errorMessage must mirror error.message: ${JSON.stringify(body)}`,
    );
  }
}

/**
 * More readable status assertion for setup helpers where throwing a
 * diagnostic error is more useful than a terse matcher failure.
 */
function expectStatus(
  actual: number,
  expected: number,
  body: unknown,
): void {
  if (actual !== expected) {
    throw new Error(
      `Expected HTTP ${expected}, received ${actual}: ${JSON.stringify(body)}`,
    );
  }
}
