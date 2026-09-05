import { allSysBOMetadata, type SysBOFieldMetadata, type SysBOMetadata } from '@manatos/shared';

/**
 * Convert one SysBO field definition into its corresponding
 * OpenAPI schema fragment.
 */
const fieldSchema = (field: SysBOFieldMetadata): Record<string, unknown> => {
  switch (field.type) {
    case 'boolean':
      return {
        type: 'boolean',
      };

    case 'number':
      return {
        type: 'number',
      };

    case 'guid':
      return {
        type: 'string',
        format: 'uuid',
      };

    case 'email':
      return {
        type: 'string',
        format: 'email',
      };

    case 'date':
      return {
        type: 'string',
        format: 'date',
      };

    case 'datetime':
      return {
        type: 'string',
        format: 'date-time',
      };

    case 'version':
      return {
        type: 'string',
        pattern: field.versionFormat === 'semver' ? '^\\d+\\.\\d+\\.\\d+$' : undefined,
        example: field.versionFormat === 'semver' ? '1.0.0' : undefined,
      };

    case 'duration':
      return {
        type: 'object',
        properties: {
          years: { type: 'integer', minimum: 0 },
          months: { type: 'integer', minimum: 0 },
          days: { type: 'integer', minimum: 0 },
        },
        required: ['years', 'months', 'days'],
        additionalProperties: false,
      };

    case 'enum':
      return {
        type: 'string',
        enum: field.enumValues,
      };

    default:
      return {
        type: 'string',
      };
  }
};

/**
 * Generate an OpenAPI object schema from hard-coded SysBO metadata.
 *
 * Sensitive fields are deliberately excluded from the public API
 * schema.
 */
const businessObjectSchema = (metadata: SysBOMetadata<unknown>) => {
  const properties: Record<string, unknown> = {};

  const required: string[] = [];

  for (const field of Object.values(metadata.fieldDefinition)) {
    if (field.sensitive) {
      continue;
    }

    properties[field.key] = {
      ...fieldSchema(field),
      ...(field.readOnly || field.generated ? { readOnly: true } : {}),
    };

    if (field.required && !field.generated) {
      required.push(field.key);
    }
  }

  /*
   * SysBOUser exposes password existence rather than passwordHash.
   */
  if (metadata.key === 'sys-users') {
    properties.hasPassword = {
      type: 'boolean',
    };
  }

  return {
    type: 'object',
    properties,
    required,
  };
};

/**
 * Build the OpenAPI 3.1 specification for the ManatOS REST API.
 */
