import {
  SysBOExtAuthProviderType,
  SysBOUserRole,
  type SysBOExtAuthProvider,
  type SysBOExternalIdentity,
  type SysBOUser,
  type SysBOUserInvitation,
  type SysBOUserPrincipal,
} from '../../domain.js';
import type { ManatOSValueObjectMetadata, SysBOMetadata } from './types.js';
import { commonSysBOFields, externalAuthProviderOptionItems } from './common.js';

/** Canonical identity, authentication and user-association metadata. */

export const sysBOUsersMetadata: SysBOMetadata<SysBOUser> = {
  key: 'sys-users',
  name: 'User',
  pluralName: 'Users',

  primaryField: 'name',

  fieldDefinition: {
    ...commonSysBOFields,

    fullName: {
      key: 'fullName',
      label: 'Full name',
      type: 'string',
      order: 90,
      readOnly: true,
      calculation: {
        expression:
          "firstName !== '' && lastName !== '' ? firstName + ' ' + lastName : firstName !== '' ? firstName : lastName",
      },
    },
    emailVerificationStatus: {
      key: 'emailVerificationStatus',
      label: 'Email verification',
      type: 'string',
      order: 33,
      readOnly: true,
      calculation: { expression: "emailVerified ? 'Verified' : 'Not verified'" },
    },
    localPasswordStatus: {
      key: 'localPasswordStatus',
      label: 'Local password',
      type: 'string',
      order: 51,
      readOnly: true,
      calculation: {
        expression:
          "mode === 'create' ? 'Not configured' : hasPassword ? 'Configured' : 'Not configured'",
      },
    },

    /*
     * We customize the common `name` field label for SysBOUser.
     *
     * The `!` is required because `common` is a Record and
     * noUncheckedIndexedAccess=true makes commonSysBOFields.name potentially
     * undefined from TypeScript's point of view.
     */
    name: {
      ...commonSysBOFields.name!,
      label: 'User name',
    },

    email: {
      key: 'email',
      label: 'Email',
      type: 'email',
      order: 20,

      required: true,
      unique: true,

      maxLength: 254,
      normalize: { expression: 'EmailAddress(value)' },
    },

    telephoneNumber: {
      key: 'telephoneNumber',
      label: 'Telephone number',
      type: 'telephone',
      order: 21,
      nullable: true,
      maxLength: 32,
      normalize: { expression: 'TelephoneNbr(value)' },
    },

    emailVerified: {
      key: 'emailVerified',
      label: 'Email verified',
      type: 'boolean',
      order: 30,

      required: true,
      readOnly: true,
      applicationManaged: true,
    },

    emailVerifiedAt: {
      key: 'emailVerifiedAt',
      label: 'Email verified at',
      type: 'datetime',
      order: 31,

      nullable: true,
      readOnly: true,
    },

    emailVerificationSource: {
      key: 'emailVerificationSource',
      label: 'Email verification source',
      type: 'string',
      order: 32,

      nullable: true,
      readOnly: true,
      // Presentation-only catalogue: verification sources remain stored as a
      // string while every renderer gets the same framework-neutral labels/icons.
      optionItems: [
        { value: 'internal', label: 'ManatOS', icon: 'shield-check' },
        ...externalAuthProviderOptionItems,
      ],
    },

    /**
     * Stored internally only.
     *
     * The API/UI must never return the actual password hash.
     * Public projections expose only a boolean such as `hasPassword`.
     */
    passwordHash: {
      key: 'passwordHash',
      label: 'Password hash',
      type: 'string',
      order: 40,

      nullable: true,
      sensitive: true,
      readOnly: true,
    },

    passwordChangedAt: {
      key: 'passwordChangedAt',
      label: 'Password changed',
      type: 'datetime',
      order: 50,

      nullable: true,
      readOnly: true,
    },

    role: {
      key: 'role',
      label: 'Role',
      type: 'enum',
      order: 60,

      required: true,
      enumValues: Object.values(SysBOUserRole),
      // Role presentation is canonical enum metadata. Every enum consumer gets
      // the same icon+label semantics without SysUser-specific renderer logic.
      enumItems: [
        { value: SysBOUserRole.Admin, label: 'Admin', icon: 'shield-lock-fill' },
        { value: SysBOUserRole.Superuser, label: 'Superuser', icon: 'shield-check' },
        { value: SysBOUserRole.User, label: 'User', icon: 'person-fill' },
        { value: SysBOUserRole.Guest, label: 'Guest', icon: 'person' },
      ],
    },

    firstName: {
      key: 'firstName',
      label: 'First name',
      type: 'string',
      order: 70,

      maxLength: 100,
    },

    lastName: {
      key: 'lastName',
      label: 'Last name',
      type: 'string',
      order: 80,

      maxLength: 100,
    },

    description: {
      key: 'description',
      label: 'Description',
      type: 'string',
      order: 100,

      maxLength: 2000,
    },
  },
};

/**
 * Customer/commercial identity metadata.
 *
 * Parent/child relationships belong here rather than in SysBOUser.
 * Only parentId is stored. Children are derived by querying principals
 * whose parentId refers to the current principal.
 */

