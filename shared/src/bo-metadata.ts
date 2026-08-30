import {
  SysBOExtAuthProviderType,
  SysBOLicenseStatus,
  SysBOPrincipalType,
  SysBOUserRole,
  type SysBOApplication,
  type SysBOConfiguration,
  type SysBOExtAuthProvider,
  type SysBOExternalIdentity,
  type SysBOLicense,
  type SysBOPrincipal,
  type SysBOUser,
  type SysBOUserInvitation,
  type SysBOUserPrincipal,
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
export interface SysBOEnumItemMetadata {
  /** Stored enum value submitted to the domain/API. */
  value: string;

  /** Optional human-readable caption; value is the fallback. */
  label?: string;

  /** Optional semantic icon key consumed by capable UI renderers. */
  icon?: string;

  /**
   * Enum-item traits are deliberately open-ended and evaluator-readable.
   * Domain metadata can therefore attach facts such as `isContainer` without
   * teaching the generic renderer about a particular enum or entity.
   */
  readonly [trait: string]: unknown;
}

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

  /** Optional rich metadata for enum values (labels, icons and declarative traits). */
  enumItems?: readonly SysBOEnumItemMetadata[];

  referenceBOKey?: string;
}


export type ManatOSRelationshipCardinality =
  | 'one-to-one'
  | 'many-to-one'
  | 'one-to-many'
  | 'many-to-many';

export type ManatOSRelationshipDeleteAction =
  | 'restrict'
  | 'cascade'
  | 'set-null'
  | 'unlink';

export type ManatOSRelationshipConfirmationPolicy =
  | 'silent'
  | 'confirm'
  | 'inherit';

export interface ManatOSRelationshipDeletePolicy {
  /** Referential-integrity consequence when the referenced record is deleted. */
  action: ManatOSRelationshipDeleteAction;

  /** Interaction policy is independent from the integrity action itself. */
  confirmation?: ManatOSRelationshipConfirmationPolicy;
}

export interface ManatOSRelationshipMetadata {
  /** FK/source fields stored on this object; arrays also support future composite keys. */
  fields: readonly string[];

  /** Canonical target object and referenced fields. */
  references: {
    objectKey: string;
    fields: readonly string[];
  };

  /** Physical/navigational cardinality. N:N normally uses an explicit junction object. */
  cardinality: ManatOSRelationshipCardinality;

  /** Optional semantic N:N navigation backed by a canonical junction object. */
  through?: {
    objectKey: string;
    sourceRelationship: string;
    targetRelationship: string;
  };

  /** Keyed policy collection leaves room for future relationship policies. */
  policies?: Readonly<{
    delete?: ManatOSRelationshipDeletePolicy;
  }>;
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
/** Canonical value derived from an entity record/context; persistence is opt-in. */
export interface SysBODerivedFieldMetadata {
  /** The parent Record key is the canonical derived-field name. */
  label: string;
  expression: string;

  /**
   * When true, the derived value is materialized into persisted entity data.
   * The default is false, preserving the normal calculated-only behavior.
   * Persistence infrastructure recalculates these values before commit so the
   * same rule applies to UI, API and automatic/background creation paths.
   */
  persisted?: boolean;
}

export interface ManatOSObjectMetadata<T> {
  /** Stable metadata identity; may describe a first-class SysBO or a related value object. */
  key: string;
  name: string;
  pluralName: string;

  /** Main human/business identifying property of one object instance. */
  primaryField: keyof T & string;

  /** Keyed canonical persisted/runtime field definitions. */
  fieldDefinition: Record<string, SysBOFieldMetadata>;

  /** Reusable object/domain calculations, independent from any particular UI. */
  derivedFields?: Readonly<Record<string, SysBODerivedFieldMetadata>>;