export function buildOpenApiSpec() {
  const schemas: Record<string, unknown> = {};

  for (const metadata of Object.values(allSysBOMetadata)) {
    schemas[metadata.name] = businessObjectSchema(metadata as SysBOMetadata<unknown>);
  }

  return {
    openapi: '3.1.0',

    info: {
      title: 'ManatOS Multi-Platform API',

      version: '0.1.0',

      description:
        'Metadata-driven versioned REST API. External-authentication operations are grouped by public/business use, trusted credential management, and internal UI verification workflow.',
    },

    tags: [
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
        description:
          'Metadata-driven system business-object CRUD, UI metadata and entity-specific SysBO commands.',
      },
      {
        name: 'System Business Objects (Aux)',
        description:
          'Supporting/internal SysBO resources used by primary business objects, including reusable contact values and relationship rows.',
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
        name: 'Internal External Authentication Workflow',
        description:
          'Internal UI/BFF verification mechanics used by the ManatOS credential-test OAuth flow. Not intended as a general client API.',
      },
    ],

    components: {
      schemas: {
        ...schemas,

        ApiFailure: apiFailureSchema(),

        SysBOAuthorizationCapabilities: sysBOAuthorizationCapabilitiesSchema(),
        PlatformAuthorizationCapabilities: platformAuthorizationCapabilitiesSchema(),
      },

      securitySchemes: {
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
      },
    },

    paths: {
      /**
       * Server health/readiness.
       */
      '/health': healthOperation('Health check'),

      '/ready': readinessOperation('Readiness check'),

      '/flush-db': flushDatabaseOperation(),

      /**
       * Authentication.
       */
      '/api/v1/auth/register': registerOperation(),

      '/api/v1/auth/login': loginOperation(),

      '/api/v1/auth/logout': logoutOperation(),

      '/api/v1/auth/logout-all': logoutAllOperation(),

      '/api/v1/auth/me': meOperation(),

      '/api/v1/auth/sessions': sessionsOperation(),

      '/api/v1/auth/password': passwordOperation(),

      /**
       * Anonymous UI/bootstrap configuration.
       */
      '/api/v1/public/ui-bootstrap': uiBootstrapOperation(),

      '/api/v1/public/external-auth-providers': publicExternalAuthProvidersOperation(),

      '/api/v1/platforms/{platformId}/$capabilities': platformCapabilityOperation(),

      /**
       * Protected SysBO resources.
       */
      ...sysBOCapabilityPaths('/api/v1/SysUsers', 'User', 'System Business Objects'),
      ...sysBOCapabilityPaths('/api/v1/SysPrincipals', 'Principal', 'System Business Objects'),
      ...sysBOCapabilityPaths(
        '/api/v1/SysEmailAddresses',
        'Email address',
        'System Business Objects (Aux)',
      ),
      ...sysBOCapabilityPaths(
        '/api/v1/SysPrincipalEmailAddresses',
        'Principal email address',
        'System Business Objects (Aux)',
      ),
      ...sysBOCapabilityPaths(
        '/api/v1/SysTelephoneNumbers',
        'Telephone number',
        'System Business Objects (Aux)',
      ),
      ...sysBOCapabilityPaths(
        '/api/v1/SysPrincipalTelephoneNumbers',
        'Principal telephone number',
        'System Business Objects (Aux)',
      ),
      ...sysBOCapabilityPaths('/api/v1/SysAddresses', 'Address', 'System Business Objects (Aux)'),
      ...sysBOCapabilityPaths(
        '/api/v1/SysPrincipalAddresses',
        'Principal address',
        'System Business Objects (Aux)',
      ),
      ...sysBOCapabilityPaths('/api/v1/SysApplications', 'Application', 'System Business Objects'),
      ...sysBOCapabilityPaths('/api/v1/SysLicenses', 'License', 'System Business Objects'),
      ...sysBOCapabilityPaths(
        '/api/v1/SysExtAuthProviders',
        'External authentication provider',
        'External Authentication',
      ),

      '/api/v1/SysUsers': genericOperations('User', 'System Business Objects'),

      '/api/v1/SysUsers/$metadata-ui': sysBOUIMetadataOperation('User', 'System Business Objects'),

      '/api/v1/SysUsers/{id}/verify-email': adminVerifyEmailOperation('System Business Objects'),

      '/api/v1/expressions/evaluate-function': expressionFunctionOperation(),

      '/api/v1/SysPrincipals': genericOperations('Principal', 'System Business Objects'),

      '/api/v1/SysPrincipals/$aggregate-commit': aggregateCommitOperation(
        'Principal',
        'System Business Objects',
      ),

      '/api/v1/SysEmailAddresses': genericOperations(
        'Email address',
        'System Business Objects (Aux)',
      ),

      '/api/v1/SysPrincipalEmailAddresses': genericOperations(
        'Principal email address',
        'System Business Objects (Aux)',
      ),

      '/api/v1/SysTelephoneNumbers': genericOperations(
        'Telephone number',
        'System Business Objects (Aux)',
      ),

      '/api/v1/SysPrincipalTelephoneNumbers': genericOperations(
        'Principal telephone number',
        'System Business Objects (Aux)',
      ),

      '/api/v1/SysAddresses': genericOperations('Address', 'System Business Objects (Aux)'),

      '/api/v1/SysPrincipalAddresses': genericOperations(
        'Principal address',
        'System Business Objects (Aux)',
      ),

      '/api/v1/SysPrincipals/$metadata-ui': sysBOUIMetadataOperation(
        'Principal',
        'System Business Objects',
      ),

      '/api/v1/SysApplications': genericOperations('Application', 'System Business Objects'),

      '/api/v1/SysApplications/$metadata-ui': sysBOUIMetadataOperation(
        'Application',
        'System Business Objects',
      ),

      '/api/v1/SysLicenses': genericOperations('License', 'System Business Objects'),

      '/api/v1/SysLicenses/$metadata-ui': sysBOUIMetadataOperation(
        'License',
        'System Business Objects',
      ),

      '/api/v1/SysExtAuthProviders': externalAuthProviderOperations(),

      '/api/v1/SysExtAuthProviders/$metadata-ui': sysBOUIMetadataOperation(
        'External authentication provider',
        'System Business Objects',
      ),

      '/api/v1/SysExtAuthProviders/{id}': externalAuthProviderItemOperations(),

      '/api/v1/SysExtAuthProviders/definitions': externalAuthProviderDefinitionsOperation(),

      '/api/v1/SysConfigurations': sysBOConfigurationsOperation(),

      '/api/v1/SysConfigurations/{id}/value': sysBOConfigurationValueOperation(),

      '/api/v1/internal/external-auth-providers/verified-credentials':
        verifiedExternalAuthCredentialsOperation(),

      '/api/v1/internal/external-auth-providers/stored-credentials':
        storedExternalAuthCredentialsOperation(),

      '/api/v1/internal/external-auth-providers/{id}/credentials-for-test':
        storedExternalAuthCredentialsForTestOperation(),

      '/api/v1/internal/external-auth-providers/{id}/credentials-verified':
        markStoredExternalAuthCredentialsVerifiedOperation(),

      '/api/v1/internal/external-auth-providers/{id}/credentials':
        removeExternalAuthCredentialsOperation(),
    },
  };
}