export const sysBOExternalIdentityMetadata: ManatOSValueObjectMetadata<SysBOExternalIdentity> = {
  key: 'external-identities',
  name: 'External identity',
  pluralName: 'External identities',
  primaryField: 'provider',
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
  fieldDefinition: {
    ...commonSysBOFields,
    providerEmailVerificationStatus: {
      key: 'providerEmailVerificationStatus',
      label: 'Provider email verification',
      type: 'string',
      order: 61,
      readOnly: true,
      calculation: {
        expression: "emailVerified ? 'Provider email verified' : 'Provider email not verified'",
      },
    },
    userId: {
      key: 'userId',
      label: 'User',
      type: 'reference',
      order: 20,
      required: true,
      referenceBOKey: 'sys-users',
    },
    provider: {
      key: 'provider',
      label: 'Provider',
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
      label: 'Provider subject',
      type: 'string',
      order: 40,
      required: true,
      maxLength: 500,
    },
    email: {
      key: 'email',
      label: 'Email',
      type: 'email',
      order: 50,
      nullable: true,
      maxLength: 320,
    },
    emailVerified: {
      key: 'emailVerified',
      label: 'Email verified',
      type: 'boolean',
      order: 60,
      nullable: true,
    },
    displayName: {
      key: 'displayName',
      label: 'Display name',
      type: 'string',
      order: 70,
      nullable: true,
      maxLength: 300,
    },
  },
};

/** Canonical junction metadata for the SysBOUser <-> SysBOPrincipal N:N relation. */

export const sysBOUserPrincipalMetadata: ManatOSValueObjectMetadata<SysBOUserPrincipal> = {
  key: 'user-principals',
  name: 'User principal relationship',
  pluralName: 'User principal relationships',
  primaryField: 'name',
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
          action: 'unlink',
          confirmation: 'confirm',
        },
      },
    },
    principal: {
      fields: ['principalId'],
      references: {
        objectKey: 'sys-principals',
        fields: ['id'],
      },
      cardinality: 'many-to-one',
      policies: {
        delete: {
          action: 'unlink',
          confirmation: 'confirm',
        },
      },
    },
  },
  fieldDefinition: {
    ...commonSysBOFields,
    userId: {
      key: 'userId',
      label: 'User',
      type: 'reference',
      order: 20,

      required: true,
      referenceBOKey: 'sys-users',
    },
    principalId: {
      key: 'principalId',
      label: 'Principal',
      type: 'reference',
      order: 30,

      required: true,
      referenceBOKey: 'sys-principals',
    },
    relationship: {
      key: 'relationship',
      label: 'Relationship',
      type: 'string',
      order: 40,

      required: true,
    },
    isDefault: {
      key: 'isDefault',
      label: 'Default',
      type: 'boolean',
      order: 50,

      required: true,
    },
    description: {
      key: 'description',
      label: 'Description',
      type: 'string',
      order: 60,

      nullable: true,
      maxLength: 2000,
    },
  },
};

/** Canonical metadata for pending invitations related to a Principal. */

export const sysBOUserInvitationMetadata: ManatOSValueObjectMetadata<SysBOUserInvitation> = {
  key: 'user-invitations',
  name: 'User invitation',
  pluralName: 'User invitations',
  primaryField: 'email',
  relationships: {
    principal: {
      fields: ['principalId'],
      references: {
        objectKey: 'sys-principals',
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
  },
  fieldDefinition: {
    ...commonSysBOFields,
    email: {
      key: 'email',
      label: 'Email',
      type: 'email',
      order: 20,

      required: true,
      maxLength: 320,
    },
    principalId: {
      key: 'principalId',
      label: 'Principal',
      type: 'reference',
      order: 30,

      required: true,
      referenceBOKey: 'sys-principals',
    },
    relationship: {
      key: 'relationship',
      label: 'Relationship',
      type: 'string',
      order: 40,

      required: true,
    },
    requestedRole: {
      key: 'requestedRole',
      label: 'Requested role',
      type: 'string',
      order: 50,

      required: true,
    },
    tokenHash: {
      key: 'tokenHash',
      label: 'Token hash',
      type: 'string',
      order: 60,

      required: true,
      sensitive: true,
    },
    expiresAt: {
      key: 'expiresAt',
      label: 'Expires',
      type: 'datetime',
      order: 70,

      required: true,
    },
    usedAt: {
      key: 'usedAt',
      label: 'Used',
      type: 'datetime',
      order: 80,

      nullable: true,
    },
  },
};

/** Registry of canonical related/value-object metadata (not generic SysBO CRUD). */

export const sysBOExtAuthProvidersMetadata: SysBOMetadata<SysBOExtAuthProvider> = {
  key: 'sys-ext-auth-providers',
  name: 'External authentication provider',
  pluralName: 'External authentication providers',
  // Provider is the human/business identity shown as the clickable list value.
  primaryField: 'provider',
  entry: {
    name: { field: 'provider' },
    // `provider` is the semantic entry type even though its field is not named
    // `type`. Its canonical enum option supplies both the display label and icon.
    type: { field: 'provider' },
  },
  fieldDefinition: {
    ...commonSysBOFields,
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
