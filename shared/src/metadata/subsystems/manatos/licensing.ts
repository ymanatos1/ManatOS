import { SysBOLicenseStatus } from '../../../domain/entities.js';
import type { ManatOSSubsystemMetadata } from '../types.js';

export const SYSBO_LICENSE_STATUS_ENUM = {
  key: 'SysBOLicenseStatus',
  name: 'SysBOLicenseStatus',
  label: '@SS.manatos.licensing.label.LicenseStatus' /* License status */,
  values: {
    Active: {
      value: SysBOLicenseStatus.Active,
      label: { EN: 'Active', EL: 'Ενεργή' },
      icon: 'check-circle-fill',
      tone: 'success',
    },
    Suspended: {
      value: SysBOLicenseStatus.Suspended,
      label: { EN: 'Suspended', EL: 'Σε αναστολή' },
      icon: 'pause-circle-fill',
      tone: 'warning',
    },
    Expired: {
      value: SysBOLicenseStatus.Expired,
      label: { EN: 'Expired', EL: 'Ληγμένη' },
      icon: 'clock-history',
      tone: 'danger',
      toneStrength: 'soft',
    },
    Cancelled: {
      value: SysBOLicenseStatus.Cancelled,
      label: { EN: 'Cancelled', EL: 'Ακυρωμένη' },
      icon: 'x-circle-fill',
      tone: 'danger',
      toneStrength: 'strong',
    },
  },
} as const;

export const LICENSING_SUBSYSTEM = {
  key: 'licensing',
  name: 'licensing',
  label: '@SS.manatos.licensing.label.Licensing' /* Licensing */,
  description:
    '@SS.manatos.licensing.description.LicensesAndLicensingRulescapabilities' /* Licenses and licensing rules/capabilities. */,
  owner: { kind: 'manatos' },
  enums: { [SYSBO_LICENSE_STATUS_ENUM.key]: SYSBO_LICENSE_STATUS_ENUM },
} as const satisfies ManatOSSubsystemMetadata;
