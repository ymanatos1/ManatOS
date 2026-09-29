import { SysBOPrincipalType } from '../../../domain/entities.js';
import type { ManatOSSubsystemMetadata } from '../types.js';

export const SYSBO_PRINCIPAL_TYPE_ENUM = {
  key: 'SysBOPrincipalType',
  name: 'SysBOPrincipalType',
  label: 'Principal type',
  calculatedProperties: {
    canBeOrganizationRoot: { expression: 'isContainer' },
    canStandAloneOrganization: { expression: '!isContainer' },
  },
  values: {
    Person: {
      value: SysBOPrincipalType.Person,
      label: 'Person',
      icon: 'person',
      isContainer: false,
      canHaveParent: true,
    },
    Company: {
      value: SysBOPrincipalType.Company,
      label: 'Company',
      icon: 'building',
      isContainer: true,
      canHaveParent: false,
    },
    Group: {
      value: SysBOPrincipalType.Group,
      label: 'Group',
      icon: 'people',
      isContainer: true,
      canHaveParent: true,
    },
    System: {
      value: SysBOPrincipalType.System,
      label: 'System',
      icon: 'gear',
      isContainer: false,
      canHaveParent: true,
    },
  },
} as const;

export const PRINCIPALS_SUBSYSTEM = {
  key: 'principals',
  name: 'principals',
  label: 'Principals',
  description: 'Reusable people, organizations, groups and other business/security principals.',
  owner: { kind: 'manatos' },
  enums: { [SYSBO_PRINCIPAL_TYPE_ENUM.key]: SYSBO_PRINCIPAL_TYPE_ENUM },
} as const satisfies ManatOSSubsystemMetadata;