  /**
   * Keyed canonical relationships registered on the referencing side. `fields`
   * live on this object and point at `references.objectKey/references.fields`.
   * Reverse navigation/delete impacts can therefore be derived centrally.
   */
  relationships?: Readonly<Record<string, ManatOSRelationshipMetadata>>;
}

/** Canonical metadata for a first-class SysBO exposed through generic SysBO CRUD. */
export type SysBOMetadata<T> = ManatOSObjectMetadata<T>;

/**
 * Canonical metadata for a related/domain object that is not independently
 * exposed as a generic SysBO CRUD endpoint. It still deserves the same field
 * and derived-value semantics so renderers, reports and expressions can reuse it.
 */
export type ManatOSValueObjectMetadata<T> = ManatOSObjectMetadata<T>;

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
      expression: "hasPassword ? 'Configured' : 'Not configured'",
    },
  },

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
      readOnly: true,
      applicationManaged: true,
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

  derivedFields: {
    rootPrincipalId: {
      label: 'Root principal',
      expression: "parentId == null ? id : TraverseCtx(parentId, dataList, 'parentId', 'id')",
      persisted: true,
    },
  },

  relationships: {
    parent: {
      fields: ['parentId'],
      references: {objectKey: 'sys-principals', fields: ['id']},
      cardinality: 'many-to-one',
      policies: {delete: {action: 'set-null', confirmation: 'confirm'}},
    },
  },

  fieldDefinition: {
    ...common,

    principalType: {
      key: 'principalType',
      label: 'Principal type',
      type: 'enum',
      order: 20,

      required: true,
      enumValues: Object.values(SysBOPrincipalType),
      enumItems: [
        { value: SysBOPrincipalType.Person, label: 'Person', icon: 'person', isContainer: false, canHaveParent: true },
        { value: SysBOPrincipalType.Company, label: 'Company', icon: 'building', isContainer: true, canHaveParent: false },
        { value: SysBOPrincipalType.Group, label: 'Group', icon: 'people', isContainer: true, canHaveParent: true },
        { value: SysBOPrincipalType.System, label: 'System', icon: 'gear', isContainer: false, canHaveParent: false },
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

      required: true,
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

  relationships: {
    principal: {
      fields: ['principalId'],
      references: {objectKey: 'sys-principals', fields: ['id']},
      cardinality: 'many-to-one',
      policies: {delete: {action: 'restrict', confirmation: 'inherit'}},
    },
    application: {
      fields: ['applicationId'],
      references: {objectKey: 'sys-applications', fields: ['id']},
      cardinality: 'many-to-one',
      policies: {delete: {action: 'set-null', confirmation: 'confirm'}},
    },
  },

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
      references: {objectKey: 'sys-users', fields: ['id']},
      cardinality: 'many-to-one',
      policies: {delete: {action: 'cascade', confirmation: 'confirm'}},
    },
  },
  derivedFields: {
    providerEmailVerificationStatus: {
      label: 'Provider email verification',
      expression: "emailVerified ? 'Provider email verified' : 'Provider email not verified'",
    },
  },
  fieldDefinition: {
    ...common,
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
      references: {objectKey: 'sys-users', fields: ['id']},
      cardinality: 'many-to-one',
      policies: {delete: {action: 'unlink', confirmation: 'confirm'}},
    },
    principal: {
      fields: ['principalId'],
      references: {objectKey: 'sys-principals', fields: ['id']},
      cardinality: 'many-to-one',
      policies: {delete: {action: 'unlink', confirmation: 'confirm'}},
    },
  },
  fieldDefinition: {
    ...common,
    userId: {key: 'userId', label: 'User', type: 'reference', order: 20, required: true, referenceBOKey: 'sys-users'},
    principalId: {key: 'principalId', label: 'Principal', type: 'reference', order: 30, required: true, referenceBOKey: 'sys-principals'},
    relationship: {key: 'relationship', label: 'Relationship', type: 'string', order: 40, required: true},
    isDefault: {key: 'isDefault', label: 'Default', type: 'boolean', order: 50, required: true},
    description: {key: 'description', label: 'Description', type: 'string', order: 60, nullable: true, maxLength: 2000},
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
      references: {objectKey: 'sys-principals', fields: ['id']},
      cardinality: 'many-to-one',
      policies: {delete: {action: 'cascade', confirmation: 'confirm'}},
    },
  },
  fieldDefinition: {
    ...common,
    email: {key: 'email', label: 'Email', type: 'email', order: 20, required: true, maxLength: 320},
    principalId: {key: 'principalId', label: 'Principal', type: 'reference', order: 30, required: true, referenceBOKey: 'sys-principals'},
    relationship: {key: 'relationship', label: 'Relationship', type: 'string', order: 40, required: true},
    requestedRole: {key: 'requestedRole', label: 'Requested role', type: 'string', order: 50, required: true},
    tokenHash: {key: 'tokenHash', label: 'Token hash', type: 'string', order: 60, required: true, sensitive: true},
    expiresAt: {key: 'expiresAt', label: 'Expires', type: 'date', order: 70, required: true},
    usedAt: {key: 'usedAt', label: 'Used', type: 'date', order: 80, nullable: true},
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
  // Provider is the human/business identity shown as the clickable list value.
  primaryField: 'provider',
  fieldDefinition: {
    ...common,
    name: { ...common.name!, label: 'Provider name', readOnly: true },
    provider: {
      key: 'provider', label: 'Provider', type: 'enum', order: 20, required: true, unique: true,
      enumValues: Object.values(SysBOExtAuthProviderType),
      enumItems: [
        { value: SysBOExtAuthProviderType.Microsoft, label: 'Microsoft', icon: 'microsoft' },
        { value: SysBOExtAuthProviderType.Google, label: 'Google', icon: 'google' },
        { value: SysBOExtAuthProviderType.Facebook, label: 'Facebook', icon: 'facebook' },
        { value: SysBOExtAuthProviderType.GitHub, label: 'GitHub', icon: 'github' },
      ],
    },
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

/** All canonical objects, used by relationship/report/designer registries. */
export const allManatOSObjectMetadata = {
  ...allSysBOMetadata,
  ...allManatOSValueObjectMetadata,
} as const;
