import { failureResponse } from './common.js';
import { genericOperations } from './sysbo-operations.js';

export function uiBootstrapOperation() {
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

export function publicExternalAuthProvidersOperation() {
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

export function externalAuthProviderDefinitionsOperation() {
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

export function verifiedExternalAuthCredentialsOperation() {
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

export function storedExternalAuthCredentialsOperation() {
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

export function storedExternalAuthCredentialsForTestOperation() {
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

export function markStoredExternalAuthCredentialsVerifiedOperation() {
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

export function removeExternalAuthCredentialsOperation() {
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

export function externalAuthProviderOperations() {
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

export function externalAuthProviderItemOperations() {
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
