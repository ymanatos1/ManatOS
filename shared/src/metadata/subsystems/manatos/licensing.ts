import { SysBOLicenseStatus } from '../../../domain/entities.js';
import type { ManatOSSubsystemMetadata } from '../types.js';

export const SYSBO_LICENSE_STATUS_ENUM = {
  key: 'SysBOLicenseStatus',
  name: 'SysBOLicenseStatus',
  label: 'License status',
  values: {
    Active: {
      value: SysBOLicenseStatus.Active,
      label: 'Active',
      icon: 'check-circle-fill',
      tone: 'success',
    },
    Suspended: {
      value: SysBOLicenseStatus.Suspended,
      label: 'Suspended',
      icon: 'pause-circle-fill',
      tone: 'warning',
    },
    Expired: {
      value: SysBOLicenseStatus.Expired,
      label: 'Expired',
      icon: 'clock-history',
      tone: 'danger',
      toneStrength: 'soft',
    },
    Cancelled: {
      value: SysBOLicenseStatus.Cancelled,
      label: 'Cancelled',
      icon: 'x-circle-fill',
      tone: 'danger',
      toneStrength: 'strong',
    },
  },
} as const;

export const LICENSING_SUBSYSTEM = {
  key: 'licensing',
  name: 'licensing',
  label: 'Licensing',
  description: 'Licenses and licensing rules/capabilities.',
  owner: { kind: 'manatos' },
  enums: { [SYSBO_LICENSE_STATUS_ENUM.key]: SYSBO_LICENSE_STATUS_ENUM },
} as const satisfies ManatOSSubsystemMetadata;
