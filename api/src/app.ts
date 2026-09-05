import express from 'express';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';

import {
  SysBOUserRole,
  sysBOApplicationsMetadata,
  sysBOExtAuthProvidersMetadata,
  sysBOEmailAddressesMetadata,
  sysBOPrincipalEmailAddressesMetadata,
  sysBOTelephoneNumbersMetadata,
  sysBOPrincipalTelephoneNumbersMetadata,
  sysBOAddressesMetadata,
  sysBOPrincipalAddressesMetadata,
  sysBOLicensesMetadata,
  sysBOPrincipalsMetadata,
  sysBOUsersMetadata,
} from '@manatos/shared';

import { createSysBORouter } from './http/sysbo-router.js';
import { GenericSysBOService } from './services/generic-sysbo-service.js';

import { createInternalRouter } from './http/internal-router.js';

import { errorHandler } from './http/error-handler.js';

import { requireInternalApiKey } from './http/internal-api-key.js';

import { requestContextMiddleware } from './http/request-context.js';
import { requestLoggingMiddleware } from './http/request-logging.js';

import { createServerRouter } from './http/server-router.js';
import { createSysBOUserCommandRouter } from './http/sys-user-command-router.js';

import { buildOpenApiSpec } from './openapi.js';

import type { InMemoryDataStore } from './storage/in-memory-data-store.js';

import type { SysBOUserService } from './services/sys-user-service.js';

import type {
  ExternalIdentityService,
  SysBOApplicationService,
  SysBOLicenseService,
  SysBOPrincipalService,
  UserPrincipalService,
} from './services/index.js';

import { requireAuthenticated } from './auth/auth-middleware.js';
import { AuthorizationService } from './auth/authorization-service.js';
import { createAuthRouter } from './auth/auth-router.js';

import { sendFailure } from './http/api-response.js';
import type { IEmailService } from './email/email-service.js';
import type { SysBOConfigurationService } from './services/sys-configuration-service.js';

import { createPublicRouter } from './http/public-router.js';
import { createExpressionRouter } from './http/expression-router.js';
import { createPlatformCapabilityRouter } from './http/platform-capability-router.js';
import { createConfigurationRouter } from './http/configuration-router.js';
import { createExtAuthProviderAdminRouter } from './http/ext-auth-provider-admin-router.js';

import type {
  SysBOExtAuthProviderService,
  SaveSysBOExtAuthProviderInput,
} from './services/sys-ext-auth-provider-service.js';

/**
 * Application services required by the HTTP/API layer.
 */
export interface ApiServices {
  users: SysBOUserService;

  email: IEmailService;

  principals: SysBOPrincipalService;

  applications: SysBOApplicationService;

  configurations: SysBOConfigurationService;

  licenses: SysBOLicenseService;

  extAuthProviders: SysBOExtAuthProviderService;

  externalIdentities: ExternalIdentityService;

  userPrincipals: UserPrincipalService;
}

/**
 * Construct and configure the Express API application.
 *
 * Keeping application construction separate from server.listen()
 * also makes integration testing considerably easier.
 */
