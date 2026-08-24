import {
  SysLicenseStatus,
  SysPrincipalType,
  SysUserRole,
  type SysApplication,
  type SysLicense,
  type SysPrincipal,
  type SysUser,
} from './domain.js';

/**
 * Supported canonical business-object field types.
 *
 * These types describe the business object itself and are therefore
 * independent from any particular UI implementation.
 */
export type SysBOFieldType =
  'guid' | 'string' | 'email' | 'boolean' | 'number' | 'date' | 'enum' | 'reference';

/**
 * Metadata describing one field/property of a SysBO.
 *
 * The field definitions themselves are stored in a keyed object, where
 * the key is normally the corresponding property name:
 *
 *   fieldDefinition.name
 *   fieldDefinition.email
 *   fieldDefinition.principalType
 *
 * The separate `key` property is intentionally retained so that an
 * individual field definition still knows its own identity when it is
 * passed around independently of the containing object.
 */
export interface SysBOFieldMetadata {
  key: string;
  label: string;
  type: SysBOFieldType;
  order: number;

  required?: boolean;
  nullable?: boolean;

  generated?: boolean;
  readOnly?: boolean;

  unique?: boolean;
  sensitive?: boolean;

  minLength?: number;
  maxLength?: number;

  enumValues?: readonly string[];

  referenceBOKey?: string;
}

/**
 * UI-neutral, hard-coded definition of a system business object.
 *
 * This metadata defines WHAT the business object is.
 *
 * It is intentionally separate from:
 *
 * 1. actual BO data;
 * 2. web/EJS UI metadata;
 * 3. possible future mobile UI metadata.
 *
 * `key` is the stable hard-coded identifier of the BO definition, for example:
 *
 *   sys-users
 *   sys-principals
 *   sys-applications
 *   sys-licenses
 *
 * Actual BO records have completely separate generated GUID `id` values.
 */
export interface SysBOMetadata<T> {
  key: string;
  name: string;
  pluralName: string;

  /**
   * Main human/business identifying field used for links and display.
   *
   * For the current SysBOs this is the unique `name` field.
   */
  primaryField: keyof T & string;

  /**
   * Keyed canonical field definitions.
   *
   * Example:
   *
   * fieldDefinition['email']
   * fieldDefinition.email
   */
  fieldDefinition: Record<string, SysBOFieldMetadata>;
}

/**
 * Fields common to all first-class SysBO entities.
 *
 * Note:
 * Because this object is typed as Record<string, SysBOFieldMetadata>
 * and the project enables `noUncheckedIndexedAccess`, an indexed access
 * such as `common.name` is technically typed as:
 *
 *   SysBOFieldMetadata | undefined
 *
 * Therefore, when we explicitly reuse `common.name` below, we use the
 * non-null assertion `common.name!`. We know statically that the property
 * exists because it is declared immediately here.
 */
const common: Record<string, SysBOFieldMetadata> = {
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
    type: 'date',
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
    type: 'date',
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
 * SysUser is deliberately separated from SysPrincipal:
 *
 * - SysUser      = website identity/authentication
 * - SysPrincipal = customer/commercial identity
 *
 * `name` is the unique user-name used for local sign-in.
 * `email` is also unique.
 */
export const sysUsersMetadata: SysBOMetadata<SysUser> = {
  key: 'sys-users',
  name: 'SysUser',
  pluralName: 'SysUsers',

  primaryField: 'name',

  fieldDefinition: {
    ...common,

    /*
     * We customize the common `name` field label for SysUser.
     *
     * The `!` is required because `common` is a Record and
     * noUncheckedIndexedAccess=true makes common.name potentially
     * undefined from TypeScript's point of view.
     */
    name: {
      ...common.name!,
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
    },

    emailVerified: {
      key: 'emailVerified',
      label: 'Email verified',
      type: 'boolean',
      order: 30,

      required: true,
    },

    emailVerifiedAt: {
      key: 'emailVerifiedAt',
      label: 'Email verified at',
      type: 'date',
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
      type: 'date',
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
      enumValues: Object.values(SysUserRole),
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
      order: 90,

      maxLength: 2000,
    },
  },
};

/**
 * Customer/commercial identity metadata.
 *
 * Parent/child relationships belong here rather than in SysUser.
 * Only parentId is stored. Children are derived by querying principals
 * whose parentId refers to the current principal.
 */
export const sysPrincipalsMetadata: SysBOMetadata<SysPrincipal> = {
  key: 'sys-principals',
  name: 'SysPrincipal',
  pluralName: 'SysPrincipals',

  primaryField: 'name',

  fieldDefinition: {
    ...common,

    principalType: {
      key: 'principalType',
      label: 'Principal type',
      type: 'enum',
      order: 20,

      required: true,
      enumValues: Object.values(SysPrincipalType),
    },

    parentId: {
      key: 'parentId',
      label: 'Parent principal',
      type: 'reference',
      order: 30,

      nullable: true,
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
 * `name` is the generic unique BO name.
 * `appName` is an additional application-specific unique identifier.
 */
export const sysApplicationsMetadata: SysBOMetadata<SysApplication> = {
  key: 'sys-applications',
  name: 'SysApplication',
  pluralName: 'SysApplications',

  primaryField: 'name',

  fieldDefinition: {
    ...common,

    appName: {
      key: 'appName',
      label: 'App name',
      type: 'string',
      order: 20,

      required: true,
      unique: true,

      minLength: 2,
      maxLength: 120,
    },

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
      type: 'string',
      order: 40,

      maxLength: 50,
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
 * A license belongs to a SysPrincipal (customer identity) and refers to
 * a SysApplication. It does not belong directly to the website SysUser.
 */
export const sysLicensesMetadata: SysBOMetadata<SysLicense> = {
  key: 'sys-licenses',
  name: 'SysLicense',
  pluralName: 'SysLicenses',

  primaryField: 'name',

  fieldDefinition: {
    ...common,

    principalId: {
      key: 'principalId',
      label: 'Customer',
      type: 'reference',
      order: 20,

      required: true,
      referenceBOKey: 'sys-principals',
    },

    applicationId: {
      key: 'applicationId',
      label: 'Application',
      type: 'reference',
      order: 30,

      required: true,
      referenceBOKey: 'sys-applications',
    },

    licenseKey: {
      key: 'licenseKey',
      label: 'License key',
      type: 'string',
      order: 40,

      maxLength: 250,
    },

    status: {
      key: 'status',
      label: 'Status',
      type: 'enum',
      order: 50,

      required: true,
      enumValues: Object.values(SysLicenseStatus),
    },

    validFrom: {
      key: 'validFrom',
      label: 'Valid from',
      type: 'date',
      order: 60,
    },

    validUntil: {
      key: 'validUntil',
      label: 'Valid until',
      type: 'date',
      order: 70,

      nullable: true,
    },

    quantity: {
      key: 'quantity',
      label: 'Quantity',
      type: 'number',
      order: 80,

      required: true,
    },

    description: {
      key: 'description',
      label: 'Description',
      type: 'string',
      order: 90,

      maxLength: 2000,
    },
  },
};

/**
 * Central registry of all currently defined first-class SysBO metadata.
 *
 * Keys are stable hard-coded BO identifiers, NOT instance GUIDs.
 */
export const allSysBOMetadata = {
  [sysUsersMetadata.key]: sysUsersMetadata,
  [sysPrincipalsMetadata.key]: sysPrincipalsMetadata,
  [sysApplicationsMetadata.key]: sysApplicationsMetadata,
  [sysLicensesMetadata.key]: sysLicensesMetadata,
} as const;