function uiBootstrapOperation() {
  return {
    get: {
      summary: 'Get anonymous-safe UI bootstrap configuration',
      tags: ['Public UI'],
      responses: {
        '200': {
          description:
            'Current public UI bootstrap data, including server availability and API/implementation versions. The UI may safely fall back to local defaults and retry when unavailable.',
        },
      },
    },
  };
}

function publicExternalAuthProvidersOperation() {
  return {
    get: {
      summary: 'Get current public external-authentication provider state',
      description:
        'Access: Public/anonymous. Returns only providers that are currently usable for sign-in plus anonymous-safe provider metadata. Client IDs, client secrets, encrypted values and Admin/audit fields are never included.',
      tags: ['Public UI', 'External Authentication'],
      responses: {
        '200': {
          description: 'Current provider enabled/configured state.',
        },
      },
    },
  };
}

function externalAuthProviderDefinitionsOperation() {
  return {
    get: {
      summary: 'Get external-authentication provider definitions',
      description:
        'Access: Admin only (Bearer token). Returns code-defined provider metadata including fixed callback paths, provider icons, scopes and setup guidance. Contains no persisted credentials.',
      tags: ['External Authentication'],
      security: [{ bearerAuth: [] }],
      responses: {
        '200': { description: 'Provider definitions returned.' },
        '401': failureResponse('Authentication required.'),
        '403': failureResponse('Administrator role required.'),
      },
    },
  };
}

function verifiedExternalAuthCredentialsOperation() {
  return {
    post: {
      summary: 'Persist an externally tested Client ID + Client secret pair',
      description:
        'Access: Internal UI/BFF only. Requires BOTH x-internal-api-key and an authenticated Admin Bearer token. Used by the ordinary provider Save transaction after a non-persisting OAuth test succeeds. The proof/test state is short-lived; verification itself does not persist the candidate pair.',
      tags: ['Internal External Authentication Workflow'],
      'x-manatos-access': 'Internal UI/BFF; Admin Bearer + x-internal-api-key',
      security: [{ bearerAuth: [], internalApiKey: [] }],
      responses: {
        '200': { description: 'Verified credential pair stored atomically.' },
        '400': failureResponse('Credential/configuration validation failure.'),
        '401': failureResponse('Authentication/internal key required.'),
        '403': failureResponse('Administrator role required.'),
      },
    },
  };
}

