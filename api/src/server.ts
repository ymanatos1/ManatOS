import { config } from './config.js';

import { JsonFilePersistence } from './storage/json-file-persistence.js';

import { InMemoryDataStore } from './storage/in-memory-data-store.js';

import { SysUserService } from './services/sys-user-service.js';

import {
  ExternalIdentityService,
  SysApplicationService,
  SysLicenseService,
  SysPrincipalService,
  UserPrincipalService,
} from './services/domain-services.js';

import { createApp } from './app.js';
import { createEmailService } from './email/email-service.js';
import { logger } from './logging/logger.js';
import { SecretsEncryptionService } from './security/secrets-encryption-service.js';
import { SysExtAuthProviderService } from './services/sys-ext-auth-provider-service.js';

/**
 * Application composition root.
 *
 * Concrete infrastructure and application services are assembled here.
 *
 * This is the main place that will eventually choose between storage
 * adapters according to configuration.
 */

/**
 * Current persistence implementation:
 *
 * InMemoryDataStore + JSON file persistence.
 */
const store = new InMemoryDataStore(new JsonFilePersistence(config.DATA_FILE));

try {
  await store.initialize();
  logger.info('Primary datastore initialized', { dataFile: config.DATA_FILE });
} catch (error) {
  /**
   * File logging is deliberately independent from the business datastore, so
   * persistence/connection failures can still be diagnosed even when the
   * primary database itself is unavailable.
   */
  logger.fatal('Primary datastore initialization failed', {
    dataFile: config.DATA_FILE,
    error,
  });
  throw error;
}

/**
 * Construct domain/application services.
 */
const users = new SysUserService(store);

const email = createEmailService();

const secretsEncryption = new SecretsEncryptionService(
  config.SECRETS_ENCRYPTION_ACTIVE_KEY_ID,
  config.SECRETS_ENCRYPTION_KEY,
);

const services = {
  users,

  email,

  principals: new SysPrincipalService(store),

  applications: new SysApplicationService(store),

  licenses: new SysLicenseService(store),

  extAuthProviders: new SysExtAuthProviderService(store, secretsEncryption),

  externalIdentities: new ExternalIdentityService(store, users),

  userPrincipals: new UserPrincipalService(store, users),
};

/**
 * Optionally bootstrap the first administrator from environment
 * configuration.
 *
 * Nothing is created when the user store already contains data.
 */
await users.bootstrapAdmin(
  config.BOOTSTRAP_ADMIN_NAME,
  config.BOOTSTRAP_ADMIN_EMAIL,
  config.BOOTSTRAP_ADMIN_PASSWORD,
);

/**
 * Build and start the Express HTTP application.
 */
try {
  await email.verifyConnection();
} catch (error) {
  logger.error('SMTP verification failed during startup', { error });
  logger.warn('API will continue running, but email delivery may fail');
}

createApp(store, services).listen(
  config.API_PORT,

  () => {
    logger.info('ManatOS API listening', { url: `http://localhost:${config.API_PORT}` });

    logger.info('Swagger available', { url: `http://localhost:${config.API_PORT}/api-docs/` });
  },
);
