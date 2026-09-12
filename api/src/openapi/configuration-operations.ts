import { failureResponse } from './common.js';

export function sysBOConfigurationsOperation() {
  return {
    get: {
      summary: 'List application configuration (Admin)',
      tags: ['System Configuration'],
      description:
        'Access: Admin only (Bearer token). Returns persisted runtime configuration using safe projections; encrypted secret material is never returned.',
      security: [{ bearerAuth: [] }],
      responses: {
        '200': { description: 'Safe configuration values; encrypted material is never returned.' },
        '401': failureResponse('Authentication required.'),
        '403': failureResponse('Admin access required.'),
      },
    },
  };
}

export function sysBOConfigurationValueOperation() {
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
        '401': failureResponse('Authentication required.'),
        '403': failureResponse('Admin access required.'),
      },
    },
  };
}
