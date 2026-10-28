import type { SysBOLicense } from '../../../../domain/entities.js';
import type { SysBOMetadata } from '../../types.js';
import { commonSysBOFields } from '../../common.js';

export const sysBOLicensesMetadata: SysBOMetadata<SysBOLicense> = {
  key: 'sys-licenses',
  name: 'sysLicenses',
  subsystem: 'licensing',
  label: '@EN.manatos.licensing.licenses.label.License' /* License */,
  pluralLabel: '@EN.manatos.licensing.licenses.pluralLabel.Licenses' /* Licenses */,

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
      label: '@EN.manatos.licensing.licenses.label.Customer' /* Customer */,
      type: 'reference',
      order: 20,

      required: true,
    },

    platformId: {
      key: 'platformId',
      label: '@EN.manatos.licensing.licenses.label.Platform' /* Platform */,
      type: 'enum',
      order: 30,

      required: true,
      createDefaultValue: {
        expression: "FirstCtx($enums.SysPlatform.values, 'value')",
      },
      enum: 'SysPlatform',
    },

    applicationId: {
      key: 'applicationId',
      label: '@EN.manatos.licensing.licenses.label.Application' /* Application */,
      type: 'reference',
      order: 40,

      nullable: true,
    },

    licenseKey: {
      key: 'licenseKey',
      label: '@EN.manatos.licensing.licenses.label.LicenseKey' /* License key */,
      type: 'string',
      order: 50,

      maxLength: 250,
    },

    rules: {
      key: 'rules',
      label: '@EN.manatos.licensing.licenses.label.Rules' /* Rules */,
      type: 'string',
      order: 55,

      maxLength: 4000,
    },

    status: {
      key: 'status',
      label: '@EN.manatos.licensing.licenses.label.Status' /* Status */,
      type: 'enum',
      order: 60,

      required: true,
      createDefaultValue: 'Active',
      enum: 'SysBOLicenseStatus',
    },

    validFrom: {
      key: 'validFrom',
      label: '@EN.manatos.licensing.licenses.label.ValidFrom' /* Valid from */,
      type: 'date',
      order: 70,
      createDefaultValue: { expression: 'CurrentDay()' },
    },

    validityDuration: {
      key: 'validityDuration',
      label: '@EN.manatos.licensing.licenses.label.ValidityDuration' /* Validity duration */,
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
      label: '@EN.manatos.licensing.licenses.label.ValidUntil' /* Valid until */,
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
      label: '@EN.manatos.licensing.licenses.label.Quantity' /* Quantity */,
      type: 'number',
      order: 90,

      required: true,
      createDefaultValue: 1,
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

// ============================================================================
// SYS CONFIGURATION
// ============================================================================
/** Persisted application configuration metadata. */
