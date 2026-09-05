import { config } from './config.js';

import { JsonFilePersistence } from './storage/json-file-persistence.js';

import { InMemoryDataStore } from './storage/in-memory-data-store.js';

import { SysBOUserService } from './services/sys-user-service.js';

import {
  ExternalIdentityService,
  SysBOApplicationService,
  SysBOLicenseService,
  SysBOPrincipalService,
  UserPrincipalService,
} from './services/index.js';

import { createApp } from './app.js';
import { createEmailService } from './email/email-service.js';
import { logger } from './logging/logger.js';
import { SecretsEncryptionService } from './security/secrets-encryption-service.js';
import { SysBOExtAuthProviderService } from './services/sys-ext-auth-provider-service.js';
import { SysBOConfigurationService } from './services/sys-configuration-service.js';
import { RelationshipIntegrityService } from './services/relationship-integrity-service.js';

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

  // Apply canonical relationship policies to any historical orphan rows left
  // by older builds before metadata-driven referential integrity existed.
  const relationshipRepair = new RelationshipIntegrityService(store).repairOrphanedReferences();
  if (relationshipRepair.repaired > 0) {
    await store.save();
    logger.warn('Repaired orphaned relationship records during startup', {
      repaired: relationshipRepair.repaired,
      unresolved: relationshipRepair.unresolved,
    });
  }
  if (relationshipRepair.unresolved.length > 0) {
    logger.error('Unresolved relationship-integrity problems detected during startup', {
      repaired: relationshipRepair.repaired,
      unresolved: relationshipRepair.unresolved,
    });
  }

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
const users = new SysBOUserService(store);

const secretsEncryption = new SecretsEncryptionService(
  config.SECRETS_ENCRYPTION_ACTIVE_KEY_ID,
  config.SECRETS_ENCRYPTION_KEY,
);

const configurations = new SysBOConfigurationService(store, secretsEncryption);
await configurations.seedMissing();
await configurations.bindRuntime();

const email = createEmailService({
  enabled:
    ((await configurations.resolve('MAIL_ENABLED')) ?? String(config.MAIL_ENABLED)) === 'true',
  host: (await configurations.resolve('SMTP_HOST')) ?? config.SMTP_HOST,
  port: Number((await configurations.resolve('SMTP_PORT')) ?? config.SMTP_PORT),
  secure: ((await configurations.resolve('SMTP_SECURE')) ?? String(config.SMTP_SECURE)) === 'true',
  user: (await configurations.resolve('SMTP_USER')) ?? config.SMTP_USER,
  password: (await configurations.resolve('SMTP_PASSWORD')) ?? config.SMTP_PASSWORD,
  fromAddress: (await configurations.resolve('MAIL_FROM_ADDRESS')) ?? config.MAIL_FROM_ADDRESS,
  fromName: (await configurations.resolve('MAIL_FROM_NAME')) ?? config.MAIL_FROM_NAME,
  tlsRejectUnauthorized:
    ((await configurations.resolve('SMTP_TLS_REJECT_UNAUTHORIZED')) ??
      String(config.SMTP_TLS_REJECT_UNAUTHORIZED)) === 'true',
});

const services = {
  users,

  email,

  configurations,

  principals: new SysBOPrincipalService(store),

  applications: new SysBOApplicationService(store),

  licenses: new SysBOLicenseService(store),

  extAuthProviders: new SysBOExtAuthProviderService(store, secretsEncryption),

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
