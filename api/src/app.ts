import express from 'express';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';

import {
  SysBOUserRole,
  sysBOApplicationsMetadata,
  sysBOExtAuthProvidersMetadata,
  sysBOLicensesMetadata,
  sysBOPrincipalsMetadata,
  sysBOUsersMetadata,
} from '@manatos/shared';

import { createSysBORouter } from './http/sysbo-router.js';
import { API_IMPLEMENTATION_VERSION, API_VERSION } from './version.js';

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
} from './services/domain-services.js';

import { requireAdmin, requireAuthenticated } from './auth/auth-middleware.js';
import { AuthorizationService } from './auth/authorization-service.js';
import { createAuthRouter } from './auth/auth-router.js';

import { sendCommand, sendFailure, sendQuery } from './http/api-response.js';
import { authenticatedAuditActor } from './audit/audit-service.js';
import type { IEmailService } from './email/email-service.js';
import type { SysBOConfigurationService } from './services/sys-configuration-service.js';

import type {
  SysBOExtAuthProviderService,
  SaveSysBOExtAuthProviderInput,
  SaveStoredSysBOExtAuthProviderInput,
  SaveVerifiedSysBOExtAuthProviderInput,
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
   * SysBOUser CRUD.
   *
   * SysBOUser creation requires specialized processing because a supplied
   * password must be validated and hashed before persistence.
   */
  app.use(
    '/api/v1/SysUsers',
    requireAuthenticated,
    createSysBOUserCommandRouter(services.users),
  );

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

  /**
   * Anonymous-safe UI bootstrap contract.
   *
   * The UI starts from local defaults and refreshes this data opportunistically.
   * Keep this payload intentionally small and limited to information that is both
   * useful before sign-in and safe to expose publicly. External authentication
   * provider state has its own on-demand endpoint because freshness matters when
   * Sign in/Register is opened.
   */
  app.get('/api/v1/public/ui-bootstrap', async (_req, res) => {
    res.set('Cache-Control', 'no-store');
    const value = async (name:string) => services.configurations.resolve(name);
    sendQuery(res, {
      server: { alive:true, implementationVersion:API_IMPLEMENTATION_VERSION },
      api: { version:API_VERSION },
      ui: {
        pageSizeOptions: (await value('UI_PAGE_SIZE_OPTIONS') ?? '2,5,10,20,50,100').split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0),
        defaultPageSize: Number(await value('UI_DEFAULT_PAGE_SIZE') ?? 10),
        showTechnicalErrorDetails: (await value('SHOW_TECHNICAL_ERROR_DETAILS') ?? 'false') === 'true',
        sessionErrorLogMaxEntries: Number(await value('SESSION_ERROR_LOG_MAX_ENTRIES') ?? 20),
        donationsShow: (await value('DONATIONS_SHOW') ?? 'false') === 'true',
      },
    });
  });

  /**
   * Current anonymous-safe external-authentication state.
   *
   * This projection deliberately excludes Client ID, Client secret, encrypted
   * secret material and persisted Admin/audit fields.
   */
  app.get('/api/v1/public/external-auth-providers', async (_req, res) => {
    res.set('Cache-Control', 'no-store');
    sendQuery(res, { providers: await services.extAuthProviders.publicProviderState() });
  });

  /**
   * API-owned provider definitions used by the Admin editor.
   * Authentication + Admin role are required even though the definitions contain
   * no secrets, because this is administration/reference material rather than an
   * anonymous UI concern.
   */
  app.get(
    '/api/v1/SysExtAuthProviders/definitions',
    requireAuthenticated,
    requireAdmin,
    (_req, res) => {
      res.set('Cache-Control', 'no-store');
      sendQuery(res, { providers: services.extAuthProviders.providerDefinitions() });
    },
  );

  /**
   * Standard metadata-driven SysBO CRUD endpoints.
   */
  app.use(
    '/api/v1/SysPrincipals',
    requireAuthenticated,

    createSysBORouter(services.principals, sysBOPrincipalsMetadata, authorization),
  );

  /** Admin-only application configuration. Sensitive values are projected safely. */
  app.get('/api/v1/SysConfigurations', requireAuthenticated, requireAdmin, async (_req, res) => {
    res.set('Cache-Control', 'no-store');
    sendQuery(res, { items: await services.configurations.safeList() });
  });

  app.patch('/api/v1/SysConfigurations/:id/value', requireAuthenticated, requireAdmin, async (req, res) => {
    const subject = req.auth!;
    const actor = authenticatedAuditActor(subject.userId, subject.userName);
    const item = await services.configurations.setValue(String(req.params.id ?? ''), req.body?.value == null ? null : String(req.body.value), actor);
    sendCommand(res, 'Configuration updated successfully.', { item });
  });

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
      (body, actor) => services.extAuthProviders.createProvider(body as unknown as SaveSysBOExtAuthProviderInput, actor),
      (id, body, actor) => services.extAuthProviders.updateProvider(id, body as unknown as SaveSysBOExtAuthProviderInput, actor),
    ),
  );

  app.get(
    '/api/v1/internal/external-auth-providers/runtime',
    requireInternalApiKey,
    async (_req, res) => {
      const items = await services.extAuthProviders.resolveConfiguredProviders();
      res.json({ success: true, data: { items } });
    },
  );

  /**
   * Trusted UI command used only after a successful end-to-end provider OAuth
   * credential test. Both the internal key and the authenticated Admin Bearer
   * session are required so a direct public/Admin CRUD request cannot falsely
   * mark credentials as verified.
   */
  app.post(
    '/api/v1/internal/external-auth-providers/verified-credentials',
    requireInternalApiKey,
    requireAuthenticated,
    requireAdmin,
    async (req, res) => {
      const subject = req.auth!;
      const actor = authenticatedAuditActor(subject.userId, subject.userName);
      const item = await services.extAuthProviders.saveVerifiedCredentials(
        req.body as SaveVerifiedSysBOExtAuthProviderInput,
        actor,
      );

      sendCommand(
        res,
        `External authentication credentials for '${item.name}' verified and saved successfully.`,
        { id: item.id, provider: item.provider, credentialsVerified: item.credentialsVerified, credentialsVerifiedAt: item.credentialsVerifiedAt },
      );
    },
  );

  /**
   * Store a complete provider credential pair securely without asserting that
   * the provider has accepted it. This supports Admin draft/configuration work
   * while keeping the provider unavailable to sign-in until it is verified.
   */
  app.post(
    '/api/v1/internal/external-auth-providers/stored-credentials',
    requireInternalApiKey,
    requireAuthenticated,
    requireAdmin,
    async (req, res) => {
      const subject = req.auth!;
      const actor = authenticatedAuditActor(subject.userId, subject.userName);
      const item = await services.extAuthProviders.saveStoredCredentials(
        req.body as SaveStoredSysBOExtAuthProviderInput,
        actor,
      );

      sendCommand(
        res,
        `External authentication credentials for '${item.name}' stored securely; verification is still required.`,
        { id: item.id, provider: item.provider, credentialsVerified: item.credentialsVerified, credentialsVerifiedAt: item.credentialsVerifiedAt },
      );
    },
  );

  /** Trusted UI-only access to one encrypted-at-rest pair for provider testing. */
  app.get(
    '/api/v1/internal/external-auth-providers/:id/credentials-for-test',
    requireInternalApiKey,
    requireAuthenticated,
    requireAdmin,
    async (req, res) => {
      const data = await services.extAuthProviders.storedCredentialMaterial(String(req.params.id ?? ''));
      res.set('Cache-Control', 'no-store');
      res.json({ success: true, data });
    },
  );

  /** Mark the exact stored credential version that successfully completed OAuth testing. */
  app.post(
    '/api/v1/internal/external-auth-providers/:id/credentials-verified',
    requireInternalApiKey,
    requireAuthenticated,
    requireAdmin,
    async (req, res) => {
      const subject = req.auth!;
      const actor = authenticatedAuditActor(subject.userId, subject.userName);
      const item = await services.extAuthProviders.markStoredCredentialsVerified(
        String(req.params.id ?? ''),
        String(req.body.clientId ?? ''),
        String(req.body.secretUpdatedAt ?? ''),
        actor,
      );

      sendCommand(
        res,
        `External authentication credentials for '${item.name}' verified successfully.`,
        { id: item.id, provider: item.provider, credentialsVerified: item.credentialsVerified, credentialsVerifiedAt: item.credentialsVerifiedAt },
      );
    },
  );

  /** Remove both provider credentials and disable the provider atomically. */
  app.delete(
    '/api/v1/internal/external-auth-providers/:id/credentials',
    requireInternalApiKey,
    requireAuthenticated,
    requireAdmin,
    async (req, res) => {
      const subject = req.auth!;
      const actor = authenticatedAuditActor(subject.userId, subject.userName);
      const item = await services.extAuthProviders.removeCredentials(String(req.params.id ?? ''), actor);

      sendCommand(
        res,
        `External authentication credentials for '${item.name}' removed; provider disabled.`,
        { id: item.id, provider: item.provider, enabled: item.enabled },
      );
    },
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

    createInternalRouter(services.users, services.externalIdentities, services.userPrincipals, services.email),
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