function storedExternalAuthCredentialsOperation() {
  return {
    post: {
      summary: 'Persist an unverified Client ID + Client secret pair securely',
      description:
        'Access: Trusted Admin/BFF credential management. Requires BOTH x-internal-api-key and an authenticated Admin Bearer token. Used by the ordinary provider Save transaction when replacing a complete pair without a valid verification proof. Stores the complete pair encrypted at rest, sets credentialsVerified=false and clears credentialsVerifiedAt. The provider remains unavailable to sign-in until verification succeeds.',
      tags: ['External Authentication Credentials'],
      'x-manatos-access': 'Trusted Admin/BFF; Admin Bearer + x-internal-api-key',
      security: [{ bearerAuth: [], internalApiKey: [] }],
      responses: {
        '200': { description: 'Credential pair stored securely with verification state cleared.' },
        '400': failureResponse('Credential/configuration validation failure.'),
        '401': failureResponse('Authentication/internal key required.'),
        '403': failureResponse('Administrator role required.'),
      },
    },
  };
}

function storedExternalAuthCredentialsForTestOperation() {
  return {
    get: {
      summary: 'Get one stored credential pair for trusted UI provider testing',
      description:
        'Access: Internal UI/BFF only. Requires BOTH x-internal-api-key and an authenticated Admin Bearer token. Decrypts one stored pair only for the trusted UI server while running the OAuth credential test; normal Admin CRUD and browser responses never expose the secret.',
      tags: ['Internal External Authentication Workflow'],
      'x-manatos-access': 'Internal UI/BFF; Admin Bearer + x-internal-api-key',
      security: [{ bearerAuth: [], internalApiKey: [] }],
      responses: {
        '200': { description: 'Stored credential material returned to the trusted UI server.' },
        '400': failureResponse('No complete stored credential pair exists.'),
        '401': failureResponse('Authentication/internal key required.'),
        '403': failureResponse('Administrator role required.'),
      },
    },
  };
}

function markStoredExternalAuthCredentialsVerifiedOperation() {
  return {
    post: {
      summary: 'Mark the exact tested stored credential version as verified',
      description:
        'Access: Internal UI/BFF only. Requires BOTH x-internal-api-key and an authenticated Admin Bearer token. Legacy/internal support for verification of an already-stored pair; the metadata-driven editor now verifies current screen values and defers persistence to Save. Client ID and secret update timestamp are checked so a stale test cannot verify credentials replaced by another Admin.',
      tags: ['Internal External Authentication Workflow'],
      'x-manatos-access': 'Internal UI/BFF; Admin Bearer + x-internal-api-key',
      security: [{ bearerAuth: [], internalApiKey: [] }],
      responses: {
        '200': { description: 'Stored credential pair marked verified.' },
        '400': failureResponse('Credential/configuration validation failure.'),
        '409': failureResponse('Credentials changed while the test was in progress.'),
        '401': failureResponse('Authentication/internal key required.'),
        '403': failureResponse('Administrator role required.'),
      },
    },
  };
}

function removeExternalAuthCredentialsOperation() {
  return {
    delete: {
      summary: 'Remove external-provider credentials and disable provider',
      description:
        'Access: Trusted Admin/BFF credential management. Requires BOTH x-internal-api-key and an authenticated Admin Bearer token. Invoked by the ordinary provider Save transaction when the pending credential action is remove. Removes Client ID and encrypted Client Secret, clears verification state and disables the provider atomically.',
      tags: ['External Authentication Credentials'],
      'x-manatos-access': 'Trusted Admin/BFF; Admin Bearer + x-internal-api-key',
      security: [{ bearerAuth: [], internalApiKey: [] }],
      responses: {
        '200': { description: 'Client ID and Client secret removed; provider disabled.' },
        '401': failureResponse('Authentication/internal key required.'),
        '403': failureResponse('Administrator role required.'),
      },
    },
  };
}

