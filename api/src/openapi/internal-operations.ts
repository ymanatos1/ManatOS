import { failureResponse } from './common.js';

const internalKeyOnly = [{ internalApiKey: [] }];
const internalAdmin = [{ bearerAuth: [], internalApiKey: [] }];

export function internalAuthVerifyLocalOperation() {
  return {
    post: {
      summary: 'Verify local credentials without creating a login session',
      tags: ['Internal API'],
      'x-manatos-access': 'Trusted UI/BFF; x-internal-api-key',
      security: internalKeyOnly,
      responses: {
        '200': { description: 'Credential verification result returned.' },
        '400': failureResponse('Invalid verification request.'),
        '401': failureResponse('Internal API key required.'),
      },
    },
  };
}

export function internalAuthLookupOperation() {
  return internalOperation(
    'get',
    'Look up one authentication identity',
    'Authentication identity result returned.',
  );
}

export function internalRegisterExternalOperation() {
  return internalOperation(
    'post',
    'Register a user from a trusted external identity',
    'External user registration completed.',
  );
}

export function internalSessionOperation() {
  return internalOperation(
    'post',
    'Create an API session for a trusted authenticated identity',
    'API session created.',
  );
}

export function internalExternalIdentityResolveOperation() {
  return internalOperation(
    'get',
    'Resolve an external identity',
    'External identity resolution returned.',
  );
}

export function internalUserExternalIdentitiesOperation() {
  return {
    get: internalMethod(
      'List external identities linked to one user',
      'External identities returned.',
    ),
    post: internalMethod('Link an external identity to one user', 'External identity linked.'),
  };
}

export function internalUserPasswordOperation() {
  return {
    put: internalMethod('Set one user local password', 'User password updated.'),
  };
}

export function internalUserEmailVerifiedOperation() {
  return {
    put: internalMethod(
      'Set one user email verification state',
      'User email verification updated.',
    ),
  };
}

export function internalEmailOperation(summary: string) {
  return {
    post: internalMethod(summary, 'Email workflow request accepted.'),
  };
}

export function internalExternalAuthRuntimeOperation() {
  return {
    get: {
      ...internalMethod(
        'Get runtime-usable external authentication providers',
        'Runtime provider state returned.',
      ),
      tags: ['Internal External Authentication Workflow'],
    },
  };
}

export function internalAdminMethodOperation(
  method: 'get' | 'post' | 'delete',
  summary: string,
  success: string,
) {
  return {
    [method]: {
      summary,
      tags: ['Internal External Authentication Workflow'],
      'x-manatos-access': 'Internal UI/BFF; Admin Bearer + x-internal-api-key',
      security: internalAdmin,
      responses: {
        '200': { description: success },
        '400': failureResponse('Request validation failed.'),
        '401': failureResponse('Authentication/internal key required.'),
        '403': failureResponse('Administrator role required.'),
        '409': failureResponse('Requested state changed while the operation was in progress.'),
      },
    },
  };
}

function internalOperation(method: 'get' | 'post', summary: string, success: string) {
  return { [method]: internalMethod(summary, success) };
}

function internalMethod(summary: string, success: string) {
  return {
    summary,
    tags: ['Internal API'],
    'x-manatos-access': 'Trusted UI/BFF; x-internal-api-key',
    security: internalKeyOnly,
    responses: {
      '200': { description: success },
      '400': failureResponse('Request validation failed.'),
      '401': failureResponse('Internal API key required.'),
      '404': failureResponse('Requested resource not found.'),
    },
  };
}
