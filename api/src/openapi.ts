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
    },

    paths: {
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

    responses: {
      '200': {
        description: 'OK',
      },
    },
  },

  post: {
    summary: `Create ${name}`,

    responses: {
      '201': {
        description: 'Created',
      },

      '409': {
        description: 'Unique field conflict',
      },
    },
  },
});
