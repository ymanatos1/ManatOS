import {
  MANATOS_COMPANY,
  effectiveEntityKeys,
  resolvePlatform,
  type CompanyInfo,
  type SysPlatform,
  sysBOApplicationsMetadata,
  sysBOConfigurationsMetadata,
  sysBOExtAuthProvidersMetadata,
  sysBOEmailAddressesMetadata,
  sysBOPrincipalEmailAddressesMetadata,
  sysBOTelephoneNumbersMetadata,
  sysBOPrincipalTelephoneNumbersMetadata,
  sysBOAddressesMetadata,
  sysBOPrincipalAddressesMetadata,
  sysBOLicensesMetadata,
  sysBOPrincipalsMetadata,
  sysBOUsersMetadata,
} from '@manatos/shared';

import type { SysBODefinition } from './types.js';

/**
 * UI-visible SysBO registry. Authorization policy deliberately does not live
 * here: generic routes obtain authoritative capability projections from the API.
 */
export const sysBODefinitions: Record<string, SysBODefinition> = {
  'sys-users': {
    key: 'sys-users',
    boMetadata: sysBOUsersMetadata,
    icon: 'bi-people-fill',
  },
  'sys-principals': {
    key: 'sys-principals',
    boMetadata: sysBOPrincipalsMetadata,
    // Canonical Principal entity icon. Organization-node composition is a
    // visualization concern and must never alter this page/navigation identity.
    icon: 'bi-diagram-3-fill',
  },
  'sys-email-addresses': {
    key: 'sys-email-addresses',
    boMetadata: sysBOEmailAddressesMetadata,
    icon: 'bi-envelope',
  },
  'sys-principal-email-addresses': {
    key: 'sys-principal-email-addresses',
    boMetadata: sysBOPrincipalEmailAddressesMetadata,
    icon: 'bi-link-45deg',
  },
  'sys-telephone-numbers': {
    key: 'sys-telephone-numbers',
    boMetadata: sysBOTelephoneNumbersMetadata,
    icon: 'bi-telephone',
  },
  'sys-principal-telephone-numbers': {
    key: 'sys-principal-telephone-numbers',
    boMetadata: sysBOPrincipalTelephoneNumbersMetadata,
    icon: 'bi-link-45deg',
  },
  'sys-addresses': {
    key: 'sys-addresses',
    boMetadata: sysBOAddressesMetadata,
    icon: 'bi-geo-alt',
  },
  'sys-principal-addresses': {
    key: 'sys-principal-addresses',
    boMetadata: sysBOPrincipalAddressesMetadata,
    icon: 'bi-link-45deg',
  },
  'sys-applications': {
    key: 'sys-applications',
    boMetadata: sysBOApplicationsMetadata,
    icon: 'bi-window-stack',
  },
  'sys-configurations': {
    key: 'sys-configurations',
    boMetadata: sysBOConfigurationsMetadata,
    icon: 'bi-sliders2',
  },
  'sys-ext-auth-providers': {
    key: 'sys-ext-auth-providers',
    boMetadata: sysBOExtAuthProvidersMetadata,
    icon: 'bi-globe2',
  },
  'sys-licenses': {
    key: 'sys-licenses',
    boMetadata: sysBOLicensesMetadata,
    icon: 'bi-key',
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
