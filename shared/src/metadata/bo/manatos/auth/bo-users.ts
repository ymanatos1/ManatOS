import type { SysBOUser } from '../../../../domain/entities.js';
import type { SysBOMetadata } from '../../types.js';
import { commonSysBOFields } from '../../common.js';
import { externalAuthProviderOptionItems } from '../../../subsystems/manatos/auth.js';

export const sysBOUsersMetadata: SysBOMetadata<SysBOUser> = {
  key: 'sys-users',
  name: 'sysUsers',
  subsystem: 'auth',
  label: '@EN.manatos.auth.users.label.User' /* User */,
  labelForms: { genitive: '@EN.manatos.auth.users.label.UserGenitive' },
  pluralLabel: '@EN.manatos.auth.users.pluralLabel.Users' /* Users */,

  primaryField: 'name',
  // The resolver falls back to the canonical primary field when fullName is missing.
  entry: { image: { field: 'photo' }, name: { expression: 'fullName' } },

  // Canonical fields
  fieldDefinition: {
    ...commonSysBOFields,

    fullName: {
      key: 'fullName',
      label: '@EN.manatos.auth.users.label.FullName' /* Full name */,
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
      label: '@EN.manatos.auth.users.label.EmailVerification' /* Email verification */,
      type: 'string',
      optionItems: [
        { value: 'Verified', label: '@CM.Verified' },
        { value: 'Not verified', label: '@CM.NotVerified' },
      ],
      order: 33,
      readOnly: true,
      calculation: { expression: "emailVerified ? 'Verified' : 'Not verified'" },
    },
    localPasswordStatus: {
      key: 'localPasswordStatus',
      label: '@EN.manatos.auth.users.label.LocalPassword' /* Local password */,
      type: 'string',
      optionItems: [
        { value: 'Configured', label: '@CM.Configured' },
        { value: 'Not configured', label: '@CM.NotConfigured' },
      ],
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
      label: '@EN.manatos.auth.users.label.UserName' /* User name */,
    },

    principalId: {
      key: 'principalId',
      label: '@EN.manatos.auth.userInvitations.label.Principal' /* Principal */,
      type: 'reference',
      order: 15,
      nullable: true,
      persistent: false,
      inverseRelationship: { objectKey: 'sys-principals', relationship: 'user' },
    },

    email: {
      key: 'email',
      label: '@EN.manatos.auth.externalIdentities.label.Email' /* Email */,
      type: 'email',
      order: 20,

      required: true,
      unique: true,

      maxLength: 254,
      normalize: {
        expression: 'EmailAddress(value)',
      },
    },

    telephoneNumber: {
      key: 'telephoneNumber',
      label: '@EN.manatos.auth.users.label.TelephoneNumber' /* Telephone number */,
      type: 'telephone',
      order: 21,
      nullable: true,
      maxLength: 32,
      normalize: {
        expression: 'TelephoneNbr(value)',
      },
    },

    photo: {
      key: 'photo',
      label: '@EN.manatos.auth.users.label.Photo' /* Photo */,
      type: 'picture',
      order: 22,
      nullable: true,
      applicationManaged: true,
    },

    emailVerified: {
      key: 'emailVerified',
      label: '@EN.manatos.auth.externalIdentities.label.EmailVerified' /* Email verified */,
      type: 'boolean',
      order: 30,

      required: true,
      readOnly: true,
      applicationManaged: true,
    },

    emailVerifiedAt: {
      key: 'emailVerifiedAt',
      label: '@EN.manatos.auth.users.label.EmailVerifiedAt' /* Email verified at */,
      type: 'datetime',
      order: 31,

      nullable: true,
      readOnly: true,
    },

    emailVerificationSource: {
      key: 'emailVerificationSource',
      label: '@EN.manatos.auth.users.label.EmailVerificationSource' /* Email verification source */,
      type: 'string',
      order: 32,

      nullable: true,
      readOnly: true,
      // Presentation-only catalogue: verification sources remain stored as a
      // string while every renderer gets the same framework-neutral labels/icons.
      optionItems: [
        {
          value: 'internal',
          label: '@EN.manatos.auth.users.label.ManatOS' /* ManatOS */,
          icon: 'shield-check',
        },
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
      label: '@EN.manatos.auth.users.label.PasswordHash' /* Password hash */,
      type: 'string',
      order: 40,

      nullable: true,
      sensitive: true,
      readOnly: true,
    },

    passwordChangedAt: {
      key: 'passwordChangedAt',
      label: '@EN.manatos.auth.users.label.PasswordChanged' /* Password changed */,
      type: 'datetime',
      order: 50,

      nullable: true,
      readOnly: true,
    },

    role: {
      key: 'role',
      label: '@EN.manatos.auth.users.label.Role' /* Role */,
      type: 'enum',
      order: 60,

      required: true,
      enum: 'SysBOUserRole',
    },

    firstName: {
      key: 'firstName',
      label: '@EN.manatos.auth.users.label.FirstName' /* First name */,
      type: 'string',
      order: 70,

      maxLength: 100,
      normalize: {
        expression: 'Capitalize(value)',
      },
    },

    lastName: {
      key: 'lastName',
      label: '@EN.manatos.auth.users.label.LastName' /* Last name */,
      type: 'string',
      order: 80,

      maxLength: 100,
      normalize: {
        expression: 'Capitalize(value)',
      },
    },

    description: {
      key: 'description',
      label: '@EN.manatos.auth.users.label.Description' /* Description */,
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

// ============================================================================
// EXTERNAL IDENTITIES
// ============================================================================