export function createApp(_store: InMemoryDataStore, services: ApiServices) {
  const app = express();

  const authorization = new AuthorizationService(_store);

  /**
   * Basic security hardening.
   */
  app.disable('x-powered-by');

  app.use(helmet());

  /**
   * Establish request/correlation context before parsing or routing so even
   * malformed request bodies receive a traceable x-request-id.
   */
  app.use(requestContextMiddleware);

  /**
   * Log the full request/response lifecycle after correlation context exists so
   * both entries carry the same x-request-id returned to the caller.
   */
  app.use(requestLoggingMiddleware);

  /**
   * JSON request parsing.
   *
   * The 1 MB limit protects against unexpectedly large API payloads.
   */
  app.use(
    express.json({
      limit: '1mb',
    }),
  );

  /**
   * Build the OpenAPI specification once during application startup.
   */
  const openApiSpec = buildOpenApiSpec();

  /**
   * Raw OpenAPI document.
   *
   * This remains under the API namespace because it is an API
   * description resource rather than the Swagger user interface.
   */
  app.get(
    '/api/openapi.json',

    (_req, res) => {
      res.json(openApiSpec);
    },
  );

  /**
   * Swagger UI.
   *
   * Swagger is deliberately hosted outside the /api namespace.
   *
   * This prevents the Swagger middleware from intercepting actual
   * REST requests such as:
   *
   *   /api/v1/SysUsers
   *   /api/v1/SysPrincipals
   *   /api/v1/SysApplications
   *   /api/v1/SysLicenses
   *
   * Swagger:
   *
   *   http://localhost:3000/api-docs/
   *
   * OpenAPI JSON:
   *
   *   http://localhost:3000/api/openapi.json
   */
  app.use(
    '/api-docs',

    swaggerUi.serve,

    swaggerUi.setup(openApiSpec),
  );

  /**
   * Register auth.
   */
  app.use(
    '/api/v1/auth',

    createAuthRouter(services.users),
  );

  /**
   * API-authoritative platform capability projection.
   *
   * The UI consumes this resolved fact instead of reading SysLicenses and
   * reproducing entitlement policy locally.
   */
  app.use('/api/v1/platforms', requireAuthenticated, createPlatformCapabilityRouter(authorization));

  /**
   * SysBOUser CRUD.
   *
   * SysBOUser creation requires specialized processing because a supplied
   * password must be validated and hashed before persistence.
   */
  app.use('/api/v1/SysUsers', requireAuthenticated, createSysBOUserCommandRouter(services.users));

  app.use(
    '/api/v1/SysUsers',
    requireAuthenticated,

    createSysBORouter(
      services.users,
      sysBOUsersMetadata,

      authorization,

      async (body, actor) =>
        services.users.createUser(
          {
            name: String(body.name ?? ''),

            email: String(body.email ?? ''),

            ...(body.telephoneNumber ? { telephoneNumber: String(body.telephoneNumber) } : {}),

            ...(body.password
              ? {
                  password: String(body.password),
                }
              : {}),

            ...(body.role
              ? {
                  role: body.role as SysBOUserRole,
                }
              : {}),

            ...(body.firstName
              ? {
                  firstName: String(body.firstName),
                }
              : {}),

            ...(body.lastName
              ? {
                  lastName: String(body.lastName),
                }
              : {}),

            ...(body.description
              ? {
                  description: String(body.description),
                }
              : {}),

            ...(body.emailVerified !== undefined
              ? {
                  emailVerified: Boolean(body.emailVerified),
                }
              : {}),

            enabled: body.enabled !== false,
          },

          actor,
        ),
    ),
  );

  /** Anonymous-safe UI discovery/bootstrap endpoints. */
  app.use('/api/v1/public', createPublicRouter(services.configurations, services.extAuthProviders));

  /** Capability-backed expression functions delegated to the API. */
  app.use('/api/v1/expressions', createExpressionRouter(_store, authorization));

  /** External-authentication administration/reference endpoints. */
  app.use(
    '/api/v1/SysExtAuthProviders',
    createExtAuthProviderAdminRouter(services.extAuthProviders),
  );

  /**
   * Standard metadata-driven SysBO CRUD endpoints.
   */
  app.use(
    '/api/v1/SysPrincipals',
    requireAuthenticated,

    createSysBORouter(services.principals, sysBOPrincipalsMetadata, authorization),
  );

  /** Admin-only application configuration. */
  app.use('/api/v1/SysConfigurations', createConfigurationRouter(services.configurations));

  app.use(
    '/api/v1/SysEmailAddresses',
    requireAuthenticated,
    createSysBORouter(
      new GenericSysBOService(_store, _store.sysEmailAddresses, sysBOEmailAddressesMetadata),
      sysBOEmailAddressesMetadata,
      authorization,
    ),
  );

  app.use(
    '/api/v1/SysPrincipalEmailAddresses',
    requireAuthenticated,
    createSysBORouter(
      new GenericSysBOService(
        _store,
        _store.sysPrincipalEmailAddresses,
        sysBOPrincipalEmailAddressesMetadata,
      ),
      sysBOPrincipalEmailAddressesMetadata,
      authorization,
    ),
  );

  app.use(
    '/api/v1/SysTelephoneNumbers',
    requireAuthenticated,
    createSysBORouter(
      new GenericSysBOService(_store, _store.sysTelephoneNumbers, sysBOTelephoneNumbersMetadata),
      sysBOTelephoneNumbersMetadata,
      authorization,
    ),
  );

  app.use(
    '/api/v1/SysPrincipalTelephoneNumbers',
    requireAuthenticated,
    createSysBORouter(
      new GenericSysBOService(
        _store,
        _store.sysPrincipalTelephoneNumbers,
        sysBOPrincipalTelephoneNumbersMetadata,
      ),
      sysBOPrincipalTelephoneNumbersMetadata,
      authorization,
    ),
  );

  app.use(
    '/api/v1/SysAddresses',
    requireAuthenticated,
    createSysBORouter(
      new GenericSysBOService(_store, _store.sysAddresses, sysBOAddressesMetadata),
      sysBOAddressesMetadata,
      authorization,
    ),
  );

  app.use(
    '/api/v1/SysPrincipalAddresses',
    requireAuthenticated,
    createSysBORouter(
      new GenericSysBOService(
        _store,
        _store.sysPrincipalAddresses,
        sysBOPrincipalAddressesMetadata,
      ),
      sysBOPrincipalAddressesMetadata,
      authorization,
    ),
  );

  app.use(
    '/api/v1/SysApplications',
    requireAuthenticated,

    createSysBORouter(services.applications, sysBOApplicationsMetadata, authorization),
  );

  app.use(
    '/api/v1/SysLicenses',
    requireAuthenticated,

    createSysBORouter(services.licenses, sysBOLicensesMetadata, authorization),
  );

  app.use(
    '/api/v1/SysExtAuthProviders',
    requireAuthenticated,
    createSysBORouter(
      services.extAuthProviders,
      sysBOExtAuthProvidersMetadata,
      authorization,
      (body, actor) =>
        services.extAuthProviders.createProvider(
          body as unknown as SaveSysBOExtAuthProviderInput,
          actor,
        ),
      (id, body, actor) =>
        services.extAuthProviders.updateProvider(
          id,
          body as unknown as SaveSysBOExtAuthProviderInput,
          actor,
        ),
    ),
  );

  /**
   * Server-level operational routes:
   *
   *   GET  /health
   *   GET  /ready
   *   POST /flush-db
   */
  app.use(createServerRouter(_store));

  /**
   * Trusted internal API.
   *
   * These routes require the internal API key before requests reach
   * authentication/domain-specific handlers.
   */
  app.use(
    '/api/v1/internal',

    requireInternalApiKey,

    createInternalRouter({
      users: services.users,
      externalIdentities: services.externalIdentities,
      userPrincipals: services.userPrincipals,
      email: services.email,
      extAuthProviders: services.extAuthProviders,
    }),
  );

  /**
   * API/application 404 fallback.
   */
  app.use((_req, res) => {
    sendFailure(res, 404, 'HTTP_NOT_FOUND', 'The requested API resource was not found.', false);
  });

  /**
   * Central error middleware.
   *
   * Error-handling middleware must remain after all normal routes
   * and middleware.
   */
  app.use(errorHandler);

  return app;
}
