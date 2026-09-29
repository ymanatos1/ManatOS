import { SysBOUserRole, type SysBOUser } from '../../../domain/entities.js';
import type { SysBOMetadata } from '../types.js';
import { commonSysBOFields, externalAuthProviderOptionItems } from '../common.js';

export const sysBOUsersMetadata: SysBOMetadata<SysBOUser> = {
  key: 'sys-users',
  name: 'sysUsers',
  subsystem: 'auth',
  label: 'User',
  pluralLabel: 'Users',

  primaryField: 'name',

  // Canonical relationships
  relationships: {
    principal: {
      fields: ['principalId'],
      references: { objectKey: 'sys-principals', fields: ['id'] },
      cardinality: 'one-to-one',
      policies: { delete: { action: 'set-null', confirmation: 'confirm' } },
    },
  },

  // Canonical fields
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
      normalize: {
        expression: 'EmailAddress(value)',
      },
    },

    telephoneNumber: {
      key: 'telephoneNumber',
      label: 'Telephone number',
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
      label: 'Photo',
      type: 'picture',
      order: 22,
      nullable: true,
      applicationManaged: true,
    },

    principalId: {
      key: 'principalId',
      label: 'Principal (Person)',
      type: 'reference',
      order: 29,
      nullable: true,
      unique: true,
      referenceBOKey: 'sys-principals',
      referenceSelection: {
        filterExpression: "principalType === 'Person'",
        uniqueThrough: { objectKey: 'sys-users', field: 'principalId' },
        createRelated: {
          defaults: {
            firstName: { sourceField: 'firstName' },
            lastName: { sourceField: 'lastName' },
          },
          fixedValues: { userId: { sourceField: 'id' } },
          uiOverrides: {
            userId: { editable: false },
            principalType: { allowedValues: ['Person'] },
          },
        },
      },
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
      normalize: {
        expression: 'Capitalize(value)',
      },
    },

    lastName: {
      key: 'lastName',
      label: 'Last name',
      type: 'string',
      order: 80,

      maxLength: 100,
      normalize: {
        expression: 'Capitalize(value)',
      },
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

// ============================================================================
// EXTERNAL IDENTITIES
// ============================================================================
