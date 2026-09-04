import {
  SysBOLicenseStatus,
  SysBOPrincipalType,
  type SysBOApplication,
  type SysBOConfiguration,
  type SysBOLicense,
  type SysBOPrincipal,
} from '../../domain.js';
import { MANATOS_COMPANY } from '../../company-platform.js';
import type { SysBOMetadata } from './types.js';
import { commonSysBOFields } from './common.js';

/**
 * Canonical Company/business metadata.
 *
 * These definitions are first-class SysBOs. The public registry remains in
 * bo-metadata.ts; this module owns their domain metadata declarations only.
 */

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

export const sysBOPrincipalsMetadata: SysBOMetadata<SysBOPrincipal> = {
  key: 'sys-principals',
  name: 'Principal',
  pluralName: 'Principals',

  primaryField: 'name',

  entry: {
    // Direct single-field identity stays explicit; calculated combinations should
    // use an expression instead of introducing concatenation-specific metadata.
    name: { field: 'name' },
    // Expression form is supported even for direct fields and still preserves
    // enum/reference metadata discovery for simple field expressions.
    type: { expression: 'principalType' },
    description: { field: 'description' },
  },

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
          canBeOrganizationRoot: false,
          canStandAloneOrganization: true,
        },
        {
          value: SysBOPrincipalType.Company,
          label: 'Company',
          icon: 'building',
          isContainer: true,
          canHaveParent: false,
          canBeOrganizationRoot: true,
          canStandAloneOrganization: false,
        },
        {
          value: SysBOPrincipalType.Group,
          label: 'Group',
          icon: 'people',
          isContainer: true,
          canHaveParent: true,
          canBeOrganizationRoot: true,
          canStandAloneOrganization: false,
        },
        {
          value: SysBOPrincipalType.System,
          label: 'System',
          icon: 'gear',
          isContainer: false,
          canHaveParent: true,
          canBeOrganizationRoot: false,
          canStandAloneOrganization: true,
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
 * currently meaningful for protoCRM; omitting it represents platform-wide scope.
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
