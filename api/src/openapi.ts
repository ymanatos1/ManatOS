import { openApiSecuritySchemes, openApiTags } from './openapi/common.js';
import {
  sysBOConfigurationValueOperation,
  sysBOConfigurationsOperation,
} from './openapi/configuration-operations.js';
import {
  externalAuthProviderDefinitionsOperation,
  externalAuthProviderItemOperations,
  externalAuthProviderOperations,
  markStoredExternalAuthCredentialsVerifiedOperation,
  publicExternalAuthProvidersOperation,
  removeExternalAuthCredentialsOperation,
  storedExternalAuthCredentialsForTestOperation,
  storedExternalAuthCredentialsOperation,
  uiBootstrapOperation,
  verifiedExternalAuthCredentialsOperation,
} from './openapi/external-auth-operations.js';
import {
  internalAuthLookupOperation,
  internalAuthVerifyLocalOperation,
  internalEmailOperation,
  internalExternalAuthRuntimeOperation,
  internalExternalIdentityResolveOperation,
  internalRegisterExternalOperation,
  internalSessionOperation,
  internalUserEmailVerifiedOperation,
  internalUserExternalIdentitiesOperation,
  internalUserPasswordOperation,
} from './openapi/internal-operations.js';
import {
  healthOperation,
  flushDatabaseOperation,
  loginOperation,
  logoutAllOperation,
  logoutOperation,
  meOperation,
  passwordOperation,
  readinessOperation,
  registerOperation,
  sessionsOperation,
} from './openapi/server-auth-operations.js';
import {
  apiFailureSchema,
  businessObjectSchemas,
  platformAuthorizationCapabilitiesSchema,
  sysBOAuthorizationCapabilitiesSchema,
} from './openapi/schemas.js';
import {
  adminVerifyEmailOperation,
  expressionFunctionOperation,
  genericSysBOPaths,
  platformCapabilityOperation,
} from './openapi/sysbo-operations.js';

/**
 * Build the OpenAPI 3.1 specification from responsibility-focused operation modules.
 * The composer is deliberately small: route-family modules own endpoint detail while
 * this file owns the externally visible API topology.
 */
