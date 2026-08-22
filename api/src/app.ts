import express from 'express';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';

import {
  SysUserRole,
  sysApplicationsMetadata,
  sysLicensesMetadata,
  sysPrincipalsMetadata,
  sysUsersMetadata,
} from '@manatos/shared';

import { createSysBORouter } from './http/sysbo-router.js';

import { createInternalRouter } from './http/internal-router.js';

import { errorHandler } from './http/error-handler.js';

import { requireInternalApiKey } from './http/internal-api-key.js';

import { requestContextMiddleware } from './http/request-context.js';

import { buildOpenApiSpec } from './openapi.js';

import type { InMemoryDataStore } from './storage/in-memory-data-store.js';

import type { SysUserService } from './services/sys-user-service.js';

import type {
  ExternalIdentityService,
  SysApplicationService,
  SysLicenseService,
  SysPrincipalService,
  UserPrincipalService,
} from './services/domain-services.js';

/**
 * Application services required by the HTTP/API layer.
 */
export interface ApiServices {
  users: SysUserService;

  principals: SysPrincipalService;

  applications: SysApplicationService;

  licenses: SysLicenseService;

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

  /**
   * Basic security hardening.
   */
  app.disable('x-powered-by');

  app.use(helmet());

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
   * Establish request/correlation context before API processing.
   */
  app.use(requestContextMiddleware);

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
   * SysUser CRUD.
   *
   * SysUser creation requires specialized processing because a supplied
   * password must be validated and hashed before persistence.
   */
  app.use(
    '/api/v1/SysUsers',

    createSysBORouter(
      services.users,
      sysUsersMetadata,

      async (body) => {
        const name = String(body.name ?? '');

        const email = String(body.email ?? '');

        return services.users.createUser({
          name,
          email,

          ...(body.password
            ? {
                password: String(body.password),
              }
            : {}),

          ...(body.role
            ? {
                role: body.role as SysUserRole,
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
        });
      },
    ),
  );

  /**
   * Standard metadata-driven SysBO CRUD endpoints.
   */
  app.use(
    '/api/v1/SysPrincipals',

    createSysBORouter(services.principals, sysPrincipalsMetadata),
  );

  app.use(
    '/api/v1/SysApplications',

    createSysBORouter(services.applications, sysApplicationsMetadata),
  );

  app.use(
    '/api/v1/SysLicenses',

    createSysBORouter(services.licenses, sysLicensesMetadata),
  );

  /**
   * Trusted internal API.
   *
   * These routes require the internal API key before requests reach
   * authentication/domain-specific handlers.
   */
  app.use(
    '/api/v1/internal',

    requireInternalApiKey,

    createInternalRouter(services.users, services.externalIdentities, services.userPrincipals),
  );

  /**
   * API/application 404 fallback.
   */
  app.use((_req, res) => {
    res.status(404).json({
      success: false,

      error: {
        code: 'HTTP_NOT_FOUND',

        message: 'The requested API resource was not found.',

        retryable: false,
      },
    });
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