function externalAuthProviderOperations() {
  const generic = genericOperations('External authentication provider');

  return {
    get: {
      ...generic.get,
      summary: 'List configured external-authentication providers',
      description:
        'Access: Admin only (Bearer token). Lists persisted provider configuration and verification state. Secret material is never returned.',
      tags: ['System Business Objects'],
      responses: {
        ...generic.get.responses,
        '403': failureResponse('Administrator role required.'),
      },
    },
    post: {
      summary: 'Create external-authentication provider',
      description:
        'Access: Admin only (Bearer token). Creates one provider configuration. callbackPath is generated from the provider definition and any non-default override is rejected. Credential material is managed separately through trusted credential-management operations.',
      tags: ['System Business Objects'],
      security: [{ bearerAuth: [] }],
      responses: {
        '201': { description: 'Created with the provider-defined callback path.' },
        '400': failureResponse(
          'Validation failure, including an attempted callback-path override.',
        ),
        '401': failureResponse('Authentication required.'),
        '403': failureResponse('Administrator role required.'),
        '409': failureResponse('That provider already has a configuration record.'),
      },
    },
  };
}

function externalAuthProviderItemOperations() {
  return {
    get: {
      summary: 'Get configured external-authentication provider',
      description:
        'Access: Admin only (Bearer token). Returns one persisted provider configuration and verification state. Client Secret and encrypted secret material are never returned.',
      tags: ['System Business Objects'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: {
        '200': { description: 'Provider configuration returned.' },
        '401': failureResponse('Authentication required.'),
        '403': failureResponse('Administrator role required.'),
        '404': failureResponse('Provider configuration not found.'),
      },
    },
    patch: {
      summary: 'Update external-authentication provider settings',
      description:
        'Access: Admin only (Bearer token). Updates ordinary provider settings such as enabled/tenant. Provider type, Client ID, Client Secret and application-managed verification state cannot be changed through generic CRUD.',
      tags: ['System Business Objects'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: {
        '200': { description: 'Provider configuration updated.' },
        '400': failureResponse(
          'Validation failure or attempted credential/application-managed mutation.',
        ),
        '401': failureResponse('Authentication required.'),
        '403': failureResponse('Administrator role required.'),
        '404': failureResponse('Provider configuration not found.'),
      },
    },
    delete: {
      summary: 'Delete external-authentication provider',
      description: 'Access: Admin only (Bearer token). Deletes the provider configuration record.',
      tags: ['System Business Objects'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: {
        '200': { description: 'Provider configuration deleted.' },
        '401': failureResponse('Authentication required.'),
        '403': failureResponse('Administrator role required.'),
        '404': failureResponse('Provider configuration not found.'),
      },
    },
  };
}

/**
 * Framework-neutral, read-only UI metadata for one SysBO.
 */
const sysBOUIMetadataOperation = (name: string, tag: string) => ({
  get: {
    summary: `Get ${name} UI metadata`,
    description:
      'Read-only framework-neutral UI contract for EJS and future Angular/React/mobile clients.',
    tags: [tag],
    security: [{ bearerAuth: [] }],
    responses: {
      '200': { description: 'UI metadata returned.' },
      '401': { description: 'Authentication required' },
      '404': { description: 'UI metadata not defined for this SysBO' },
    },
  },
});

/**
 * Standard OpenAPI operations currently shared by generic SysBO
 * collection endpoints.
 */
const expressionFunctionOperation = () => ({
  post: {
    summary: 'Evaluate one delegated expression capability function',
    tags: ['Expression Runtime'],
    description:
      'Access: authenticated Bearer session. The caller remains owner of the complete expression and sends only a reached function call whose capability is unavailable locally. Phase 1 supports EntityResolver-backed functions such as TraverseEntity. Raw resolver records are never returned; resolver-visible entities are metadata-projected with sensitive fields excluded.',
    security: [{ bearerAuth: [] }],
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['functionName', 'args'],
            properties: {
              functionName: { type: 'string', example: 'TraverseEntity' },
              args: {
                type: 'array',
                items: {},
                example: ['principal-id', 'sys-principals', 'parentId', 'id'],
              },
            },
          },
        },
      },
    },
    responses: {
      '200': { description: 'Delegated function result.' },
      '400': { description: 'Unknown/non-delegable function or invalid arguments.' },
      '401': { description: 'Authentication required.' },
      '403': { description: 'Resolver access to a referenced entity is not authorized.' },
    },
  },
});

