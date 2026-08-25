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

await store.initialize();

/**
 * Construct domain/application services.
 */
const users = new SysUserService(store);

const email = createEmailService();

const services = {
  users,

  email,

  principals: new SysPrincipalService(store),

  applications: new SysApplicationService(store),

  licenses: new SysLicenseService(store),

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
    logger.info('ManatOS API started', { url: `http://localhost:${config.API_PORT}` });
    logger.info('Swagger UI available', { url: `http://localhost:${config.API_PORT}/api-docs/` });
  },
);
