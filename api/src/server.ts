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

const services = {
  users,

  principals: new SysPrincipalService(store),

  applications: new SysApplicationService(store),

  licenses: new SysLicenseService(store),

  externalIdentities: new ExternalIdentityService(store),

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
createApp(store, services).listen(
  config.API_PORT,

  () => {
    console.log(`ManatOS API: http://localhost:${config.API_PORT}`);

    console.log(`Swagger: http://localhost:${config.API_PORT}/api-docs/`);
  },
);
