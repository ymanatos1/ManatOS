import {
  SysBOLicenseStatus,
  SysBOUserRole,
  type SysBOLicense,
} from './domain.js';
import type {
  CompanyInfo,
  SysPlatform,
} from './company-platform-types.js';

/*
 * Concrete company/platform catalogue and composition helpers live here.
 * Structural contracts are separated into company-platform-types.ts.
 */
export * from './company-platform-types.js';

/** Stable identifier used by persisted platform-aware records. */
export const MCRM_PLATFORM_ID = 'mcrm';

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
      requiresAuthentication: true,
    },
    {
      id: 'administration',
      text: 'Administration',
      icon: 'bi-gear',
      order: 300,
      requiresAuthentication: true,
      // Every authenticated role may reach at least the Users area. Child
      // contributions carry their own role rules so Guest does not inherit
      // unrelated administration entries.
      roles: [SysBOUserRole.Admin, SysBOUserRole.Superuser, SysBOUserRole.User, SysBOUserRole.Guest],
    },
    {
      id: 'users',
      parentId: 'administration',
      text: 'Users',
      icon: 'bi-people-fill',
      url: '/bo/sys-users',
      order: 310,
      requiresEntityKeys: ['sys-users'],
      roles: [SysBOUserRole.Admin, SysBOUserRole.Superuser, SysBOUserRole.User, SysBOUserRole.Guest],
    },
    {
      id: 'principals',
      parentId: 'administration',
      text: 'Principals',
      icon: 'bi-people-fill',
      url: '/bo/sys-principals',
      order: 320,
      requiresEntityKeys: ['sys-principals'],
      roles: [SysBOUserRole.Admin, SysBOUserRole.Superuser, SysBOUserRole.User],
    },
    {
      id: 'configuration',
      text: 'Configuration',
      icon: 'bi-sliders2',
      order: 890,
      separatorBefore: true,
      requiresAuthentication: true,
      roles: [SysBOUserRole.Admin],
    },
    {
      id: 'system-configuration',
      parentId: 'configuration',
      text: 'Configuration',
      icon: 'bi-sliders',
      url: '/configuration',
      order: 400,
      requiresAuthentication: true,
      roles: [SysBOUserRole.Admin],
      requiresEntityKeys: ['sys-configurations'],
    },
    {
      id: 'external-authentication',
      parentId: 'configuration',
      text: 'External authentication',
      icon: 'bi-globe2',
      url: '/bo/sys-ext-auth-providers',
      order: 410,
      requiresAuthentication: true,
      roles: [SysBOUserRole.Admin],
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
      roles: [SysBOUserRole.Admin, SysBOUserRole.Superuser, SysBOUserRole.User],
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
      requiresAuthentication: true,
    },
    {
      id: 'logout',
      text: 'Logout',
      icon: 'bi-box-arrow-right',
      url: '/auth/logout',
      order: 1000,
      requiresAuthentication: true,
    },
  ],
  defaultPlatformId: MCRM_PLATFORM_ID,
  platforms: [
    {
      id: MCRM_PLATFORM_ID,
      code: 'mCRM',
      name: 'ManatOS CRM Platform',
      shortName: 'mCRM',
      description:
        'CRM platform for managing customer relationships, business activity and connected applications.',
      enabled: true,
      headerImage: {
        src: '/assets/platforms/mcrm/mcrm-customer-network.png',
        alt: 'mCRM connected customer relationship network',
      },
      presentation: {
        subtitle: 'ManatOS Dynamic Customer Relationship Management Platform',
        intro:
          'mCRM is the ManatOS platform for building dynamic customer relationship management applications. Define and evolve CRM applications with configurable business models, relationships and processes; control access through licensing; test and explore them in the Playground; and prepare applications for independent delivery as they mature.',
        features: [
          {
            id: 'customer-360',
            title: 'Customer 360°',
            description: 'Unified customer view across contacts, organizations and interactions.',
            icon: 'bi-people-fill',
          },
          {
            id: 'opportunities',
            title: 'Opportunities',
            description: 'Track pipeline, manage opportunities and support business growth.',
            icon: 'bi-bullseye',
          },
          {
            id: 'activities',
            title: 'Activities',
            description: 'Plan tasks, meetings, follow-ups and reminders in one place.',
            icon: 'bi-calendar-check',
          },
          {
            id: 'communications',
            title: 'Communications',
            description: 'Keep emails, calls and messages connected to the customer context.',
            icon: 'bi-envelope-fill',
          },
          {
            id: 'documents',
            title: 'Documents',
            description: 'Store and manage documents and files related to your customers.',
            icon: 'bi-folder-fill',
          },
          {
            id: 'analytics',
            title: 'Analytics',
            description: 'Turn relationship and activity data into useful reports and insights.',
            icon: 'bi-bar-chart-fill',
          },
        ],
      },
      entities: [
        {
          sysBOKey: 'sys-applications',
          description: 'Applications designed and managed by the mCRM platform.',
        },
      ],
      navigation: [
        {
          id: 'app-playground',
          text: 'Apps Playground',
          icon: 'bi-play-circle-fill',
          url: '/app-playground',
          order: 200,
          requiresAuthentication: true,
          requiresEntityKeys: ['sys-applications'],
          requiresPlatformEntitlement: true,
        },
        {
          id: 'applications',
          parentId: 'administration',
          text: 'Applications',
          icon: 'bi-window-stack',
          url: '/bo/sys-applications',
          order: 330,
          requiresEntityKeys: ['sys-applications'],
          requiresAuthentication: true,
          requiresPlatformEntitlement: true,
        },
      ],
    },
  ],
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