const aggregateCommitOperation = (name: string, tag = 'System Business Objects') => ({
  post: {
    summary: `Atomically commit an owner-managed ${name} aggregate`,
    tags: [tag],
    description:
      'Persists one complete owner working set in a single datastore transaction. Temporary draft:* identities are resolved server-side and same-entity references are rewritten before commit. Intended for metadata-driven aggregate/hierarchy workspaces.',
    security: [{ bearerAuth: [] }],
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['entries', 'entriesOriginal'],
            properties: {
              identityField: { type: 'string', default: 'id' },
              entries: { type: 'array', items: { type: 'object', additionalProperties: true } },
              entriesOriginal: {
                type: 'array',
                items: { type: 'object', additionalProperties: true },
              },
            },
          },
        },
      },
    },
    responses: {
      '200': {
        description:
          'Aggregate committed atomically; response contains committed records and draft-to-persisted idMap.',
      },
      '400': { description: 'Invalid aggregate or unresolved/cyclic draft references.' },
      '401': { description: 'Authentication required.' },
      '403': { description: 'Not authorized for one or more requested mutations.' },
    },
  },
});

function platformAuthorizationCapabilitiesSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['platformAccess'],
    properties: {
      platformAccess: { type: 'boolean' },
    },
  };
}

function platformCapabilityOperation() {
  return {
    get: {
      summary: 'Get current platform capabilities',
      description:
        'Returns API-resolved platform capability facts without exposing license rows, principal relationships, role bypass rules, or other authorization-policy inputs.',
      tags: ['System Business Objects'],
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'platformId', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        '200': {
          description: 'Current platform capability projection.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', const: true },
                  data: {
                    type: 'object',
                    properties: {
                      platformId: { type: 'string' },
                      capabilities: {
                        $ref: '#/components/schemas/PlatformAuthorizationCapabilities',
                      },
                    },
                  },
                },
              },
            },
          },
        },
        '401': failureResponse('Authentication required.'),
      },
    },
  };
}

function sysBOAuthorizationCapabilitiesSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['read', 'create', 'update', 'delete'],
    properties: {
      read: { type: 'boolean' },
      create: { type: 'boolean' },
      update: { type: 'boolean' },
      delete: { type: 'boolean' },
    },
  };
}

function sysBOCapabilityPaths(basePath: string, name: string, tag: string) {
  const responseSchema = {
    type: 'object',
    properties: {
      success: { type: 'boolean', const: true },
      data: {
        type: 'object',
        properties: {
          sysBOKey: { type: 'string' },
          scope: { type: 'string', enum: ['collection', 'record'] },
          recordId: { type: 'string' },
          capabilities: { $ref: '#/components/schemas/SysBOAuthorizationCapabilities' },
        },
      },
    },
  };

  return {
    [`${basePath}/$capabilities`]: {
      get: {
        summary: `Get current ${name} collection capabilities`,
        description:
          "Returns the authenticated subject's API-resolved presentation capabilities. The snapshot is advisory only; every later operation is authorized again at execution time.",
        tags: [tag],
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Current collection capability projection.',
            content: { 'application/json': { schema: responseSchema } },
          },
          '401': failureResponse('Authentication required.'),
        },
      },
    },
    [`${basePath}/{id}/$capabilities`]: {
      get: {
        summary: `Get current ${name} record capabilities`,
        description:
          'Resolves record-sensitive capabilities through the same AuthorizationService policy used by CRUD operations. Read authorization is required before the record capability set is returned.',
        tags: [tag],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': {
            description: 'Current record capability projection.',
            content: { 'application/json': { schema: responseSchema } },
          },
          '401': failureResponse('Authentication required.'),
          '403': failureResponse('The record is not readable by this subject.'),
          '404': failureResponse(`${name} not found.`),
        },
      },
    },
  };
}

