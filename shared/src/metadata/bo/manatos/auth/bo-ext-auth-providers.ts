import type { SysBOExtAuthProvider } from '../../../../domain/entities.js';
import type { SysBOMetadata } from '../../types.js';
import { commonSysBOFields } from '../../common.js';

export const sysBOExtAuthProvidersMetadata: SysBOMetadata<SysBOExtAuthProvider> = {
  key: 'sys-ext-auth-providers',
  name: 'sysExtAuthProviders',
  subsystem: 'auth',
  label:
    '@EN.manatos.auth.extAuthProviders.label.ExternalAuthenticationProvider' /* External authentication provider */,
  pluralLabel:
    '@EN.manatos.auth.extAuthProviders.pluralLabel.ExternalAuthenticationProviders' /* External authentication providers */,
  // Provider is the human/business identity shown as the clickable list value.
  primaryField: 'provider',
  // Entry identity / representation
  entry: {
    name: { field: 'provider' },
    // `provider` is the semantic entry type even though its field is not named
    // `type`. Its canonical enum option supplies both the display label and icon.
    type: { field: 'provider' },
  },
  // Canonical fields
  fieldDefinition: {
    ...commonSysBOFields,
    enabled: { ...commonSysBOFields.enabled! },
    name: {
      ...commonSysBOFields.name!,
      label: '@EN.manatos.auth.extAuthProviders.label.ProviderName' /* Provider name */,
      readOnly: true,
    },
    provider: {
      key: 'provider',
      label: '@EN.manatos.auth.extAuthProviders.label.Provider' /* Provider */,
      type: 'enum',
      order: 20,

      required: true,
      unique: true,
      enum: 'SysBOExtAuthProviderType',
      createDefaultValue: {
        expression: "FirstCtx($enums.SysBOExtAuthProviderType.values, 'value')",
      },
    },
    clientId: {
      key: 'clientId',
      label: '@EN.manatos.auth.extAuthProviders.label.ClientID' /* Client ID */,
      type: 'string',
      order: 30,

      maxLength: 500,
    },
    clientSecretEncrypted: {
      key: 'clientSecretEncrypted',
      label: '@EN.manatos.auth.extAuthProviders.label.ClientSecret' /* Client secret */,
      type: 'string',
      order: 40,

      sensitive: true,
      readOnly: true,
      nullable: true,
    },
    callbackPath: {
      key: 'callbackPath',
      label: '@EN.manatos.auth.extAuthProviders.label.CallbackPath' /* Callback path */,
      type: 'string',
      order: 50,

      required: true,
      maxLength: 300,
      generated: true,
      readOnly: true,
      createDefaultValue: {
        expression:
          "FindCtx($enums.SysBOExtAuthProviderType.values, 'value', $entry-current.provider, 'callbackPath')",
      },
    },
    tenant: {
      key: 'tenant',
      label: '@EN.manatos.auth.extAuthProviders.label.Tenant' /* Tenant */,
      type: 'string',
      order: 60,

      nullable: true,
      maxLength: 100,
    },
    secretUpdatedAt: {
      key: 'secretUpdatedAt',
      label: '@EN.manatos.auth.extAuthProviders.label.SecretUpdated' /* Secret updated */,
      type: 'datetime',
      order: 70,

      nullable: true,
      readOnly: true,
    },
    credentialsVerified: {
      key: 'credentialsVerified',
      label:
        '@EN.manatos.auth.extAuthProviders.label.CredentialsVerified' /* Credentials verified */,
      type: 'boolean',
      order: 75,

      required: true,
      readOnly: true,
      applicationManaged: true,
    },
    credentialsVerifiedAt: {
      key: 'credentialsVerifiedAt',
      label:
        '@EN.manatos.auth.extAuthProviders.label.CredentialsVerifiedAt' /* Credentials verified at */,
      type: 'datetime',
      order: 76,

      nullable: true,
      readOnly: true,
      applicationManaged: true,
    },
    hasClientSecret: {
      key: 'hasClientSecret',
      label: '@EN.manatos.auth.extAuthProviders.label.SecretStored' /* Secret stored */,
      type: 'boolean',
      order: 80,

      generated: true,
      readOnly: true,
    },
  },
};

/**
 * Central registry of all currently defined first-class SysBO metadata.
 *
 * Keys are stable hard-coded BO identifiers, NOT instance GUIDs.
 */
