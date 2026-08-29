import {
  SysBOExtAuthProviderType,
  SysBOLicenseStatus,
  SysBOPrincipalType,
  SysBOUserRole,
  type SysBOApplication,
  type SysBOConfiguration,
  type SysBOExtAuthProvider,
  type SysBOLicense,
  type SysBOPrincipal,
  type SysBOUser,
} from './domain.js';
import { MANATOS_COMPANY } from './company-platform.js';

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

  /**
   * Persisted field maintained by application/domain logic rather than by a
   * normal CRUD caller. Unlike generated fields, the value is stored and can
   * therefore be filtered, indexed and audited by future storage providers.
   */
  applicationManaged?: boolean;

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

  fieldDefinition: {
    ...common,

    /*
     * We customize the common `name` field label for SysBOUser.
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
export const sysBOPrincipalsMetadata: SysBOMetadata<SysBOPrincipal> = {
  key: 'sys-principals',
  name: 'Principal',
  pluralName: 'Principals',

  primaryField: 'name',

  fieldDefinition: {
    ...common,

    principalType: {
      key: 'principalType',
      label: 'Principal type',
      type: 'enum',
      order: 20,

      required: true,
      enumValues: Object.values(SysBOPrincipalType),
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
export const sysBOApplicationsMetadata: SysBOMetadata<SysBOApplication> = {
  key: 'sys-applications',
  name: 'Application',
  pluralName: 'Applications',

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
 * A Company-owned license belongs to a SysBOPrincipal (customer identity) and
 * targets exactly one platform. An optional SysBOApplication restriction is
 * currently meaningful for mCRM; omitting it represents platform-wide scope.
 */
export const sysBOLicensesMetadata: SysBOMetadata<SysBOLicense> = {
  key: 'sys-licenses',
  name: 'License',
  pluralName: 'Licenses',

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

    platformId: {
      key: 'platformId',
      label: 'Platform',
      type: 'enum',
      order: 30,

      required: true,
      enumValues: MANATOS_COMPANY.platforms.filter((platform) => platform.enabled).map((platform) => platform.id),
    },

    applicationId: {
      key: 'applicationId',
      label: 'Application restriction',
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

    status: {
      key: 'status',
      label: 'Status',
      type: 'enum',
      order: 60,

      required: true,
      enumValues: Object.values(SysBOLicenseStatus),
    },

    validFrom: {
      key: 'validFrom',
      label: 'Valid from',
      type: 'date',
      order: 70,
    },

    validUntil: {
      key: 'validUntil',
      label: 'Valid until',
      type: 'date',
      order: 80,

      nullable: true,
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

/** Persisted application configuration metadata. */
export const sysBOConfigurationsMetadata: SysBOMetadata<SysBOConfiguration> = {
  key: 'sys-configurations',
  name: 'Configuration',
  pluralName: 'Configurations',
  primaryField: 'name',
  fieldDefinition: {
    ...common,
    name: { ...common.name!, label: 'Setting', readOnly: true },
    value: { key: 'value', label: 'Value', type: 'string', order: 20, nullable: true },
    valueEncrypted: { key: 'valueEncrypted', label: 'Encrypted value', type: 'string', order: 21, sensitive: true, readOnly: true, nullable: true },
    group: { key: 'group', label: 'Group', type: 'string', order: 30, readOnly: true },
    description: { key: 'description', label: 'Help', type: 'string', order: 40, readOnly: true },
    valueType: { key: 'valueType', label: 'Type', type: 'string', order: 50, readOnly: true },
    allowedValues: { key: 'allowedValues', label: 'Allowed values', type: 'string', order: 60, readOnly: true, nullable: true },
    defaultValue: { key: 'defaultValue', label: 'Default', type: 'string', order: 70, readOnly: true, nullable: true },
    restartRequired: { key: 'restartRequired', label: 'Restart required', type: 'boolean', order: 80, readOnly: true },
    editable: { key: 'editable', label: 'Editable', type: 'boolean', order: 90, readOnly: true },
    sensitive: { key: 'sensitive', label: 'Sensitive', type: 'boolean', order: 100, readOnly: true },
  },
};

/** Company-owned external OAuth/OIDC provider configuration metadata. */
export const sysBOExtAuthProvidersMetadata: SysBOMetadata<SysBOExtAuthProvider> = {
  key: 'sys-ext-auth-providers',
  name: 'External authentication provider',
  pluralName: 'External authentication providers',
  primaryField: 'name',
  fieldDefinition: {
    ...common,
    name: { ...common.name!, label: 'Provider name', readOnly: true },
    provider: { key: 'provider', label: 'Provider', type: 'enum', order: 20, required: true, unique: true, enumValues: Object.values(SysBOExtAuthProviderType) },
    clientId: { key: 'clientId', label: 'Client ID', type: 'string', order: 30, maxLength: 500 },
    clientSecretEncrypted: { key: 'clientSecretEncrypted', label: 'Client secret', type: 'string', order: 40, sensitive: true, readOnly: true, nullable: true },
    callbackPath: { key: 'callbackPath', label: 'Callback path', type: 'string', order: 50, required: true, maxLength: 300, generated: true, readOnly: true },
    tenant: { key: 'tenant', label: 'Tenant', type: 'string', order: 60, nullable: true, maxLength: 100 },
    secretUpdatedAt: { key: 'secretUpdatedAt', label: 'Secret updated', type: 'date', order: 70, nullable: true, readOnly: true },
    credentialsVerified: { key: 'credentialsVerified', label: 'Credentials verified', type: 'boolean', order: 75, required: true, readOnly: true, applicationManaged: true },
    credentialsVerifiedAt: { key: 'credentialsVerifiedAt', label: 'Credentials verified at', type: 'date', order: 76, nullable: true, readOnly: true, applicationManaged: true },
    hasClientSecret: { key: 'hasClientSecret', label: 'Secret stored', type: 'boolean', order: 80, generated: true, readOnly: true },
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
  [sysBOApplicationsMetadata.key]: sysBOApplicationsMetadata,
  [sysBOLicensesMetadata.key]: sysBOLicensesMetadata,
  [sysBOExtAuthProvidersMetadata.key]: sysBOExtAuthProvidersMetadata,
  [sysBOConfigurationsMetadata.key]: sysBOConfigurationsMetadata,
} as const;
