/** Shared OpenAPI response helper for the canonical ManatOS failure envelope. */
export function failureResponse(description: string) {
  return {
    description,
    content: {
      'application/json': {
        schema: {
          $ref: '#/components/schemas/ApiFailure',
        },
      },
    },
  };
}

export const openApiTags = [
  {
    name: 'Server',
    description:
      'Public service health/readiness operations and Admin-only datastore flush operation.',
  },
  {
    name: 'Authentication',
    description:
      'Registration, sign-in, account/session operations and trusted authentication commands. Access requirements are documented per operation.',
  },
  {
    name: 'System Business Objects',
    description: 'Cross-object SysBO operations such as platform capability projections.',
  },
  {
    name: 'SysBO / Users',
    description: 'SysUser CRUD, metadata, capabilities, picture resources and user commands.',
  },
  {
    name: 'SysBO / Principals',
    description:
      'SysPrincipal CRUD, metadata, capabilities, picture resources and aggregate commit.',
  },
  {
    name: 'SysBO / Applications',
    description:
      'SysApplication CRUD, metadata, capabilities, ordered Pictures resources and aggregate commit.',
  },
  {
    name: 'SysBO / Licenses',
    description: 'SysLicense CRUD, metadata, capabilities and aggregate commit.',
  },
  {
    name: 'SysBO Aux / Email Addresses',
    description: 'Canonical reusable email-address records.',
  },
  {
    name: 'SysBO Aux / Principal Email Addresses',
    description: 'Principal-to-email relationship records.',
  },
  {
    name: 'SysBO Aux / Telephone Numbers',
    description: 'Canonical reusable telephone-number records.',
  },
  {
    name: 'SysBO Aux / Principal Telephone Numbers',
    description: 'Principal-to-telephone relationship records.',
  },
  {
    name: 'SysBO Aux / Addresses',
    description: 'Canonical reusable postal-address records.',
  },
  {
    name: 'SysBO Aux / Principal Addresses',
    description: 'Principal-to-address relationship records.',
  },
  {
    name: 'Expression Runtime',
    description:
      'Authenticated capability-provider operations used by expression owners to delegate only reached AST work that requires server-side capabilities such as EntityResolver.',
  },
  {
    name: 'System Configuration',
    description:
      'Admin-only persisted runtime configuration. Sensitive values are never returned as plaintext.',
  },
  {
    name: 'Public UI',
    description: 'Anonymous-safe data used by the ManatOS UI before sign-in.',
  },
  {
    name: 'External Authentication',
    description:
      'Provider configuration and supported-provider metadata. Administrative provider configuration is Admin-only; anonymous runtime availability is exposed separately under Public UI.',
  },
  {
    name: 'External Authentication Credentials',
    description:
      'Trusted Admin/BFF credential-management operations. Requires an authenticated Admin Bearer token and x-internal-api-key. Secrets are encrypted at rest and never returned through normal provider CRUD.',
  },
  {
    name: 'Internal API',
    description:
      'Trusted UI-server to API operations protected by x-internal-api-key. Individual operations may additionally require an authenticated Admin Bearer token.',
  },
  {
    name: 'Internal External Authentication Workflow',
    description:
      'Internal UI/BFF verification mechanics used by the ManatOS credential-test OAuth flow. Not intended as a general client API.',
  },
];

export const openApiSecuritySchemes = {
  bearerAuth: {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'Opaque',
    description:
      'Opaque API access token returned by ManatOS authentication. Role-based authorization still applies to each operation.',
  },
  internalApiKey: {
    type: 'apiKey',
    in: 'header',
    name: 'x-internal-api-key',
    description:
      'Trusted UI/BFF key. Internal endpoints that also require bearerAuth require BOTH credentials; for external-provider credential operations the Bearer subject must be an Admin.',
  },
};
