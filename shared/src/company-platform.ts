import {
  SysBOLicenseStatus,
  type SysBOLicense,
} from './domain.js';
import type {
  CompanyInfo,
  SysPlatform,
} from './platforms/types.js';
import { PROTOCRM_PLATFORM, PROTOCRM_PLATFORM_ID } from './platforms/protocrm/platform.js';

/*
 * Concrete company/platform catalogue and composition helpers live here.
 * Structural contracts live in platforms/types.ts and concrete product
 * definitions live beside each platform. The Company catalogue composes those
 * modules rather than duplicating their product metadata.
 */
export * from './platforms/types.js';
export { PROTOCRM_PLATFORM, PROTOCRM_PLATFORM_ID };

/**
 * Current ManatOS company/platform catalogue.
 *
 * Company-owned capabilities remain available regardless of which platform is
 * selected. Platform-owned capabilities are composed in only for the current
 * platform. There is currently one platform, but the shape is deliberately
 * multi-platform from the start.
 */
export const MANATOS_COMPANY: CompanyInfo = {
  id: 'manatos',
  name: 'ManatOS Software Solutions',
  shortName: 'ManatOS',
  description: 'Software platforms and reusable application foundations.',
  home: {
    eyebrow: 'ManatOS platform',
    title: 'The data-driven platform to design and instantly test real applications',
    description:
      'Reusable metadata provides a clean foundation for secure, maintainable, rich and dynamic application development.',
  },
  branding: {
    headerLogo: {
      darker: {
        src: '/assets/manatos-logo-middle-1.png',
        alt: 'ManatOS Software Solutions',
      },
      lighter: {
        src: '/assets/manatos-logo-middle-2.png',
        alt: 'ManatOS Software Solutions',
      },
    },
    companyPageImage: {
      src: '/assets/company/company-2.jpg',
      alt: 'ManatOS Software Solutions',
    },
  },
  entities: [
    { sysBOKey: 'sys-users', description: 'Website/security users.' },
    { sysBOKey: 'sys-principals', description: 'Customer/commercial identities.' },
    { sysBOKey: 'sys-licenses', description: 'Company-managed platform licenses.' },
    { sysBOKey: 'sys-ext-auth-providers', description: 'External authentication providers.' },
    { sysBOKey: 'sys-configurations', description: 'Runtime application configuration.' },
  ],
  navigation: [
    {
      id: 'account',
      text: 'Account',
      icon: 'bi-person-vcard',
      url: '/account',
      order: 100,
      visible: { expression: 'user.permissions.userRole !== null' },
    },
    {
      id: 'administration',
      text: 'Administration',
      icon: 'bi-gear',
      order: 300,
      // Every authenticated role may reach at least the Users area. Child
      // contributions carry their own visibility rules so Guest does not inherit
      // unrelated administration entries.
      visible: { expression: 'user.permissions.userRole !== null' },
    },
    {
      id: 'users',
      parentId: 'administration',
      text: 'Users',
      icon: 'bi-people-fill',
      url: '/bo/sys-users',
      order: 310,
      requiresEntityKeys: ['sys-users'],
      visible: { expression: 'user.permissions.userRole !== null' },
    },
    {
      id: 'principals',
      parentId: 'administration',
      text: 'Principals',
      icon: 'bi-diagram-3-fill',
      url: '/bo/sys-principals',
      order: 320,
      requiresEntityKeys: ['sys-principals'],
      visible: {
        expression: "user.permissions.userRole !== 'Guest'",
      },
    },
    {
      id: 'configuration',
      text: 'Configuration',
      icon: 'bi-sliders2',
      order: 890,
      separatorBefore: true,
      visible: { expression: "user.permissions.userRole === 'Admin'" },
    },
    {
      id: 'system-configuration',
      parentId: 'configuration',
      text: 'Configuration',
      icon: 'bi-sliders',
      url: '/configuration',
      order: 400,
      visible: { expression: "user.permissions.userRole === 'Admin'" },
      requiresEntityKeys: ['sys-configurations'],
    },
    {
      id: 'external-authentication',
      parentId: 'configuration',
      text: 'External authentication',
      icon: 'bi-globe2',
      url: '/bo/sys-ext-auth-providers',
      order: 410,
      visible: { expression: "user.permissions.userRole === 'Admin'" },
      requiresEntityKeys: ['sys-ext-auth-providers'],
    },
    {
      id: 'licenses',
      parentId: 'administration',
      text: 'Licenses',
      icon: 'bi-key',
      url: '/bo/sys-licenses',
      order: 340,
      requiresEntityKeys: ['sys-licenses'],
      visible: {
        expression: "user.permissions.userRole !== 'Guest'",
      },
    },
    {
      id: 'preferences',
      text: 'Preferences',
      icon: 'bi-sliders',
      action: 'open-preferences',
      order: 900,
      // Preferences starts the personal/session action group. Keep the group
      // divider on Preferences itself so it remains visible when Admin-only
      // Configuration is filtered out for User/Superuser roles.
      separatorBefore: true,
      visible: { expression: 'user.permissions.userRole !== null' },
    },
    {
      id: 'logout',
      text: 'Logout',
      icon: 'bi-box-arrow-right',
      url: '/auth/logout',
      order: 1000,
      visible: { expression: 'user.permissions.userRole !== null' },
    },
  ],
  defaultPlatformId: PROTOCRM_PLATFORM_ID,
  platforms: [PROTOCRM_PLATFORM],
};

