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
        format: 'date-time',
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
   * SysUser exposes password existence rather than passwordHash.
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
      title: 'ManatOS System API',

      version: '0.1.0',

      description: 'Metadata-driven versioned REST API.',
    },

    components: {
      schemas: {
        ...schemas,

        ApiFailure: apiFailureSchema(),
      },

      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'Opaque',
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

      /**
       * Protected SysBO resources.
       */
      '/api/v1/SysUsers': genericOperations('SysUser'),

      '/api/v1/SysUsers/{id}/verify-email': adminVerifyEmailOperation(),

      '/api/v1/SysPrincipals': genericOperations('SysPrincipal'),

      '/api/v1/SysApplications': genericOperations('SysApplication'),

      '/api/v1/SysLicenses': genericOperations('SysLicense'),

      '/api/v1/SysExtAuthProviders': externalAuthProviderOperations(),

      '/api/v1/SysExtAuthProviders/definitions': externalAuthProviderDefinitionsOperation(),

      '/api/v1/SysConfigurations': sysConfigurationsOperation(),

      '/api/v1/SysConfigurations/{id}/value': sysConfigurationValueOperation(),

      '/api/v1/internal/external-auth-providers/verified-credentials': verifiedExternalAuthCredentialsOperation(),

      '/api/v1/internal/external-auth-providers/{id}/credentials': removeExternalAuthCredentialsOperation(),
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
          description: 'Current public UI bootstrap data, including server availability and API/implementation versions. The UI may safely fall back to local defaults and retry when unavailable.',
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
        'Returns only anonymous-safe provider availability metadata. Client IDs, client secrets, encrypted values and Admin/audit fields are never included.',
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
        'Admin-only provider metadata including fixed callback paths, provider icons, scopes and setup guidance. Contains no persisted credentials.',
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
      description: 'Trusted UI command. Requires both the internal API key and an authenticated Admin Bearer token. The UI calls this only after the real provider OAuth flow succeeds.',
      tags: ['External Authentication', 'Internal'],
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

function removeExternalAuthCredentialsOperation() {
  return {
    delete: {
      summary: 'Remove external-provider credentials and disable provider',
      tags: ['External Authentication', 'Internal'],
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
  return {
    get: genericOperations('SysExtAuthProvider').get,
    post: {
      summary: 'Create SysExtAuthProvider',
      description:
        'Creates one provider configuration. callbackPath is generated from the provider definition and any non-default override is rejected.',
      tags: ['System Business Objects', 'External Authentication'],
      security: [{ bearerAuth: [] }],
      responses: {
        '201': { description: 'Created with the provider-defined callback path.' },
        '400': failureResponse('Validation failure, including an attempted callback-path override.'),
        '401': failureResponse('Authentication required.'),
        '403': failureResponse('Administrator role required.'),
        '409': failureResponse('That provider already has a configuration record.'),
      },
    },
  };
}

/**
 * Standard OpenAPI operations currently shared by generic SysBO
 * collection endpoints.
 */
const genericOperations = (name: string) => ({
  get: {
    summary: `List ${name} entries`,
    tags: ['System Business Objects'],
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
    tags: ['System Business Objects'],
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
function adminVerifyEmailOperation() {
  return {
    post: {
      summary: 'Verify a SysUser email as Admin',
      description:
        'Marks the selected SysUser email as verified. Requires an authenticated Admin and ADMIN_EMAIL_VERIFICATION_ENABLED=true.',
      tags: ['System Business Objects'],
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
        '404': failureResponse('SysUser not found.'),
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

function sysConfigurationsOperation() {
  return { get: { summary:'List application configuration (Admin)', security:[{bearerAuth:[]}], responses:{ '200':{description:'Safe configuration values; encrypted material is never returned.'}, '403':{description:'Admin access required.'} } } };
}
function sysConfigurationValueOperation() {
  return { patch: { summary:'Update one application configuration value (Admin)', security:[{bearerAuth:[]}], parameters:[{name:'id',in:'path',required:true,schema:{type:'string'}}], requestBody:{required:true,content:{'application/json':{schema:{type:'object',properties:{value:{type:['string','null']}}}}}}, responses:{'200':{description:'Configuration updated.'},'403':{description:'Admin access required.'}} } };
}
