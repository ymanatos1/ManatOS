import {
  SysBOExtAuthProviderType,
  SysBOLicenseStatus,
  SysBOPrincipalType,
  SysBOUserRole,
  type SysBOApplication,
  type SysBOConfiguration,
  type SysBOExtAuthProvider,
  type SysEmailAddress,
  type SysPrincipalEmailAddress,
  type SysTelephoneNumber,
  type SysAddress,
  type SysPrincipalAddress,
  type SysPrincipalTelephoneNumber,
  type SysBOExternalIdentity,
  type SysBOLicense,
  type SysBOPrincipal,
  type SysBOUser,
  type SysBOUserInvitation,
  type SysBOUserPrincipal,
} from './domain.js';
import { MANATOS_COMPANY } from './company-platform.js';
import type {
  ManatOSValueObjectMetadata,
  SysBOFieldMetadata,
  SysBOMetadata,
} from './bo-metadata-types.js';

/*
 * Keep the public import surface backward compatible while the implementation
 * is split for readability: contracts live in bo-metadata-types.ts and this
 * file contains only concrete canonical object/entity metadata declarations.
 */
export * from './bo-metadata-types.js';

/**
 * Fields common to all first-class SysBO entities.
 *
 * Note:
 * Because this object is typed as Record<string, SysBOFieldMetadata>
 * and the project enables `noUncheckedIndexedAccess`, an indexed access
 * such as `commonSysBOFields.name` is technically typed as:
 *
 *   SysBOFieldMetadata | undefined
 *
 * Therefore, when we explicitly reuse `commonSysBOFields.name` below, we use the
 * non-null assertion `commonSysBOFields.name!`. We know statically that the property
 * exists because it is declared immediately here.
 */
const commonSysBOFields: Record<string, SysBOFieldMetadata> = {
  id: {
    key: 'id',
    label: 'Id',
    type: 'guid',
    order: 0,

    required: true,
    generated: true,
    readOnly: true,
    unique: true,
  },

  name: {
    key: 'name',
    label: 'Name',
    type: 'string',
    order: 10,

    required: true,
    unique: true,

    minLength: 2,
    maxLength: 120,
  },

  enabled: {
    key: 'enabled',
    label: 'Enabled',
    type: 'boolean',
    order: 900,

    required: true,
  },

  createdAt: {
    key: 'createdAt',
    label: 'Created',
    type: 'datetime',
    order: 910,

    generated: true,
    readOnly: true,
  },
  createdBy: {
    key: 'createdBy',
    label: 'Created by',
    type: 'string',
    order: 911,
    generated: true,
    readOnly: true,
  },

  updatedAt: {
    key: 'updatedAt',
    label: 'Updated',
    type: 'datetime',
    order: 920,

    generated: true,
    readOnly: true,
  },
  updatedBy: {
    key: 'updatedBy',
    label: 'Updated by',
    type: 'string',
    order: 921,
    generated: true,
    readOnly: true,
  },
};

/**
 * Website/security account metadata.
 *
 * SysBOUser is deliberately separated from SysBOPrincipal:
 *
 * - SysBOUser      = website identity/authentication
 * - SysBOPrincipal = customer/commercial identity
 *
 * `name` is the unique user-name used for local sign-in.
 * `email` is also unique.
 */
