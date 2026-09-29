import express from 'express';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';

import {
  SysBOUserRole,
  type SysBOEntity,
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

import { createSysBORouter } from './http/routes/sysbo-router.js';
import { GenericSysBOService } from './services/sysbo/generic-service.js';

import { createInternalRouter } from './http/internal/index.js';

import { errorHandler } from './http/middleware/error-handler.js';

import { requireInternalApiKey } from './http/middleware/internal-api-key.js';

import { requestContextMiddleware } from './http/middleware/request-context.js';
import { operationMiddleware } from './http/middleware/operation-middleware.js';
import { requestLoggingMiddleware } from './http/middleware/request-logging.js';

import { createServerRouter } from './http/routes/server-router.js';
import { createSysBOUserCommandRouter } from './http/routes/sys-user-command-router.js';

import { buildOpenApiSpec } from './openapi.js';

import type { InMemoryDataStore } from './storage/in-memory-data-store.js';

import type { SysBOUserService } from './services/sysbo/user-service.js';

import type {
  ExternalIdentityService,
  SysBOApplicationService,
  SysBOLicenseService,
  SysBOPrincipalService,
} from './services/index.js';

import { requireAuthenticated } from './auth/auth-middleware.js';
import { AuthorizationService } from './auth/authorization-service.js';
import { createAuthRouter } from './auth/router.js';

import { sendFailure } from './http/response.js';
import type { IEmailService } from './email/email-service.js';
import type { SysBOConfigurationService } from './services/sysbo/configuration-service.js';
import type { SystemSettingsStore } from './system-settings.js';

import { createPublicRouter } from './http/routes/public-router.js';
import { createExpressionRouter } from './http/routes/expression-router.js';
import { createPlatformCapabilityRouter } from './http/routes/platform-capability-router.js';
import { createAuthorizationCapabilityRouter } from './http/routes/authorization-capability-router.js';
import { createConfigurationRouter } from './http/routes/configuration-router.js';
import { createExtAuthProviderAdminRouter } from './http/routes/ext-auth-provider-admin-router.js';
import { createSystemSettingsRouter } from './http/routes/system-settings-router.js';
import { createTransactionRouter } from './http/routes/transaction-router.js';
import {
  createWorkspaceCommitRouter,
  type WorkspaceCommitCollectionAdapter,
  type WorkspaceCommitCreateExecutor,
} from './http/routes/workspace-commit-router.js';

import type {
  SysBOExtAuthProviderService,
  SaveSysBOExtAuthProviderInput,
} from './services/sysbo/external-auth-provider-service.js';

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

  systemSettings: SystemSettingsStore;
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

  const workspaceCommitServices = new Map<string, GenericSysBOService<SysBOEntity>>([
    [sysBOUsersMetadata.key, services.users as unknown as GenericSysBOService<SysBOEntity>],
    [
      sysBOPrincipalsMetadata.key,
      services.principals as unknown as GenericSysBOService<SysBOEntity>,
    ],
    [
      sysBOEmailAddressesMetadata.key,
      new GenericSysBOService(
        _store,
        _store.sysEmailAddresses,
        sysBOEmailAddressesMetadata,
      ) as unknown as GenericSysBOService<SysBOEntity>,
    ],
    [
      sysBOPrincipalEmailAddressesMetadata.key,
      new GenericSysBOService(
        _store,
        _store.sysPrincipalEmailAddresses,
        sysBOPrincipalEmailAddressesMetadata,
      ) as unknown as GenericSysBOService<SysBOEntity>,
    ],
    [
      sysBOTelephoneNumbersMetadata.key,
      new GenericSysBOService(
        _store,
        _store.sysTelephoneNumbers,
        sysBOTelephoneNumbersMetadata,
      ) as unknown as GenericSysBOService<SysBOEntity>,
    ],
    [
      sysBOPrincipalTelephoneNumbersMetadata.key,
      new GenericSysBOService(
        _store,
        _store.sysPrincipalTelephoneNumbers,
        sysBOPrincipalTelephoneNumbersMetadata,
      ) as unknown as GenericSysBOService<SysBOEntity>,
    ],
    [
      sysBOAddressesMetadata.key,
      new GenericSysBOService(
        _store,
        _store.sysAddresses,
        sysBOAddressesMetadata,
      ) as unknown as GenericSysBOService<SysBOEntity>,
    ],
    [
      sysBOPrincipalAddressesMetadata.key,
      new GenericSysBOService(
        _store,
        _store.sysPrincipalAddresses,
        sysBOPrincipalAddressesMetadata,
      ) as unknown as GenericSysBOService<SysBOEntity>,
    ],
    [
      sysBOApplicationsMetadata.key,
      services.applications as unknown as GenericSysBOService<SysBOEntity>,
    ],
    [sysBOLicensesMetadata.key, services.licenses as unknown as GenericSysBOService<SysBOEntity>],
  ]);

  // Entity-specific creation semantics remain pluggable while CommitPlan execution
  // stays domain-neutral. SysUser creation must pass through the credential-aware
  // service even when the workspace does not supply a local password.
  const workspaceCommitCreateExecutors = new Map<string, WorkspaceCommitCreateExecutor>([
    [
      sysBOUsersMetadata.key,
      async (values, actor) =>
        services.users.createUser(
          {
            name: String(values.name ?? ''),
            email: String(values.email ?? ''),
            ...(values.telephoneNumber ? { telephoneNumber: String(values.telephoneNumber) } : {}),
            ...(values.role ? { role: values.role as SysBOUserRole } : {}),
            ...(values.firstName ? { firstName: String(values.firstName) } : {}),
            ...(values.lastName ? { lastName: String(values.lastName) } : {}),
            ...(values.description ? { description: String(values.description) } : {}),
            ...(values.emailVerified !== undefined
              ? { emailVerified: Boolean(values.emailVerified) }
              : {}),
            enabled: values.enabled !== false,
          },
          actor,
        ),
    ],
  ]);

  // Aggregate collection payloads remain generic in CommitPlan. Entity services opt in
  // at the API persistence boundary to translate them into their canonical write contract.
  const workspaceCommitCollectionAdapters = new Map<string, WorkspaceCommitCollectionAdapter>([
    [
      sysBOPrincipalsMetadata.key,
      (collections) => {
        const supported = new Set(['emailAddresses', 'telephoneNumbers', 'addresses']);
        const unsupported = Object.keys(collections).filter((key) => !supported.has(key));
        if (unsupported.length)
          throw new Error(
            `Principal workspace Commit does not support related collection(s): ${unsupported.join(', ')}.`,
          );
        return {
          relatedChanges: Object.fromEntries(
            Object.entries(collections).map(([key, collection]) => {
              const current = collection.current ?? [];
              return [
                key,
                {
                  current:
                    key === 'emailAddresses'
                      ? current.map((item) =>
                          typeof item === 'string'
                            ? item
                            : String(
                                item && typeof item === 'object' && !Array.isArray(item)
                                  ? ((item as Record<string, unknown>).address ?? '')
                                  : '',
                              ),
                        )
                      : current,
                },
              ];
            }),
          ),
        };
      },
    ],
  ]);

  /**
   * Basic security hardening.
   */
  app.disable('x-powered-by');

  /**
   * Establish request/correlation context before every other middleware so
   * security/parser/gateway failures participate in the same semantic tree.
   */
  app.use(requestContextMiddleware);

  app.use(operationMiddleware('Apply HTTP security policy', helmet(), 'Applying request security'));

  /**
   * Log the full request/response lifecycle after correlation context exists so
   * both entries carry the same x-request-id returned to the caller.
   */
  app.use(
    operationMiddleware(
      'Initialize request logging',
      requestLoggingMiddleware,
      'Starting request diagnostics',
    ),
  );

  /**
   * JSON request parsing.
   *
   * The 2 MB limit protects against unexpectedly large API payloads.
   */
  app.use(
    operationMiddleware(
      'Parse JSON request body',
      express.json({
        limit: '2mb',
      }),
      'Reading request data',
    ),
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
   * API-authoritative collection capability projection used by shell/navigation
   * consumers. This prevents the UI from maintaining a parallel role/entity
   * visibility matrix.
   */
  app.use(
    '/api/v1/authorization',
    requireAuthenticated,
    createAuthorizationCapabilityRouter(authorization),
  );

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

  /** Explicit server-side storage transaction lifecycle for composite UI saves. */
  app.use('/api/v1/transactions', requireAuthenticated, createTransactionRouter(_store));

  /** Capability-backed expression functions delegated to the API. */
  app.use('/api/v1/expressions', createExpressionRouter(_store, authorization));

  /** External-authentication administration/reference endpoints. */
  app.use(
    '/api/v1/SysExtAuthProviders',
    createExtAuthProviderAdminRouter(services.extAuthProviders),
  );

  app.use(
    '/api/v1/workspace',
    requireAuthenticated,
    createWorkspaceCommitRouter(
      _store,
      authorization,
      workspaceCommitServices,
      workspaceCommitCreateExecutors,
      workspaceCommitCollectionAdapters,
    ),
  );

  /**
   * Standard metadata-driven SysBO CRUD endpoints.
   */
  app.use(
    '/api/v1/SysPrincipals',
    requireAuthenticated,

    createSysBORouter(services.principals, sysBOPrincipalsMetadata, authorization),
  );

  /** Application configuration: Superuser inspection; Admin mutation. */
  app.use('/api/v1/SysConfigurations', createConfigurationRouter(services.configurations));

  /** Admin-only bootstrap/infrastructure settings. */
  app.use('/api/v1/system-settings', createSystemSettingsRouter(services.systemSettings));

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
