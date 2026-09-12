import { failureResponse } from './common.js';

export const sysBOUIMetadataOperation = (name: string, tag: string) => ({
  get: {
    summary: `Get ${name} UI metadata`,
    description:
      'Read-only framework-neutral UI contract for EJS and future Angular/React/mobile clients.',
    tags: [tag],
    security: [{ bearerAuth: [] }],
    responses: {
      '200': { description: 'UI metadata returned.' },
      '401': failureResponse('Authentication required.'),
      '404': failureResponse('UI metadata not defined for this SysBO.'),
    },
  },
});

export const sysBOMetadataOperation = (name: string, tag: string) => ({
  get: {
    summary: `Get ${name} canonical metadata`,
    description: 'Returns UI-neutral canonical SysBO metadata for this business object.',
    tags: [tag],
    security: [{ bearerAuth: [] }],
    responses: {
      '200': { description: 'Canonical metadata returned.' },
      '401': failureResponse('Authentication required.'),
      '403': failureResponse('Not authorized.'),
    },
  },
});

export const expressionFunctionOperation = () => ({
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
      '400': failureResponse('Unknown/non-delegable function or invalid arguments.'),
      '401': failureResponse('Authentication required.'),
      '403': failureResponse('Resolver access to a referenced entity is not authorized.'),
    },
  },
});

export const aggregateCommitOperation = (name: string, tag = 'System Business Objects') => ({
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
      '400': failureResponse('Invalid aggregate or unresolved/cyclic draft references.'),
      '401': failureResponse('Authentication required.'),
      '403': failureResponse('Not authorized for one or more requested mutations.'),
    },
  },
});

export function platformCapabilityOperation() {
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

export function sysBOCapabilityPaths(basePath: string, name: string, tag: string) {
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
        parameters: [idParameter()],
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

export const genericOperations = (name: string, tag = 'System Business Objects') => ({
  get: {
    summary: `List ${name} entries`,
    description:
      'Lists authorized records with storage-level filtering, sorting and paging. includeMetadataUI=true also implies includeMetadata=true.',
    tags: [tag],
    parameters: [
      { name: 'filterField', in: 'query', schema: { type: 'string' } },
      { name: 'filterValue', in: 'query', schema: { type: 'string' } },
      { name: 'sortBy', in: 'query', schema: { type: 'string' } },
      { name: 'sortDir', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'] } },
      { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1 } },
      { name: 'pageSize', in: 'query', schema: { type: 'integer', minimum: 1 } },
      {
        name: 'listExceptions',
        in: 'query',
        schema: { type: 'string' },
        description:
          'Canonical exclude-when-true predicate passed through to storage before paging.',
      },
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
    security: [{ bearerAuth: [] }],
    responses: {
      '200': { description: 'Authorized list returned.' },
      '401': failureResponse('Authentication required.'),
      '403': failureResponse('Not authorized.'),
    },
  },
  post: {
    summary: `Create ${name}`,
    tags: [tag],
    security: [{ bearerAuth: [] }],
    responses: {
      '201': { description: 'Created.' },
      '400': failureResponse('Validation failure.'),
      '401': failureResponse('Authentication required.'),
      '403': failureResponse('Not authorized.'),
      '409': failureResponse('Unique field conflict.'),
    },
  },
});

export function genericItemOperations(name: string, tag = 'System Business Objects') {
  const parameters = [idParameter()];
  const common = {
    tags: [tag],
    security: [{ bearerAuth: [] }],
    parameters,
  };
  return {
    get: {
      ...common,
      summary: `Get ${name} by id`,
      responses: standardItemResponses(name, 'returned'),
    },
    put: {
      ...common,
      summary: `Update ${name}`,
      description: 'PUT currently uses the same partial-update behavior as PATCH.',
      responses: standardItemResponses(name, 'updated'),
    },
    patch: {
      ...common,
      summary: `Patch ${name}`,
      responses: standardItemResponses(name, 'updated'),
    },
    delete: {
      ...common,
      summary: `Delete ${name}`,
      responses: {
        '200': { description: `${name} deleted.` },
        '401': failureResponse('Authentication required.'),
        '403': failureResponse('Not authorized.'),
        '404': failureResponse(`${name} not found.`),
      },
    },
  };
}

export function deleteImpactOperation(name: string, tag = 'System Business Objects') {
  return {
    get: {
      summary: `Preview ${name} delete impact`,
      description:
        'Read-only metadata-driven preflight. The server recalculates relationship consequences when DELETE executes.',
      tags: [tag],
      security: [{ bearerAuth: [] }],
      parameters: [idParameter()],
      responses: {
        '200': { description: 'Delete authorization and relationship impact returned.' },
        '401': failureResponse('Authentication required.'),
        '403': failureResponse('The record is not readable by this subject.'),
        '404': failureResponse(`${name} not found.`),
      },
    },
  };
}

export function pictureOperations(name: string, tag = 'System Business Objects') {
  const parameters = [idParameter(), fieldParameter()];
  return {
    get: {
      summary: `Read ${name} picture bytes`,
      tags: [tag],
      security: [{ bearerAuth: [] }],
      parameters,
      responses: {
        '200': {
          description: 'Picture bytes.',
          content: {
            'image/jpeg': {},
            'image/png': {},
            'image/webp': {},
            'image/gif': {},
          },
        },
        '401': failureResponse('Authentication required.'),
        '403': failureResponse('Not authorized.'),
        '404': { description: 'Record, picture field or picture not found.' },
      },
    },
    put: {
      summary: `Replace ${name} picture`,
      tags: [tag],
      security: [{ bearerAuth: [] }],
      parameters,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['contentType', 'dataBase64'],
              properties: {
                contentType: {
                  type: 'string',
                  enum: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
                },
                dataBase64: { type: 'string', format: 'byte' },
              },
            },
          },
        },
      },
      responses: {
        '200': { description: 'Picture saved.' },
        '400': failureResponse('Invalid picture field or payload.'),
        '401': failureResponse('Authentication required.'),
        '403': failureResponse('Not authorized.'),
        '404': failureResponse(`${name} not found.`),
      },
    },
    delete: {
      summary: `Clear ${name} picture`,
      tags: [tag],
      security: [{ bearerAuth: [] }],
      parameters,
      responses: {
        '200': { description: 'Picture cleared.' },
        '401': failureResponse('Authentication required.'),
        '403': failureResponse('Not authorized.'),
        '404': failureResponse(`${name} not found.`),
      },
    },
  };
}

