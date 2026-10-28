import { failureResponse } from './common.js';

/** The native app sees only these three API operations. Browser callback/approval
 * routes deliberately remain separate from this public JSON client contract. */
const proofError = {
  '400': failureResponse('Invalid native OAuth request or proof syntax.'),
  '404': failureResponse('Unknown attempt or invalid proof.'),
  '409': failureResponse('Attempt was already redeemed.'),
  '410': failureResponse('Attempt was cancelled or expired.'),
  '429': failureResponse('Authentication rate limit exceeded.'),
  '503': failureResponse('Authentication provider or service unavailable.'),
};

export function nativeOAuthStartOperation() {
  return {
    post: {
      tags: ['Authentication'],
      summary: 'Start API-brokered OAuth sign-in from a native ManatOS client',
      description:
        'Anonymous. Returns an API-owned browser URL, opaque attempt ID, expiry, polling interval and eight-digit app confirmation code. The installed client must generate and retain the native verifier. Requires API_PUBLIC_BASE_URL and verified provider configuration.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['provider', 'challenge'],
              properties: {
                provider: { type: 'string', enum: ['google', 'microsoft', 'github', 'facebook'] },
                challenge: {
                  type: 'string',
                  description:
                    'Canonical base64url SHA-256 digest of native verifier (43 characters).',
                },
                clientName: { type: 'string', maxLength: 80 },
              },
            },
          },
        },
      },
      responses: {
        '201': {
          description:
            'Native authentication started; data includes attemptId, authorizationUrl, expiresAt, pollAfterSeconds, confirmationCode.',
        },
        ...proofError,
      },
    },
  };
}

export function nativeOAuthClaimOperation() {
  return {
    post: {
      tags: ['Authentication'],
      summary: 'Poll and atomically claim one completed native OAuth session',
      description:
        'Every poll proves possession of the original native verifier. HTTP 202 remains pending until explicit browser approval. HTTP 200 returns the same API session object as password login. The attempt is then terminal.',
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['verifier'],
              properties: {
                verifier: {
                  type: 'string',
                  description: 'Original high-entropy native verifier; never sent in a URL.',
                },
              },
            },
          },
        },
      },
      responses: {
        '200': { description: 'One-time ordinary API Bearer session.' },
        '202': { description: 'Pending provider authentication or browser confirmation.' },
        ...proofError,
      },
    },
  };
}

export function nativeOAuthCancelOperation() {
  return {
    delete: {
      tags: ['Authentication'],
      summary: 'Cancel an unredeemed native OAuth attempt',
      description:
        'Authorization proof is supplied in X-Native-OAuth-Verifier, not a URL or DELETE body. This cannot revoke an already issued API session; use ordinary logout.',
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        {
          name: 'X-Native-OAuth-Verifier',
          in: 'header',
          required: true,
          schema: { type: 'string' },
        },
      ],
      responses: { '204': { description: 'Attempt cancelled.' }, ...proofError },
    },
  };
}
