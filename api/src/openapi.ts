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

    properties[field.key] = fieldSchema(field);

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
      schemas,

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

      '/ready': healthOperation('Readiness check'),

      /**
       * Authentication.
       */
      '/api/v1/auth/register': registerOperation(),

      '/api/v1/auth/login': loginOperation(),

      '/api/v1/auth/logout': logoutOperation(),

      '/api/v1/auth/me': meOperation(),

      '/api/v1/auth/password': passwordOperation(),

      /**
       * Protected SysBO resources.
       */
      '/api/v1/SysUsers': genericOperations('SysUser'),

      '/api/v1/SysPrincipals': genericOperations('SysPrincipal'),

      '/api/v1/SysApplications': genericOperations('SysApplication'),

      '/api/v1/SysLicenses': genericOperations('SysLicense'),
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
 * Public health/readiness endpoint.
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
        '400': {
          description: 'Validation failure.',
        },
        '409': {
          description: 'User-name or email already exists.',
        },
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
        '401': {
          description: 'Invalid credentials.',
        },
        '403': {
          description: 'Account cannot currently log in.',
        },
      },
    },
  };
}

function logoutOperation() {
  return {
    post: {
      summary: 'Logout and revoke current access token',
      tags: ['Authentication'],
      security: [
        {
          bearerAuth: [],
        },
      ],
      responses: {
        '204': {
          description: 'Logged out successfully.',
        },
        '401': {
          description: 'Authentication required.',
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