export function picturesOperations(name: string, tag = 'System Business Objects') {
  return {
    get: {
      summary: `Read one ${name} picture-collection item`,
      tags: [tag],
      security: [{ bearerAuth: [] }],
      parameters: [idParameter(), fieldParameter(), pictureIdParameter()],
      responses: {
        '200': {
          description: 'Picture bytes.',
          content: {
            'image/jpeg': {},
            'image/png': {},
            'image/webp': {},
            'image/gif': {},
          },
        },
        '401': failureResponse('Authentication required.'),
        '403': failureResponse('Not authorized.'),
        '404': { description: 'Record, picture field or picture item not found.' },
      },
    },
  };
}

export function picturesCollectionOperation(name: string, tag = 'System Business Objects') {
  return {
    put: {
      summary: `Replace ordered ${name} picture collection`,
      tags: [tag],
      security: [{ bearerAuth: [] }],
      parameters: [idParameter(), fieldParameter()],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['changed', 'pictures'],
              properties: {
                changed: { type: 'boolean' },
                pictures: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      contentType: {
                        type: 'string',
                        enum: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
                      },
                      dataBase64: { type: 'string', format: 'byte' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      responses: {
        '200': { description: 'Pictures saved or unchanged.' },
        '400': failureResponse('Invalid picture collection field or payload.'),
        '401': failureResponse('Authentication required.'),
        '403': failureResponse('Not authorized.'),
        '404': failureResponse(`${name} not found.`),
      },
    },
  };
}

export function genericSysBOPaths(
  basePath: string,
  name: string,
  tag = 'System Business Objects',
  options: { uiMetadata?: boolean; aggregateCommit?: boolean } = {},
) {
  return {
    [basePath]: genericOperations(name, tag),
    [`${basePath}/$metadata`]: sysBOMetadataOperation(name, tag),
    ...(options.uiMetadata === false
      ? {}
      : { [`${basePath}/$metadata-ui`]: sysBOUIMetadataOperation(name, tag) }),
    ...sysBOCapabilityPaths(basePath, name, tag),
    [`${basePath}/{id}`]: genericItemOperations(name, tag),
    [`${basePath}/{id}/$delete-impact`]: deleteImpactOperation(name, tag),
    [`${basePath}/{id}/$picture/{field}`]: pictureOperations(name, tag),
    [`${basePath}/{id}/$pictures/{field}`]: picturesCollectionOperation(name, tag),
    [`${basePath}/{id}/$pictures/{field}/{pictureId}`]: picturesOperations(name, tag),
    ...(options.aggregateCommit
      ? { [`${basePath}/$aggregate-commit`]: aggregateCommitOperation(name, tag) }
      : {}),
  };
}

export function adminVerifyEmailOperation(tag: string) {
  return {
    post: {
      summary: 'Verify a SysBOUser email as Admin',
      description:
        'Marks the selected SysBOUser email as verified. Requires an authenticated Admin and ADMIN_EMAIL_VERIFICATION_ENABLED=true.',
      tags: [tag],
      security: [{ bearerAuth: [] }],
      parameters: [idParameter()],
      responses: {
        '200': { description: 'Email verified successfully, or was already verified.' },
        '401': failureResponse('Authentication required or access token is invalid.'),
        '403': failureResponse(
          'Administrator role required or administrator email verification is disabled.',
        ),
        '404': failureResponse('SysBOUser not found.'),
      },
    },
  };
}

function idParameter() {
  return { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } };
}

function fieldParameter() {
  return { name: 'field', in: 'path', required: true, schema: { type: 'string' } };
}

function pictureIdParameter() {
  return { name: 'pictureId', in: 'path', required: true, schema: { type: 'string' } };
}

function standardItemResponses(name: string, verb: string) {
  return {
    '200': { description: `${name} ${verb}.` },
    '400': failureResponse('Validation failure.'),
    '401': failureResponse('Authentication required.'),
    '403': failureResponse('Not authorized.'),
    '404': failureResponse(`${name} not found.`),
    '409': failureResponse('Unique field conflict.'),
  };
}
