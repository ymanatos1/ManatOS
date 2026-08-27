import { SysUserRole } from './domain.js';

/**
 * Lightweight image reference used by shared company/platform branding.
 *
 * Paths are public UI asset paths rather than filesystem paths. Keeping
 * branding references in shared metadata lets the website and future clients
 * consume the same semantic company/platform identity without duplicating
 * literal names and asset choices.
 */
export interface ImageRef {
  src: string;
  alt: string;
  title?: string;
}

/** Theme-specific alternative assets for branding that changes with the UI theme. */
export interface ThemedImageRef {
  darker: ImageRef;
  lighter: ImageRef;
}

/**
 * One navigation contribution supplied by either the company or a platform.
 *
 * Contributions are intentionally flat. `parentId` lets the UI composition
 * layer merge contributions from different owners into the same container
 * (for example Company and mCRM can both contribute children to
 * Administration or Configuration).
 */
export interface NavigationContribution {
  id: string;
  text: string;
  icon?: string;
  url?: string;
  action?: string;
  parentId?: string;
  order: number;
  separatorBefore?: boolean;
  dockBottom?: boolean;
  requiresAuthentication?: boolean;
  roles?: SysUserRole[];

  /**
   * Optional capability dependency. The item is omitted unless every named
   * SysBO is contributed by the effective Company + current Platform model.
   */
  requiresEntityKeys?: string[];
}

/**
 * One SysBO/entity capability contributed by a company or platform.
 *
 * The actual BO metadata remains in bo-metadata.ts. This descriptor answers
 * the separate architectural question "who contributes this capability?".
 */
export interface EntityContribution {
  sysBOKey: string;
  description?: string;
}

/**
 * A code-defined ManatOS platform entity.
 *
 * SysPlatform is intentionally a first-class shared domain concept with a
 * stable identity, name and enabled state, but it is NOT a SysBOEntity:
 * SysBOEntity currently means a persisted/audited record. Platform catalogue
 * entries are product architecture owned by source code and are therefore
 * read-only rather than database-maintainable.
 */
export interface SysPlatform {
  id: string;
  code: string;
  name: string;
  shortName: string;
  description?: string;
  enabled: boolean;
  logo?: ImageRef;
  headerImage?: ImageRef;
  entities: EntityContribution[];
  navigation: NavigationContribution[];
}

/** @deprecated Prefer SysPlatform for new code. */
export type PlatformInfo = SysPlatform;

export interface CompanyInfo {
  id: string;
  name: string;
  shortName: string;
  description?: string;
  branding: {
    headerLogo: ThemedImageRef;
    companyPageImage?: ImageRef;
  };
  entities: EntityContribution[];
  navigation: NavigationContribution[];
  defaultPlatformId: string;
  /** Company-owned Home-page presentation. */
  home: {
    eyebrow: string;
    title: string;
    description: string;
  };
  platforms: SysPlatform[];
}

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
    title: 'A data-driven platform to design and test real applications',
    description: 'Reusable metadata provides a clean baseline for secure, maintainable application development.',
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
      // Preserve the existing User/Admin visibility and add Superuser.
      roles: [SysUserRole.Admin, SysUserRole.Superuser, SysUserRole.User],
    },
    {
      id: 'users',
      parentId: 'administration',
      text: 'Users',
      icon: 'bi-people-fill',
      url: '/bo/sys-users',
      order: 310,
      requiresEntityKeys: ['sys-users'],
    },
    {
      id: 'principals',
      parentId: 'administration',
      text: 'Principals',
      icon: 'bi-diagram-3-fill',
      url: '/bo/sys-principals',
      order: 320,
      requiresEntityKeys: ['sys-principals'],
    },
    {
      id: 'configuration',
      text: 'Configuration',
      icon: 'bi-sliders2',
      order: 890,
      separatorBefore: true,
      requiresAuthentication: true,
      roles: [SysUserRole.Admin],
    },
    {
      id: 'external-authentication',
      parentId: 'configuration',
      text: 'External authentication',
      icon: 'bi-globe2',
      url: '/bo/sys-ext-auth-providers',
      order: 410,
      requiresAuthentication: true,
      roles: [SysUserRole.Admin],
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
    },
    {
      id: 'preferences',
      text: 'Preferences',
      icon: 'bi-sliders',
      action: 'open-preferences',
      order: 900,
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
      description: 'CRM platform for designing, operating and testing business applications.',
      enabled: true,
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
        },
        {
          id: 'applications',
          parentId: 'administration',
          text: 'Applications',
          icon: 'bi-window-stack',
          url: '/bo/sys-applications',
          order: 330,
          requiresEntityKeys: ['sys-applications'],
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
  const requested = company.platforms.find((platform) => platform.enabled && platform.id === platformId);
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