const genericOperations = (name: string, tag = 'System Business Objects') => ({
  get: {
    summary: `List ${name} entries`,
    description:
      '`includeMetadataUI=true` returns framework-neutral UI metadata and also implies `includeMetadata=true`.',
    tags: [tag],
    parameters: [
      {
        name: 'includeMetadata',
        in: 'query',
        schema: { type: 'boolean' },
        description: 'Include canonical SysBO metadata.',
      },
      {
        name: 'includeMetadataUI',
        in: 'query',
        schema: { type: 'boolean' },
        description: 'Include UI metadata and canonical SysBO metadata.',
      },
    ],
    security: [
      {
        bearerAuth: [],
      },
    ],
    responses: {
      '200': {
        description: 'OK',
      },
      '401': {
        description: 'Authentication required',
      },
      '403': {
        description: 'Not authorized',
      },
    },
  },

  post: {
    summary: `Create ${name}`,
    tags: [tag],
    security: [
      {
        bearerAuth: [],
      },
    ],
    responses: {
      '201': {
        description: 'Created',
      },
      '401': {
        description: 'Authentication required',
      },
      '403': {
        description: 'Not authorized',
      },
      '409': {
        description: 'Unique field conflict',
      },
    },
  },
});

/**
 * Global failure envelope.
 *
 * errorMessage mirrors error.message and is always user-safe.
 * developerMessage, when enabled by API_ERROR_DETAIL_LEVEL=full, remains
 * inside error and is deliberately not mirrored to the root.
 */
function apiFailureSchema() {
  return {
    type: 'object',
    required: ['success', 'errorMessage', 'error'],
    properties: {
      success: {
        type: 'boolean',
        const: false,
      },
      errorMessage: {
        type: 'string',
        description: 'User-safe failure message. Mirrors error.message.',
      },
      error: {
        type: 'object',
        required: ['code', 'message', 'retryable'],
        properties: {
          code: {
            type: 'string',
          },
          message: {
            type: 'string',
          },
          retryable: {
            type: 'boolean',
          },
          developerMessage: {
            type: 'string',
            description: 'Present only when API_ERROR_DETAIL_LEVEL=full.',
          },
          operationTrace: {
            type: 'array',
            description: 'Present when API_ERROR_DETAIL_LEVEL is operations or full.',
            items: {
              type: 'object',
            },
          },
        },
      },
    },
  };
}

function failureResponse(description: string) {
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

/**
 * Explicit Admin command for email verification.
 */
function adminVerifyEmailOperation(tag: string) {
  return {
    post: {
      summary: 'Verify a SysBOUser email as Admin',
      description:
        'Marks the selected SysBOUser email as verified. Requires an authenticated Admin and ADMIN_EMAIL_VERIFICATION_ENABLED=true.',
      tags: [tag],
      security: [
        {
          bearerAuth: [],
        },
      ],
      parameters: [
        {
          name: 'id',
          in: 'path',
          required: true,
          schema: {
            type: 'string',
            format: 'uuid',
          },
        },
      ],
      responses: {
        '200': {
          description: 'Email verified successfully, or was already verified.',
        },
        '401': failureResponse('Authentication required or access token is invalid.'),
        '403': failureResponse(
          'Administrator role required or administrator email verification is disabled.',
        ),
        '404': failureResponse('SysBOUser not found.'),
      },
    },
  };
}

/**
 * Public liveness/health endpoint.
 */
function healthOperation(summary: string) {
  return {
    get: {
      summary,
      tags: ['Server'],
      responses: {
        '200': {
          description: 'Server is healthy.',
        },
        '503': {
          description: 'Server is not healthy or ready.',
        },
      },
    },
  };
}
/**
 * Public readiness endpoint.
 */
function readinessOperation(summary: string) {
  return {
    get: {
      summary,
      tags: ['Server'],
      responses: {
        '200': {
          description: 'Server is ready.',
        },
        '503': {
          description: 'Server is not ready.',
        },
      },
    },
  };
}

function flushDatabaseOperation() {
  return {
    post: {
      summary: 'Flush active database storage',
      description:
        'Forces the current storage adapter to flush its current state to durable persistence where applicable.',
      tags: ['Server'],
      security: [
        {
          bearerAuth: [],
        },
      ],
      responses: {
        '200': {
          description: 'Database flushed successfully.',
        },
        '401': {
          description: 'Authentication required or access token is invalid.',
        },
        '403': {
          description: 'Administrator role required.',
        },
        '503': {
          description: 'Storage persistence operation failed.',
        },
      },
    },
  };
}

function registerOperation() {
  return {
    post: {
      summary: 'Register Guest user',
      tags: ['Authentication'],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['name', 'email', 'password'],
              properties: {
                name: {
                  type: 'string',
                  example: 'newuser',
                },
                email: {
                  type: 'string',
                  format: 'email',
                  example: 'newuser@example.com',
                },
                password: {
                  type: 'string',
                  format: 'password',
                  example: 'Example!123',
                },
              },
            },
          },
        },
      },
      responses: {
        '201': {
          description: 'Guest user registered.',
        },
        '400': failureResponse('Validation failure.'),
        '409': failureResponse('User-name or email already exists.'),
      },
    },
  };
}

