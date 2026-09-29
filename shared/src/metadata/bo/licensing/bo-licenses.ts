import { SysBOLicenseStatus, type SysBOLicense } from '../../../domain/entities.js';
import { MANATOS_COMPANY } from '../../../domain/company-platform.js';
import type { SysBOMetadata } from '../types.js';
import { commonSysBOFields } from '../common.js';

export const sysBOLicensesMetadata: SysBOMetadata<SysBOLicense> = {
  key: 'sys-licenses',
  name: 'sysLicenses',
  subsystem: 'licensing',
  label: 'License',
  pluralLabel: 'Licenses',

  primaryField: 'name',

  // Canonical relationships
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

  // Canonical fields
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
      createDefaultValue: {
        expression: "FirstCtx($entity-fields.platformId.enumItems, 'value')",
      },
      enumValues: MANATOS_COMPANY.platforms
        .filter((platform) => platform.enabled)
        .map((platform) => platform.id),
      enumItems: MANATOS_COMPANY.platforms
        .filter((platform) => platform.enabled)
        .map((platform) => ({
          value: platform.id,
          label: platform.shortName,
          // SysPlatform icons use Bootstrap's `bi-*` form; canonical enum items
          // store the semantic key consumed by the universal enum component.
          ...(platform.icon ? { icon: platform.icon.replace(/^bi-/, '') } : {}),
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
      createDefaultValue: 'Active',
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
      createDefaultValue: { expression: 'CurrentDay()' },
    },

    validityDuration: {
      key: 'validityDuration',
      label: 'Validity duration',
      type: 'duration',
      order: 75,

      nullable: true,
      durationUnits: ['years', 'months', 'days'],
      calculation: {
        expression:
          'validFrom == null || validUntil == null ? null : CalendarDurationBetween(validFrom, validUntil)',
      },
    },

    validUntil: {
      key: 'validUntil',
      label: 'Valid until',
      type: 'date',
      order: 80,

      nullable: true,
      calculation: {
        expression:
          'validFrom == null || validityDuration == null ? null : CalendarAddDuration(validFrom, validityDuration)',
      },
    },

    quantity: {
      key: 'quantity',
      label: 'Quantity',
      type: 'number',
      order: 90,

      required: true,
      createDefaultValue: 1,
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

// ============================================================================
// SYS CONFIGURATION
// ============================================================================
/** Persisted application configuration metadata. */
