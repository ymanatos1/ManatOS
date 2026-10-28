import { SysBOPrincipalType } from '../../../domain/entities.js';
import type { ManatOSSubsystemMetadata } from '../types.js';

export const SYSBO_PRINCIPAL_TYPE_ENUM = {
  key: 'SysBOPrincipalType',
  name: 'SysBOPrincipalType',
  label: '@SS.manatos.principals.label.PrincipalType' /* Principal type */,
  calculatedProperties: {
    canBeOrganizationRoot: { expression: 'isContainer' },
    canStandAloneOrganization: { expression: '!isContainer' },
  },
  values: {
    Person: {
      value: SysBOPrincipalType.Person,
      label: { EN: 'Person', EL: 'Φυσικό πρόσωπο' },
      icon: 'person',
      isContainer: false,
      canHaveParent: true,
    },
    Company: {
      value: SysBOPrincipalType.Company,
      label: { EN: 'Company', EL: 'Εταιρεία' },
      icon: 'building',
      isContainer: true,
      canHaveParent: false,
    },
    Group: {
      value: SysBOPrincipalType.Group,
      label: { EN: 'Group', EL: 'Ομάδα' },
      icon: 'people',
      isContainer: true,
      canHaveParent: true,
    },
    System: {
      value: SysBOPrincipalType.System,
      label: { EN: 'System', EL: 'Σύστημα' },
      icon: 'gear',
      isContainer: false,
      canHaveParent: true,
    },
  },
} as const;

export const PRINCIPALS_SUBSYSTEM = {
  key: 'principals',
  name: 'principals',
  label: '@SS.manatos.principals.label.Principals' /* Principals */,
  description:
    '@SS.manatos.principals.description.ReusablePeopleOrganizationsGroupsAndOther' /* Reusable people, organizations, groups and other business/security principals. */,
  owner: { kind: 'manatos' },
  enums: { [SYSBO_PRINCIPAL_TYPE_ENUM.key]: SYSBO_PRINCIPAL_TYPE_ENUM },
} as const satisfies ManatOSSubsystemMetadata;
