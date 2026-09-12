import { allSysBOMetadata, type SysBOFieldMetadata, type SysBOMetadata } from '@manatos/shared';

const fieldSchema = (field: SysBOFieldMetadata): Record<string, unknown> => {
  switch (field.type) {
    case 'boolean':
      return { type: 'boolean' };
    case 'number':
      return { type: 'number' };
    case 'guid':
      return { type: 'string', format: 'uuid' };
    case 'email':
      return { type: 'string', format: 'email' };
    case 'date':
      return { type: 'string', format: 'date' };
    case 'datetime':
      return { type: 'string', format: 'date-time' };
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
      return { type: 'string', enum: field.enumValues };
    case 'picture':
      return {
        type: ['object', 'null'],
        description:
          'Picture metadata. Binary bytes are transferred through the $picture resource.',
      };
    case 'pictures':
      return {
        type: ['array', 'null'],
        description:
          'Ordered picture metadata. Binary bytes are transferred through the $pictures resource.',
        items: { type: 'object', additionalProperties: true },
      };
    default:
      return { type: 'string' };
  }
};

const businessObjectSchema = (metadata: SysBOMetadata<unknown>) => {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const field of Object.values(metadata.fieldDefinition)) {
    if (field.sensitive) continue;
    properties[field.key] = {
      ...fieldSchema(field),
      ...(field.readOnly || field.generated ? { readOnly: true } : {}),
    };
    if (field.required && !field.generated) required.push(field.key);
  }

  if (metadata.key === 'sys-users') properties.hasPassword = { type: 'boolean' };

  return { type: 'object', properties, required };
};

export function businessObjectSchemas() {
  const schemas: Record<string, unknown> = {};
  for (const metadata of Object.values(allSysBOMetadata)) {
    schemas[metadata.name] = businessObjectSchema(metadata as SysBOMetadata<unknown>);
  }
  return schemas;
}

export function apiFailureSchema() {
  return {
    type: 'object',
    required: ['success', 'errorMessage', 'error'],
    properties: {
      success: { type: 'boolean', const: false },
      errorMessage: {
        type: 'string',
        description: 'User-safe failure message. Mirrors error.message.',
      },
      error: {
        type: 'object',
        required: ['code', 'message', 'retryable'],
        properties: {
          code: { type: 'string' },
          message: { type: 'string' },
          retryable: { type: 'boolean' },
          developerMessage: {
            type: 'string',
            description: 'Present only when API_ERROR_DETAIL_LEVEL=full.',
          },
          operationTrace: {
            type: 'array',
            description: 'Present when API_ERROR_DETAIL_LEVEL is operations or full.',
            items: { type: 'object' },
          },
        },
      },
    },
  };
}

export function sysBOAuthorizationCapabilitiesSchema() {
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

export function platformAuthorizationCapabilitiesSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['platformAccess'],
    properties: { platformAccess: { type: 'boolean' } },
  };
}
