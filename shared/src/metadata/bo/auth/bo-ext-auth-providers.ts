import { SysBOExtAuthProviderType, type SysBOExtAuthProvider } from '../../../domain/entities.js';
import type { SysBOMetadata } from '../types.js';
import { commonSysBOFields, externalAuthProviderOptionItems } from '../common.js';

export const sysBOExtAuthProvidersMetadata: SysBOMetadata<SysBOExtAuthProvider> = {
  key: 'sys-ext-auth-providers',
  name: 'sysExtAuthProviders',
  subsystem: 'auth',
  label: 'External authentication provider',
  pluralLabel: 'External authentication providers',
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
      label: 'Provider name',
      readOnly: true,
    },
    provider: {
      key: 'provider',
      label: 'Provider',
      type: 'enum',
      order: 20,

      required: true,
      unique: true,
      enumValues: Object.values(SysBOExtAuthProviderType),
      enumItems: externalAuthProviderOptionItems,
      createDefaultValue: {
        expression: "FirstCtx($entity-fields.provider.enumItems, 'value')",
      },
    },
    clientId: {
      key: 'clientId',
      label: 'Client ID',
      type: 'string',
      order: 30,

      maxLength: 500,
    },
    clientSecretEncrypted: {
      key: 'clientSecretEncrypted',
      label: 'Client secret',
      type: 'string',
      order: 40,

      sensitive: true,
      readOnly: true,
      nullable: true,
    },
    callbackPath: {
      key: 'callbackPath',
      label: 'Callback path',
      type: 'string',
      order: 50,

      required: true,
      maxLength: 300,
      generated: true,
      readOnly: true,
      createDefaultValue: {
        expression:
          "FindCtx($entity-fields.provider.enumItems, 'value', $entry-current.provider, 'callbackPath')",
      },
    },
    tenant: {
      key: 'tenant',
      label: 'Tenant',
      type: 'string',
      order: 60,

      nullable: true,
      maxLength: 100,
    },
    secretUpdatedAt: {
      key: 'secretUpdatedAt',
      label: 'Secret updated',
      type: 'datetime',
      order: 70,

      nullable: true,
      readOnly: true,
    },
    credentialsVerified: {
      key: 'credentialsVerified',
      label: 'Credentials verified',
      type: 'boolean',
      order: 75,

      required: true,
      readOnly: true,
      applicationManaged: true,
    },
    credentialsVerifiedAt: {
      key: 'credentialsVerifiedAt',
      label: 'Credentials verified at',
      type: 'datetime',
      order: 76,

      nullable: true,
      readOnly: true,
      applicationManaged: true,
    },
    hasClientSecret: {
      key: 'hasClientSecret',
      label: 'Secret stored',
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
