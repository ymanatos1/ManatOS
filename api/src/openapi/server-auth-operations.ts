import { failureResponse } from './common.js';

export function healthOperation(summary: string) {
  return {
    get: {
      summary,
      tags: ['Server'],
      responses: {
        '200': { description: 'Server is healthy.' },
        '503': { description: 'Server is not healthy or ready.' },
      },
    },
  };
}

export function readinessOperation(summary: string) {
  return {
    get: {
      summary,
      tags: ['Server'],
      responses: {
        '200': { description: 'Server is ready.' },
        '503': { description: 'Server is not ready.' },
      },
    },
  };
}

export function flushDatabaseOperation() {
  return {
    post: {
      summary: 'Flush active database storage',
      description:
        'Forces the current storage adapter to flush its current state to durable persistence where applicable.',
      tags: ['Server'],
      security: [{ bearerAuth: [] }],
      responses: {
        '200': { description: 'Database flushed successfully.' },
        '401': failureResponse('Authentication required or access token is invalid.'),
        '403': failureResponse('Administrator role required.'),
        '503': failureResponse('Storage persistence operation failed.'),
      },
    },
  };
}

export function registerOperation() {
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
                name: { type: 'string', example: 'newuser' },
                email: { type: 'string', format: 'email', example: 'newuser@example.com' },
                password: { type: 'string', format: 'password', example: 'Example!123' },
              },
            },
          },
        },
      },
      responses: {
        '201': { description: 'Guest user registered.' },
        '400': failureResponse('Validation failure.'),
        '409': failureResponse('User-name or email already exists.'),
      },
    },
  };
}

export function loginOperation() {
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
                password: { type: 'string', format: 'password', example: 'admin' },
              },
            },
          },
        },
      },
      responses: {
        '200': { description: 'Login succeeded and an access token was returned.' },
        '401': failureResponse('Invalid credentials.'),
        '403': failureResponse('Account cannot currently log in.'),
      },
    },
  };
}

export function logoutOperation() {
  return authenticatedAuthOperation(
    'post',
    'Logout current session',
    'Current session logged out successfully.',
  );
}

export function sessionsOperation() {
  return authenticatedAuthOperation(
    'get',
    'Get current user active sessions',
    'Active sessions returned.',
  );
}

export function logoutAllOperation() {
  return authenticatedAuthOperation(
    'post',
    'Logout all current user sessions',
    'All user sessions logged out successfully.',
  );
}

export function meOperation() {
  return authenticatedAuthOperation(
    'get',
    'Get current authenticated user',
    'Current user returned.',
  );
}

function authenticatedAuthOperation(method: 'get' | 'post', summary: string, success: string) {
  return {
    [method]: {
      summary,
      tags: ['Authentication'],
      security: [{ bearerAuth: [] }],
      responses: {
        '200': { description: success },
        '401': failureResponse('Authentication required or access token is no longer valid.'),
      },
    },
  };
}

export function passwordOperation() {
  return {
    put: {
      summary: 'Change or set current user password',
      tags: ['Authentication'],
      security: [{ bearerAuth: [] }],
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
                newPassword: { type: 'string', format: 'password', example: 'NewPassword!123' },
              },
            },
          },
        },
      },
      responses: {
        '200': { description: 'Password changed successfully.' },
        '400': failureResponse('Password validation failed.'),
        '401': failureResponse('Authentication or current password verification failed.'),
      },
    },
  };
}
