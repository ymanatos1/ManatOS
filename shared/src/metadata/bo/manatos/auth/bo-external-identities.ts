import type { SysBOExternalIdentity } from '../../../../domain/entities.js';
import type { ManatOSValueObjectMetadata } from '../../types.js';
import { commonSysBOFields } from '../../common.js';
import { externalAuthProviderOptionItems } from '../../../subsystems/manatos/auth.js';

export const sysBOExternalIdentityMetadata: ManatOSValueObjectMetadata<SysBOExternalIdentity> = {
  key: 'external-identities',
  name: 'sysExternalIdentities',
  subsystem: 'auth',
  label: '@EN.manatos.auth.externalIdentities.label.ExternalIdentity' /* External identity */,
  pluralLabel:
    '@EN.manatos.auth.externalIdentities.pluralLabel.ExternalIdentities' /* External identities */,
  primaryField: 'provider',
  // Canonical relationships
  relationships: {
    user: {
      fields: ['userId'],
      references: {
        objectKey: 'sys-users',
        fields: ['id'],
      },
      cardinality: 'many-to-one',
      policies: {
        delete: {
          action: 'cascade',
          confirmation: 'confirm',
        },
      },
    },
    providerConfiguration: {
      fields: ['provider'],
      references: {
        objectKey: 'sys-ext-auth-providers',
        fields: ['provider'],
      },
      cardinality: 'many-to-one',
      // Removing provider configuration disables authentication through that
      // provider but deliberately retains users' historical/existing identities.
      policies: {
        delete: {
          action: 'retain',
          confirmation: 'confirm',
        },
      },
    },
  },
  // Canonical fields
  fieldDefinition: {
    ...commonSysBOFields,
    providerEmailVerificationStatus: {
      key: 'providerEmailVerificationStatus',
      label:
        '@EN.manatos.auth.externalIdentities.label.ProviderEmailVerification' /* Provider email verification */,
      type: 'string',
      order: 61,
      readOnly: true,
      calculation: {
        expression: "emailVerified ? 'Provider email verified' : 'Provider email not verified'",
      },
    },
    userId: {
      key: 'userId',
      label: '@EN.manatos.auth.externalIdentities.label.User' /* User */,
      type: 'reference',
      order: 20,
      required: true,
    },
    provider: {
      key: 'provider',
      label: '@EN.manatos.auth.extAuthProviders.label.Provider' /* Provider */,
      type: 'string',
      order: 30,
      required: true,
      maxLength: 120,
      // External identities store the provider as an open string because the
      // identity adapter boundary is extensible. The known provider catalogue
      // is therefore presentation metadata only, not a canonical enum constraint.
      optionItems: externalAuthProviderOptionItems,
    },
    providerSubject: {
      key: 'providerSubject',
      label: '@EN.manatos.auth.externalIdentities.label.ProviderSubject' /* Provider subject */,
      type: 'string',
      order: 40,
      required: true,
      maxLength: 500,
    },
    email: {
      key: 'email',
      label: '@EN.manatos.auth.externalIdentities.label.Email' /* Email */,
      type: 'email',
      order: 50,
      nullable: true,
      maxLength: 320,
    },
    emailVerified: {
      key: 'emailVerified',
      label: '@EN.manatos.auth.externalIdentities.label.EmailVerified' /* Email verified */,
      type: 'boolean',
      order: 60,
      nullable: true,
    },
    displayName: {
      key: 'displayName',
      label: '@EN.manatos.auth.externalIdentities.label.DisplayName' /* Display name */,
      type: 'string',
      order: 70,
      nullable: true,
      maxLength: 300,
    },
  },
};

/** Persistable invitation scaffold retained for future account provisioning flows. */

// ============================================================================
// USER INVITATIONS
// ============================================================================