function loginOperation() {
  return {
    post: {
      summary: 'Login with email/user-name and password',
      tags: ['Authentication'],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['identity', 'password'],
              properties: {
                identity: {
                  type: 'string',
                  description: 'Unique user-name or email address.',
                  example: 'Admin',
                },
                password: {
                  type: 'string',
                  format: 'password',
                  example: 'admin',
                },
              },
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'Login succeeded and an access token was returned.',
        },
        '401': failureResponse('Invalid credentials.'),
        '403': failureResponse('Account cannot currently log in.'),
      },
    },
  };
}

function logoutOperation() {
  return {
    post: {
      summary: 'Logout current session',
      tags: ['Authentication'],
      security: [
        {
          bearerAuth: [],
        },
      ],
      responses: {
        '200': {
          description: 'Current session logged out successfully.',
        },
        '401': {
          description: 'Authentication required or access token is no longer valid.',
        },
      },
    },
  };
}

function sessionsOperation() {
  return {
    get: {
      summary: 'Get current user active sessions',
      tags: ['Authentication'],
      security: [
        {
          bearerAuth: [],
        },
      ],
      responses: {
        '200': {
          description: 'Active sessions returned.',
        },
        '401': {
          description: 'Authentication required or access token is no longer valid.',
        },
      },
    },
  };
}

function logoutAllOperation() {
  return {
    post: {
      summary: 'Logout all current user sessions',
      tags: ['Authentication'],
      security: [
        {
          bearerAuth: [],
        },
      ],
      responses: {
        '200': {
          description: 'All user sessions logged out successfully.',
        },
        '401': {
          description: 'Authentication required or access token is no longer valid.',
        },
      },
    },
  };
}

function meOperation() {
  return {
    get: {
      summary: 'Get current authenticated user',
      tags: ['Authentication'],
      security: [
        {
          bearerAuth: [],
        },
      ],
      responses: {
        '200': {
          description: 'Current user returned.',
        },
        '401': {
          description: 'Authentication required.',
        },
      },
    },
  };
}

function passwordOperation() {
  return {
    put: {
      summary: 'Change or set current user password',
      tags: ['Authentication'],
      security: [
        {
          bearerAuth: [],
        },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['newPassword'],
              properties: {
                currentPassword: {
                  type: 'string',
                  format: 'password',
                  description: 'Required when the account already has a local password.',
                },
                newPassword: {
                  type: 'string',
                  format: 'password',
                  example: 'NewPassword!123',
                },
              },
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'Password changed successfully.',
        },
        '400': {
          description: 'Password validation failed.',
        },
        '401': {
          description: 'Authentication or current password verification failed.',
        },
      },
    },
  };
}

function sysBOConfigurationsOperation() {
  return {
    get: {
      summary: 'List application configuration (Admin)',
      tags: ['System Configuration'],
      description:
        'Access: Admin only (Bearer token). Returns persisted runtime configuration using safe projections; encrypted secret material is never returned.',
      security: [{ bearerAuth: [] }],
      responses: {
        '200': { description: 'Safe configuration values; encrypted material is never returned.' },
        '403': { description: 'Admin access required.' },
      },
    },
  };
}
function sysBOConfigurationValueOperation() {
  return {
    patch: {
      summary: 'Update one application configuration value (Admin)',
      tags: ['System Configuration'],
      description:
        'Access: Admin only (Bearer token). Updates one Admin-maintainable runtime setting. Sensitive values are accepted for secure storage but never returned as plaintext.',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { type: 'object', properties: { value: { type: ['string', 'null'] } } },
          },
        },
      },
      responses: {
        '200': { description: 'Configuration updated.' },
        '403': { description: 'Admin access required.' },
      },
    },
  };
}