export function buildOpenApiSpec() {
  const standardSysBOs = [
    {
      path: '/api/v1/SysPrincipals',
      name: 'Principal',
      tag: 'SysBO / Principals',
      uiMetadata: true,
      aggregateCommit: true,
    },
    {
      path: '/api/v1/SysEmailAddresses',
      name: 'Email address',
      tag: 'SysBO Aux / Email Addresses',
      uiMetadata: false,
      aggregateCommit: true,
    },
    {
      path: '/api/v1/SysPrincipalEmailAddresses',
      name: 'Principal email address',
      tag: 'SysBO Aux / Principal Email Addresses',
      uiMetadata: false,
      aggregateCommit: true,
    },
    {
      path: '/api/v1/SysTelephoneNumbers',
      name: 'Telephone number',
      tag: 'SysBO Aux / Telephone Numbers',
      uiMetadata: false,
      aggregateCommit: true,
    },
    {
      path: '/api/v1/SysPrincipalTelephoneNumbers',
      name: 'Principal telephone number',
      tag: 'SysBO Aux / Principal Telephone Numbers',
      uiMetadata: false,
      aggregateCommit: true,
    },
    {
      path: '/api/v1/SysAddresses',
      name: 'Address',
      tag: 'SysBO Aux / Addresses',
      uiMetadata: false,
      aggregateCommit: true,
    },
    {
      path: '/api/v1/SysPrincipalAddresses',
      name: 'Principal address',
      tag: 'SysBO Aux / Principal Addresses',
      uiMetadata: false,
      aggregateCommit: true,
    },
    {
      path: '/api/v1/SysApplications',
      name: 'Application',
      tag: 'SysBO / Applications',
      uiMetadata: true,
      aggregateCommit: true,
    },
    {
      path: '/api/v1/SysLicenses',
      name: 'License',
      tag: 'SysBO / Licenses',
      uiMetadata: true,
      aggregateCommit: true,
    },
  ] as const;

  const standardSysBOPaths = Object.assign(
    {},
    ...standardSysBOs.map((definition) =>
      genericSysBOPaths(definition.path, definition.name, definition.tag, {
        uiMetadata: definition.uiMetadata,
        aggregateCommit: definition.aggregateCommit,
      }),
    ),
  );

  const userPaths = genericSysBOPaths('/api/v1/SysUsers', 'User', 'SysBO / Users', {
    uiMetadata: true,
    aggregateCommit: false,
  });

  const extAuthGenericPaths = genericSysBOPaths(
    '/api/v1/SysExtAuthProviders',
    'External authentication provider',
    'External Authentication',
    { uiMetadata: true, aggregateCommit: false },
  );

  return {
    openapi: '3.1.0',
    info: {
      title: 'ManatOS Multi-Platform API',
      version: '0.1.0',
      description:
        'Metadata-driven versioned REST API. Swagger/OpenAPI is the executable endpoint-level reference for public, protected and trusted internal API families.',
    },
    tags: openApiTags,
    components: {
      schemas: {
        ...businessObjectSchemas(),
        ApiFailure: apiFailureSchema(),
        SysBOAuthorizationCapabilities: sysBOAuthorizationCapabilitiesSchema(),
        PlatformAuthorizationCapabilities: platformAuthorizationCapabilitiesSchema(),
      },
      securitySchemes: openApiSecuritySchemes,
    },
    paths: {
      '/health': healthOperation('Health check'),
      '/ready': readinessOperation('Readiness check'),
      '/flush-db': flushDatabaseOperation(),

      '/api/v1/auth/register': registerOperation(),
      '/api/v1/auth/login': loginOperation(),
      '/api/v1/auth/logout': logoutOperation(),
      '/api/v1/auth/logout-all': logoutAllOperation(),
      '/api/v1/auth/me': meOperation(),
      '/api/v1/auth/sessions': sessionsOperation(),
      '/api/v1/auth/password': passwordOperation(),

      '/api/v1/public/ui-bootstrap': uiBootstrapOperation(),
      '/api/v1/public/external-auth-providers': publicExternalAuthProvidersOperation(),
      '/api/v1/platforms/{platformId}/$capabilities': platformCapabilityOperation(),
      '/api/v1/expressions/evaluate-function': expressionFunctionOperation(),

      ...userPaths,
      '/api/v1/SysUsers/{id}/verify-email': adminVerifyEmailOperation('SysBO / Users'),
      ...standardSysBOPaths,

      ...extAuthGenericPaths,
      '/api/v1/SysExtAuthProviders': externalAuthProviderOperations(),
      '/api/v1/SysExtAuthProviders/{id}': externalAuthProviderItemOperations(),
      '/api/v1/SysExtAuthProviders/definitions': externalAuthProviderDefinitionsOperation(),

      '/api/v1/SysConfigurations': sysBOConfigurationsOperation(),
      '/api/v1/SysConfigurations/{id}/value': sysBOConfigurationValueOperation(),

      '/api/v1/internal/auth/verify-local': internalAuthVerifyLocalOperation(),
      '/api/v1/internal/auth/lookup': internalAuthLookupOperation(),
      '/api/v1/internal/auth/register-external': internalRegisterExternalOperation(),
      '/api/v1/internal/auth/session': internalSessionOperation(),
      '/api/v1/internal/external-identities/resolve': internalExternalIdentityResolveOperation(),
      '/api/v1/internal/SysUsers/{userId}/external-identities':
        internalUserExternalIdentitiesOperation(),
      '/api/v1/internal/SysUsers/{userId}/password': internalUserPasswordOperation(),
      '/api/v1/internal/SysUsers/{userId}/email-verified': internalUserEmailVerifiedOperation(),
      '/api/v1/internal/email/verification': internalEmailOperation('Send verification email'),
      '/api/v1/internal/email/password-reset': internalEmailOperation('Send password-reset email'),
      '/api/v1/internal/email/password-changed': internalEmailOperation(
        'Send password-changed email',
      ),
      '/api/v1/internal/external-auth-providers/runtime': internalExternalAuthRuntimeOperation(),
      '/api/v1/internal/external-auth-providers/verified-credentials':
        verifiedExternalAuthCredentialsOperation(),
      '/api/v1/internal/external-auth-providers/stored-credentials':
        storedExternalAuthCredentialsOperation(),
      '/api/v1/internal/external-auth-providers/{id}/credentials-for-test':
        storedExternalAuthCredentialsForTestOperation(),
      '/api/v1/internal/external-auth-providers/{id}/credentials-verified':
        markStoredExternalAuthCredentialsVerifiedOperation(),
      '/api/v1/internal/external-auth-providers/{id}/credentials':
        removeExternalAuthCredentialsOperation(),
    },
  };
}
