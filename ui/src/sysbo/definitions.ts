import {
  MANATOS_COMPANY,
  effectiveEntityKeys,
  resolvePlatform,
  SysBOUserRole,
  type CompanyInfo,
  type SysPlatform,
  sysBOApplicationsMetadata,
  sysBOConfigurationsMetadata,
  sysBOExtAuthProvidersMetadata,
  sysBOLicensesMetadata,
  sysBOPrincipalsMetadata,
  sysBOUsersMetadata,
} from '@manatos/shared';

import type { SysBODefinition, SysBOPermissions } from './types.js';

/**
 * System-business-object permissions are role/action specific. Canonical UI
 * presentation comes from `$metadata-ui`; this registry owns only access facts
 * and shell/navigation identity for each routed SysBO.
 */
const adminRoles = [SysBOUserRole.Admin];
const readRoles = [
  SysBOUserRole.Admin,
  SysBOUserRole.Superuser,
  SysBOUserRole.User,
  SysBOUserRole.Guest,
];

const permissions: SysBOPermissions = {
  view: readRoles,
  create: adminRoles,
  edit: adminRoles,
  delete: adminRoles,
};

export const sysBODefinitions: Record<string, SysBODefinition> = {
  'sys-users': {
    key: 'sys-users',
    boMetadata: sysBOUsersMetadata,
    icon: 'bi-people-fill',
    permissions,
  },
  'sys-principals': {
    key: 'sys-principals',
    boMetadata: sysBOPrincipalsMetadata,
    // People is intentionally broader than a hierarchy-only icon: a Principal
    // may be a Company, Group, Person or System identity.
    icon: 'bi-people-fill',
    permissions,
  },
  'sys-applications': {
    key: 'sys-applications',
    boMetadata: sysBOApplicationsMetadata,
    icon: 'bi-window-stack',
    permissions,
  },
  'sys-configurations': {
    key: 'sys-configurations',
    boMetadata: sysBOConfigurationsMetadata,
    icon: 'bi-sliders2',
    permissions: { view: adminRoles, create: [], edit: adminRoles, delete: [] },
  },
  'sys-ext-auth-providers': {
    key: 'sys-ext-auth-providers',
    boMetadata: sysBOExtAuthProvidersMetadata,
    icon: 'bi-globe2',
    permissions: { view: adminRoles, create: adminRoles, edit: adminRoles, delete: adminRoles },
  },
  'sys-licenses': {
    key: 'sys-licenses',
    boMetadata: sysBOLicensesMetadata,
    icon: 'bi-key',
    permissions,
  },
};

export function getSysBODefinition(key: string): SysBODefinition {
  const definition = sysBODefinitions[key];
  if (!definition) throw new Error(`Unknown SysBO '${key}'.`);
  return definition;
}

/** Compose the UI-visible registry from Company + active Platform ownership. */
export function effectiveSysBODefinitions(
  company: CompanyInfo = MANATOS_COMPANY,
  platform: SysPlatform = resolvePlatform(company),
): Record<string, SysBODefinition> {
  const keys = effectiveEntityKeys(company, platform);
  return Object.fromEntries(
    Object.entries(sysBODefinitions).filter(([key]) => keys.has(key)),
  );
}