export const sysBOUsersMetadata: SysBOMetadata<SysBOUser> = {
  key: 'sys-users',
  name: 'User',
  pluralName: 'Users',

  primaryField: 'name',

  derivedFields: {
    fullName: {
      label: 'Full name',
      expression: "firstName !== '' && lastName !== '' ? firstName + ' ' + lastName : firstName !== '' ? firstName : lastName",
    },
    emailVerificationStatus: {
      label: 'Email verification',
      expression: "emailVerified ? 'Verified' : 'Not verified'",
    },
    localPasswordStatus: {
      label: 'Local password',
      expression: "mode === 'create' ? 'Not configured' : hasPassword ? 'Configured' : 'Not configured'",
    },
  },

  fieldDefinition: {
    ...commonSysBOFields,

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
export const sysBOEmailAddressesMetadata: SysBOMetadata<SysEmailAddress> = {
  key: 'sys-email-addresses',
  exposure: 'internal',
  name: 'Email address',
  pluralName: 'Email addresses',
  primaryField: 'address',
  fieldDefinition: {
    ...commonSysBOFields,
    name: { ...commonSysBOFields.name!, label: 'Canonical email key', readOnly: true },
    address: { key: 'address', label: 'Email address', type: 'email', order: 20, required: true, unique: true, maxLength: 254, normalize: { expression: 'EmailAddress(value)' } },
  },
};

export const sysBOPrincipalEmailAddressesMetadata: SysBOMetadata<SysPrincipalEmailAddress> = {
  key: 'sys-principal-email-addresses',
  exposure: 'internal',
  name: 'Principal email address',
  pluralName: 'Principal email addresses',
  primaryField: 'name',
  relationships: {
    principal: { fields: ['principalId'], references: { objectKey: 'sys-principals', fields: ['id'] }, cardinality: 'many-to-one', policies: { delete: { action: 'cascade', confirmation: 'silent' } } },
    emailAddress: { fields: ['emailAddressId'], references: { objectKey: 'sys-email-addresses', fields: ['id'] }, cardinality: 'many-to-one', policies: { delete: { action: 'restrict', confirmation: 'confirm' } } },
  },
  fieldDefinition: {
    ...commonSysBOFields,
    name: { ...commonSysBOFields.name!, label: 'Relationship key', readOnly: true },
    principalId: { key: 'principalId', label: 'Principal', type: 'reference', order: 20, required: true, referenceBOKey: 'sys-principals' },
    emailAddressId: { key: 'emailAddressId', label: 'Email address', type: 'reference', order: 30, required: true, referenceBOKey: 'sys-email-addresses' },
  },
};

/**
 * Canonical telephone values are internal supporting data, just like email
 * addresses. `name` is the normalized E.164-like identity key generated by the
 * Principal Contact service; countryCode and number remain separately available
 * so every UI can present/validate them without reparsing an opaque string.
 */
export const sysBOTelephoneNumbersMetadata: SysBOMetadata<SysTelephoneNumber> = {
  key: 'sys-telephone-numbers',
  exposure: 'internal',
  name: 'Telephone number',
  pluralName: 'Telephone numbers',
  primaryField: 'fullNumber',
  derivedFields: {
    fullNumber: {
      label: 'Full number',
      expression: 'TelephoneNbr(countryCode, number)',
      persisted: true,
    },
  },
  fieldDefinition: {
    ...commonSysBOFields,
    name: { ...commonSysBOFields.name!, label: 'Canonical telephone key', readOnly: true },
    countryCode: { key: 'countryCode', label: 'Country code', type: 'string', order: 20, required: true, maxLength: 5 },
    number: { key: 'number', label: 'Telephone number', type: 'string', order: 30, required: true, maxLength: 40 },
    fullNumber: { key: 'fullNumber', label: 'Full number', type: 'telephone', order: 40, required: true, readOnly: true, applicationManaged: true, unique: true },
  },
};

export const sysBOPrincipalTelephoneNumbersMetadata: SysBOMetadata<SysPrincipalTelephoneNumber> = {
  key: 'sys-principal-telephone-numbers',
  exposure: 'internal',
  name: 'Principal telephone number',
  pluralName: 'Principal telephone numbers',
  primaryField: 'name',
  relationships: {
    principal: { fields: ['principalId'], references: { objectKey: 'sys-principals', fields: ['id'] }, cardinality: 'many-to-one', policies: { delete: { action: 'cascade', confirmation: 'silent' } } },
    telephoneNumber: { fields: ['telephoneNumberId'], references: { objectKey: 'sys-telephone-numbers', fields: ['id'] }, cardinality: 'many-to-one', policies: { delete: { action: 'restrict', confirmation: 'confirm' } } },
  },
  fieldDefinition: {
    ...commonSysBOFields,
    name: { ...commonSysBOFields.name!, label: 'Relationship key', readOnly: true },
    principalId: { key: 'principalId', label: 'Principal', type: 'reference', order: 20, required: true, referenceBOKey: 'sys-principals' },
    telephoneNumberId: { key: 'telephoneNumberId', label: 'Telephone number', type: 'reference', order: 30, required: true, referenceBOKey: 'sys-telephone-numbers' },
  },
};

/**
 * Postal/street addresses are internal reusable contact entities. Their
 * constituent fields are authoritative; formattedAddress is a persisted
 * derived field so every client receives the same compact description.
 */
export const sysBOAddressesMetadata: SysBOMetadata<SysAddress> = {
  key: 'sys-addresses',
  exposure: 'internal',
  name: 'Address',
  pluralName: 'Addresses',
  primaryField: 'formattedAddress',
  derivedFields: {
    formattedAddress: {
      label: 'Formatted address',
      expression:
        "(recipientOrAttention != '' ? recipientOrAttention + ', ' : '') + " +
        "(organization != '' ? organization + ', ' : '') + addressLine1 + " +
        "(addressLine2 != '' ? ', ' + addressLine2 : '') + " +
        "(addressLine3 != '' ? ', ' + addressLine3 : '') + " +
        "(poBox != '' ? ', PO Box ' + poBox : '') + " +
        "(postalCode != '' ? ', ' + postalCode : '') + ', ' + city + " +
        "(stateOrProvince != '' ? ', ' + stateOrProvince : '') + ', ' + country",
      persisted: true,
    },
  },
  fieldDefinition: {
    ...commonSysBOFields,
    name: { ...commonSysBOFields.name!, label: 'Canonical address key', readOnly: true },
    recipientOrAttention: { key: 'recipientOrAttention', label: 'Recipient / attention', type: 'string', order: 20, maxLength: 160 },
    organization: { key: 'organization', label: 'Organization', type: 'string', order: 30, maxLength: 180 },
    addressLine1: { key: 'addressLine1', label: 'Address line 1', type: 'string', order: 40, required: true, maxLength: 200 },
    addressLine2: { key: 'addressLine2', label: 'Address line 2', type: 'string', order: 50, maxLength: 200 },
    addressLine3: { key: 'addressLine3', label: 'Address line 3', type: 'string', order: 60, maxLength: 200 },
    poBox: { key: 'poBox', label: 'PO Box', type: 'string', order: 70, maxLength: 80 },
    postalCode: { key: 'postalCode', label: 'Postal code', type: 'string', order: 80, maxLength: 40 },
    city: { key: 'city', label: 'City', type: 'string', order: 90, required: true, maxLength: 120 },
    stateOrProvince: { key: 'stateOrProvince', label: 'State / province', type: 'string', order: 100, maxLength: 120 },
    country: { key: 'country', label: 'Country', type: 'string', order: 110, required: true, maxLength: 120 },
    formattedAddress: { key: 'formattedAddress', label: 'Formatted address', type: 'string', order: 120, required: true, readOnly: true, applicationManaged: true, maxLength: 1000 },
  },
};

export const sysBOPrincipalAddressesMetadata: SysBOMetadata<SysPrincipalAddress> = {
  key: 'sys-principal-addresses',
  exposure: 'internal',
  name: 'Principal address',
  pluralName: 'Principal addresses',
  primaryField: 'name',
  relationships: {
    principal: { fields: ['principalId'], references: { objectKey: 'sys-principals', fields: ['id'] }, cardinality: 'many-to-one', policies: { delete: { action: 'cascade', confirmation: 'silent' } } },
    address: { fields: ['addressId'], references: { objectKey: 'sys-addresses', fields: ['id'] }, cardinality: 'many-to-one', policies: { delete: { action: 'restrict', confirmation: 'confirm' } } },
  },
  fieldDefinition: {
    ...commonSysBOFields,
    name: { ...commonSysBOFields.name!, label: 'Relationship key', readOnly: true },
    principalId: { key: 'principalId', label: 'Principal', type: 'reference', order: 20, required: true, referenceBOKey: 'sys-principals' },
    addressId: { key: 'addressId', label: 'Address', type: 'reference', order: 30, required: true, referenceBOKey: 'sys-addresses' },
  },
};

export const sysBOPrincipalsMetadata: SysBOMetadata<SysBOPrincipal> = {
  key: 'sys-principals',
  name: 'Principal',
  pluralName: 'Principals',

  primaryField: 'name',

  derivedFields: {
    rootPrincipalId: {
      label: 'Root principal',
      expression: "parentId == null ? null : TraverseEntity(parentId, 'sys-principals', 'parentId', 'id')",
      persisted: true,
    },
  },

  relationships: {
    parent: {
      fields: ['parentId'],
      references: {
        objectKey: 'sys-principals',
        fields: ['id'],
      },
      cardinality: 'many-to-one',
      policies: {
        delete: {
          action: 'set-null',
          confirmation: 'confirm',
        },
      },
    },
  },

  fieldDefinition: {
    ...commonSysBOFields,

    principalType: {
      key: 'principalType',
      label: 'Principal type',
      type: 'enum',
      order: 20,

      required: true,
      enumValues: Object.values(SysBOPrincipalType),
      enumItems: [
        {
          value: SysBOPrincipalType.Person,
          label: 'Person',
          icon: 'person',
          isContainer: false,
          canHaveParent: true,
        },
        {
          value: SysBOPrincipalType.Company,
          label: 'Company',
          icon: 'building',
          isContainer: true,
          canHaveParent: false,
        },
        {
          value: SysBOPrincipalType.Group,
          label: 'Group',
          icon: 'people',
          isContainer: true,
          canHaveParent: true,
        },
        {
          value: SysBOPrincipalType.System,
          label: 'System',
          icon: 'gear',
          isContainer: false,
          canHaveParent: false,
        },
      ],
    },

    parentId: {
      key: 'parentId',
      label: 'Parent principal',
      type: 'reference',
      order: 30,

      nullable: true,
      referenceBOKey: 'sys-principals',
    },

    rootPrincipalId: {
      key: 'rootPrincipalId',
      label: 'Root principal',
      type: 'reference',
      order: 35,

      nullable: true,
      readOnly: true,
      applicationManaged: true,
      referenceBOKey: 'sys-principals',
    },

    description: {
      key: 'description',
      label: 'Description',
      type: 'string',
      order: 40,

      maxLength: 2000,
    },
  },
};

/**
 * Managed/licensable application metadata.
 *
 * `name` is the canonical unique application name.
 */
export const sysBOApplicationsMetadata: SysBOMetadata<SysBOApplication> = {
  key: 'sys-applications',
  name: 'Application',
  pluralName: 'Applications',

  primaryField: 'name',

  fieldDefinition: {
    ...commonSysBOFields,

    fullName: {
      key: 'fullName',
      label: 'Full name',
      type: 'string',
      order: 30,

      required: true,
      maxLength: 250,
    },

    version: {
      key: 'version',
      label: 'Version',
      type: 'version',
      order: 40,

      maxLength: 50,
      versionFormat: 'semver',
    },

    description: {
      key: 'description',
      label: 'Description',
      type: 'string',
      order: 50,

      maxLength: 2000,
    },
  },
};

/**
 * License metadata.
 *
 * A Company-owned license belongs to a SysBOPrincipal (customer identity) and
 * targets exactly one platform. An optional SysBOApplication restriction is
 * currently meaningful for mCRM; omitting it represents platform-wide scope.
 */
export const sysBOLicensesMetadata: SysBOMetadata<SysBOLicense> = {
  key: 'sys-licenses',
  name: 'License',
  pluralName: 'Licenses',

  primaryField: 'name',

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
          action: 'restrict',
          confirmation: 'inherit',
        },
      },
    },
    application: {
      fields: ['applicationId'],
      references: {
        objectKey: 'sys-applications',
        fields: ['id'],
      },
      cardinality: 'many-to-one',
      policies: {
        delete: {
          action: 'set-null',
          confirmation: 'confirm',
        },
      },
    },
  },

  fieldDefinition: {
    ...commonSysBOFields,

    principalId: {
      key: 'principalId',
      label: 'Customer',
      type: 'reference',
      order: 20,

      required: true,
      referenceBOKey: 'sys-principals',
    },

    platformId: {
      key: 'platformId',
      label: 'Platform',
      type: 'enum',
      order: 30,

      required: true,
      enumValues: MANATOS_COMPANY.platforms.filter((platform) => platform.enabled).map((platform) => platform.id),
      enumItems: MANATOS_COMPANY.platforms
        .filter((platform) => platform.enabled)
        .map((platform) => ({
          value: platform.id,
          label: platform.shortName,
        })),
    },

    applicationId: {
      key: 'applicationId',
      label: 'Application',
      type: 'reference',
      order: 40,

      nullable: true,
      referenceBOKey: 'sys-applications',
    },

    licenseKey: {
      key: 'licenseKey',
      label: 'License key',
      type: 'string',
      order: 50,

      maxLength: 250,
    },

    rules: {
      key: 'rules',
      label: 'Rules',
      type: 'string',
      order: 55,

      maxLength: 4000,
    },

    status: {
      key: 'status',
      label: 'Status',
      type: 'enum',
      order: 60,

      required: true,
      enumValues: Object.values(SysBOLicenseStatus),
      enumItems: [
        {
          value: SysBOLicenseStatus.Active,
          label: 'Active',
          icon: 'check-circle-fill',
          tone: 'success',
        },
        {
          value: SysBOLicenseStatus.Suspended,
          label: 'Suspended',
          icon: 'pause-circle-fill',
          tone: 'warning',
        },
        {
          value: SysBOLicenseStatus.Expired,
          label: 'Expired',
          icon: 'clock-history',
          tone: 'danger',
          toneStrength: 'soft',
        },
        {
          value: SysBOLicenseStatus.Cancelled,
          label: 'Cancelled',
          icon: 'x-circle-fill',
          tone: 'danger',
          toneStrength: 'strong',
        },
      ],
    },

    validFrom: {
      key: 'validFrom',
      label: 'Valid from',
      type: 'date',
      order: 70,
    },

    validityDuration: {
      key: 'validityDuration',
      label: 'Validity duration',
      type: 'duration',
      order: 75,

      nullable: true,
      durationUnits: ['years', 'months', 'days'],
      calculation: {
        expression: 'CalendarDurationBetween(validFrom, validUntil)',
        triggeredBy: ['validUntil'],
      },
    },

    validUntil: {
      key: 'validUntil',
      label: 'Valid until',
      type: 'date',
      order: 80,

      nullable: true,
      calculation: {
        expression: 'CalendarAddDuration(validFrom, validityDuration)',
        triggeredBy: ['validFrom', 'validityDuration'],
      },
    },

    quantity: {
      key: 'quantity',
      label: 'Quantity',
      type: 'number',
      order: 90,

      required: true,
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
 * Canonical metadata for an external login identity related to a SysBOUser.
 *
 * External identities are persisted domain objects but are not independently
 * exposed through the generic SysBO CRUD/navigation surface. Modelling them as
 * a value object keeps their field/derived semantics reusable without falsely
 * promoting them to a top-level administration entity.
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
  derivedFields: {
    providerEmailVerificationStatus: {
      label: 'Provider email verification',
      expression: "emailVerified ? 'Provider email verified' : 'Provider email not verified'",
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
    provider: {
      key: 'provider',
      label: 'Provider',
      type: 'string',
      order: 30,
      required: true,
      maxLength: 120,
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
export const allManatOSValueObjectMetadata = {
  [sysBOExternalIdentityMetadata.key]: sysBOExternalIdentityMetadata,
  [sysBOUserPrincipalMetadata.key]: sysBOUserPrincipalMetadata,
  [sysBOUserInvitationMetadata.key]: sysBOUserInvitationMetadata,
} as const;

/** Persisted application configuration metadata. */
export const sysBOConfigurationsMetadata: SysBOMetadata<SysBOConfiguration> = {
  key: 'sys-configurations',
  name: 'Configuration',
  pluralName: 'Configurations',
  primaryField: 'name',
  fieldDefinition: {
    ...commonSysBOFields,
    name: {
      ...commonSysBOFields.name!,
      label: 'Setting',
      readOnly: true,
    },
    value: {
      key: 'value',
      label: 'Value',
      type: 'string',
      order: 20,

      nullable: true,
    },
    valueEncrypted: {
      key: 'valueEncrypted',
      label: 'Encrypted value',
      type: 'string',
      order: 21,

      sensitive: true,
      readOnly: true,
      nullable: true,
    },
    group: {
      key: 'group',
      label: 'Group',
      type: 'string',
      order: 30,

      readOnly: true,
    },
    description: {
      key: 'description',
      label: 'Help',
      type: 'string',
      order: 40,

      readOnly: true,
    },
    valueType: {
      key: 'valueType',
      label: 'Type',
      type: 'string',
      order: 50,

      readOnly: true,
    },
    allowedValues: {
      key: 'allowedValues',
      label: 'Allowed values',
      type: 'string',
      order: 60,

      readOnly: true,
      nullable: true,
    },
    defaultValue: {
      key: 'defaultValue',
      label: 'Default',
      type: 'string',
      order: 70,

      readOnly: true,
      nullable: true,
    },
    restartRequired: {
      key: 'restartRequired',
      label: 'Restart required',
      type: 'boolean',
      order: 80,

      readOnly: true,
    },
    editable: {
      key: 'editable',
      label: 'Editable',
      type: 'boolean',
      order: 90,

      readOnly: true,
    },
    sensitive: {
      key: 'sensitive',
      label: 'Sensitive',
      type: 'boolean',
      order: 100,

      readOnly: true,
    },
  },
};

/** Company-owned external OAuth/OIDC provider configuration metadata. */
export const sysBOExtAuthProvidersMetadata: SysBOMetadata<SysBOExtAuthProvider> = {
  key: 'sys-ext-auth-providers',
  name: 'External authentication provider',
  pluralName: 'External authentication providers',
  // Provider is the human/business identity shown as the clickable list value.
  primaryField: 'provider',
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
      enumItems: [
        {
          value: SysBOExtAuthProviderType.Microsoft,
          label: 'Microsoft',
          icon: 'microsoft',
        },
        {
          value: SysBOExtAuthProviderType.Google,
          label: 'Google',
          icon: 'google',
        },
        {
          value: SysBOExtAuthProviderType.Facebook,
          label: 'Facebook',
          icon: 'facebook',
        },
        {
          value: SysBOExtAuthProviderType.GitHub,
          label: 'GitHub',
          icon: 'github',
        },
      ],
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
export const allSysBOMetadata = {
  [sysBOUsersMetadata.key]: sysBOUsersMetadata,
  [sysBOPrincipalsMetadata.key]: sysBOPrincipalsMetadata,
  [sysBOEmailAddressesMetadata.key]: sysBOEmailAddressesMetadata,
  [sysBOPrincipalEmailAddressesMetadata.key]: sysBOPrincipalEmailAddressesMetadata,
  [sysBOTelephoneNumbersMetadata.key]: sysBOTelephoneNumbersMetadata,
  [sysBOPrincipalTelephoneNumbersMetadata.key]: sysBOPrincipalTelephoneNumbersMetadata,
  [sysBOAddressesMetadata.key]: sysBOAddressesMetadata,
  [sysBOPrincipalAddressesMetadata.key]: sysBOPrincipalAddressesMetadata,
  [sysBOApplicationsMetadata.key]: sysBOApplicationsMetadata,
  [sysBOLicensesMetadata.key]: sysBOLicensesMetadata,
  [sysBOExtAuthProvidersMetadata.key]: sysBOExtAuthProvidersMetadata,
  [sysBOConfigurationsMetadata.key]: sysBOConfigurationsMetadata,
} as const;

/** All canonical objects, used by relationship/report/designer registries. */
export const allManatOSObjectMetadata = {
  ...allSysBOMetadata,
  ...allManatOSValueObjectMetadata,
} as const;