/** Resolve one enabled platform, falling back to the configured default. */
export function resolvePlatform(
  company: CompanyInfo,
  platformId: string | null | undefined = company.defaultPlatformId,
): SysPlatform {
  const requested = company.platforms.find(
    (platform) => platform.enabled && platform.id === platformId,
  );
  const fallback = company.platforms.find(
    (platform) => platform.enabled && platform.id === company.defaultPlatformId,
  );

  if (!requested && !fallback) {
    throw new Error(`Company '${company.id}' has no enabled default platform.`);
  }

  return requested ?? fallback!;
}

/** Entity keys available after composing Company + current Platform capabilities. */
export function effectiveEntityKeys(company: CompanyInfo, platform: SysPlatform): Set<string> {
  return new Set([
    ...company.entities.map((entry) => entry.sysBOKey),
    ...platform.entities.map((entry) => entry.sysBOKey),
  ]);
}


/**
 * True when a persisted license is effective at the supplied instant.
 *
 * This helper is shared by API authorization and UI navigation so date/status/
 * quantity semantics cannot drift between the security boundary and menus.
 */
export function licenseIsEffective(
  license: SysBOLicense,
  at: Date = new Date(),
): boolean {
  if (!license.enabled || license.status !== SysBOLicenseStatus.Active || license.quantity <= 0) {
    return false;
  }

  const now = at.getTime();
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/;
  const boundary = (value: string | null | undefined, endOfDay: boolean) => {
    if (!value) return endOfDay ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed)) return Number.NaN;
    // Date-only license boundaries are inclusive calendar days. Preserve legacy
    // date-time values as exact instants while treating YYYY-MM-DD validUntil as
    // the end of that UTC calendar day rather than its first millisecond.
    return endOfDay && dateOnly.test(value) ? parsed + 24 * 60 * 60 * 1000 - 1 : parsed;
  };
  const validFrom = boundary(license.validFrom, false);
  const validUntil = boundary(license.validUntil, true);

  if (!Number.isFinite(validFrom) && license.validFrom) return false;
  if (!Number.isFinite(validUntil) && license.validUntil) return false;

  return validFrom <= now && now <= validUntil;
}

/** True when an effective license grants access to the named platform. */
export function licenseGrantsPlatformAccess(
  license: SysBOLicense,
  platformId: string,
  at: Date = new Date(),
): boolean {
  return license.platformId === platformId && licenseIsEffective(license, at);
}

/**
 * True when an effective platform license also permits the named application.
 * A missing applicationId means platform-wide access.
 */
export function licenseGrantsApplicationAccess(
  license: SysBOLicense,
  platformId: string,
  applicationId: string,
  at: Date = new Date(),
): boolean {
  return licenseGrantsPlatformAccess(license, platformId, at)
    && (!license.applicationId || license.applicationId === applicationId);
}
