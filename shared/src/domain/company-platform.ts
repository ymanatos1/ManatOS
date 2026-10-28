import { SysBOLicenseStatus, type SysBOLicense } from './entities.js';
import type { CompanyInfo, SysPlatform } from '../platforms/types.js';
import { PROTOCRM_PLATFORM, PROTOCRM_PLATFORM_ID } from '../platforms/protocrm/platform.js';
import { PANOPTES_PLATFORM, PANOPTES_PLATFORM_ID } from '../platforms/panoptes/platform.js';

/*
 * Concrete company/platform catalogue and composition helpers live here.
 * Structural contracts live in platforms/types.ts and concrete product
 * definitions live beside each platform. The Company catalogue composes those
 * modules rather than duplicating their product metadata.
 */
export * from '../platforms/types.js';
export { PROTOCRM_PLATFORM, PROTOCRM_PLATFORM_ID, PANOPTES_PLATFORM, PANOPTES_PLATFORM_ID };

/**
 * Current ManatOS company/platform catalogue.
 *
 * Company-owned capabilities remain available regardless of which platform is
 * selected. Platform-owned capabilities are composed in only for the current
 * platform. The catalogue is deliberately multi-platform; each platform owns
 * its product metadata while Company owns shared capabilities.
 */
const MANATOS_COMPANY_NAME = 'ManatOS Operational Solutions';

export const MANATOS_COMPANY: CompanyInfo = {
  id: 'manatos',
  name: MANATOS_COMPANY_NAME,
  shortName: 'ManatOS',
  description:
    '@CO.Company.Description' /* We build semantic business application platforms on reusable Application Foundations */,
  home: {
    eyebrow: '@CO.Home.Eyebrow' /* ManatOS semantic application foundation */,
    title:
      '@CO.domain.companyPlatform.title.ASemanticFoundationForBusinessPlatforms' /* A semantic foundation for business platforms and applications */,
    description:
      '@CO.Home.Description' /* Turn business models, relationships, rules, permissions and application behavior into governed metadata that its runtime can execute consistently across applications. */,
  },
  branding: {
    tagline:
      '@CO.Branding.Tagline' /* ManatOS — the operational platform for ManatOS applications. */,
    headerLogo: {
      darker: {
        src: '/assets/manatos-logo-middle-1.png',
        alt: MANATOS_COMPANY_NAME,
      },
      lighter: {
        src: '/assets/manatos-logo-middle-2.png',
        alt: MANATOS_COMPANY_NAME,
      },
    },
    companyPageImage: {
      src: '/assets/company/company-2.jpg',
      alt: MANATOS_COMPANY_NAME,
    },
  },
  subsystems: [
    { key: 'auth', selected: true },
    { key: 'contacts', selected: true },
    { key: 'principals', selected: true },
    { key: 'licensing', selected: true },
    { key: 'configuration', selected: true },
  ],
  navigation: [
    {
      id: 'account',
      text: '@CO.Navigation.Account' /* Account */,
      tooltip: '@CO.Navigation.OpenAccount' /* Open your account */,
      icon: 'bi-person-vcard',
      url: '/account',
      order: 100,
      visible: { expression: '$user?.permissions.userRole !== null' },
    },
    {
      id: 'administration',
      text: '@CO.Navigation.Administration' /* Administration */,
      tooltip: '@CO.Navigation.OpenAdministration' /* Open administration */,
      icon: 'bi-gear',
      order: 300,
      // Every authenticated role may reach at least the Users area. Child
      // contributions carry their own visibility rules so Guest does not inherit
      // unrelated administration entries.
      visible: { expression: '$user?.permissions.userRole !== null' },
    },
    {
      id: 'users',
      parentId: 'administration',
      text: '@CO.domain.companyPlatform.text.Users' /* Users */,
      tooltip: '@CO.Navigation.ManageUsers' /* Manage users */,
      icon: 'bi-people-fill',
      entityKey: 'sys-users',
      order: 310,
    },
    {
      id: 'principals',
      parentId: 'administration',
      text: '@CO.domain.companyPlatform.text.Principals' /* Principals */,
      tooltip: '@CO.Navigation.ManagePrincipals' /* Manage principals and organizations */,
      icon: 'bi-diagram-3-fill',
      entityKey: 'sys-principals',
      order: 320,
    },
    {
      id: 'configuration',
      text: '@CO.domain.companyPlatform.text.Configuration' /* Configuration */,
      tooltip: '@CO.Navigation.OpenConfiguration' /* Open configuration */,
      icon: 'bi-sliders2',
      order: 890,
      separatorBefore: true,
      visible: {
        expression:
          "$user?.permissions.userRole === 'Admin' || $user?.permissions.userRole === 'Superuser'",
      },
    },
    {
      id: 'system-configuration',
      parentId: 'configuration',
      text: '@CO.domain.companyPlatform.text.Configuration' /* Configuration */,
      tooltip: '@CO.Navigation.ManageSystemConfiguration' /* Manage system configuration */,
      icon: 'bi-sliders',
      url: '/configuration',
      order: 400,
      requiresEntityKeys: ['sys-configurations'],
      requiresEntityRead: 'sys-configurations',
    },
    {
      id: 'system-settings',
      parentId: 'configuration',
      text: '@CO.Navigation.SystemSettings' /* System settings */,
      tooltip: '@CO.Navigation.ManageSystemSettings' /* Manage system settings */,
      icon: 'bi-gear-wide-connected',
      url: '/system-settings',
      order: 405,
      visible: {
        expression:
          "$user?.permissions.userRole === 'Admin' || $user?.permissions.userRole === 'Superuser'",
      },
    },
    {
      id: 'external-authentication',
      parentId: 'configuration',
      text: '@CO.Navigation.ExternalAuthentication' /* External authentication */,
      tooltip:
        '@CO.Navigation.ManageExternalAuthenticationProviders' /* Manage external authentication providers */,
      icon: 'bi-globe2',
      entityKey: 'sys-ext-auth-providers',
      order: 410,
    },
    {
      id: 'licenses',
      parentId: 'administration',
      text: '@CO.domain.companyPlatform.text.Licenses' /* Licenses */,
      tooltip: '@CO.Navigation.ManageLicenses' /* Manage licenses */,
      icon: 'bi-key',
      entityKey: 'sys-licenses',
      order: 340,
    },
    {
      id: 'preferences',
      text: '@CO.Navigation.Preferences' /* Preferences */,
      icon: 'bi-sliders',
      tooltip: '@CO.Navigation.OpenPreferences' /* Open website user preferences */,
      action: 'open-preferences',
      order: 900,
      // Preferences starts the personal/session action group. Keep the group
      // divider on Preferences itself so it remains visible when Admin-only
      // Configuration is filtered out for User/Superuser roles.
      separatorBefore: true,
      visible: { expression: '$user?.permissions.userRole !== null' },
      dockBottom: true,
    },
    {
      id: 'logout',
      text: '@CO.Navigation.Logout' /* Logout */,
      tooltip: '@CO.Navigation.SignOut' /* Sign out */,
      icon: 'bi-box-arrow-right',
      url: '/auth/logout',
      order: 1000,
      visible: { expression: '$user?.permissions.userRole !== null' },
      dockBottom: true,
    },
  ],

  primaryNavigation: [
    {
      id: 'home',
      text: '@CO.Navigation.Home' /* Home */,
      tooltip: '@CO.Navigation.OpenHome' /* Open the home page */,
      icon: 'bi-house',
      url: '/',
      order: 100,
    },
    {
      id: 'company',
      text: '@CO.domain.companyPlatform.text.Company' /* Company */,
      tooltip: '@CO.Navigation.AboutManatOS' /* About ManatOS */,
      icon: 'bi-building',
      url: '/company',
      order: 200,
    },
    {
      id: 'resources',
      text: '@CO.Navigation.Resources' /* Resources */,
      tooltip: '@CO.Navigation.OpenResources' /* Open resources */,
      icon: 'bi-grid',
      order: 400,
    },
    {
      id: 'resource-api',
      text: '@CO.Navigation.ApiSwagger' /* API / Swagger */,
      tooltip: '@CO.Navigation.OpenApiSwagger' /* Open the API / Swagger documentation */,
      icon: 'bi-braces',
      url: '/api-link',
      parentId: 'resources',
      order: 410,
    },
    {
      id: 'resource-help',
      text: '@CO.domain.companyPlatform.text.Help' /* Help */,
      tooltip: '@CO.Navigation.OpenHelpResources' /* Open help resources */,
      icon: 'bi-question-circle',
      parentId: 'resources',
      order: 420,
    },
    {
      id: 'resource-about',
      text: '@CO.Navigation.AboutSite' /* About this site */,
      tooltip: '@CO.Navigation.AboutSite' /* About this site */,
      icon: 'bi-info-circle',
      url: '/company',
      parentId: 'resource-help',
      order: 421,
    },
  ],
  workspaceNavigation: [
    { navigationId: 'account' },
    { navigationId: 'administration' },
    { navigationId: 'users' },
    { navigationId: 'principals' },
    { navigationId: 'licenses' },
    { navigationId: 'configuration' },
    { navigationId: 'system-configuration' },
    { navigationId: 'system-settings' },
    { navigationId: 'external-authentication' },
    { navigationId: 'preferences' },
    { navigationId: 'logout' },
  ],

  defaultPlatformId: PROTOCRM_PLATFORM_ID,
  platforms: [PROTOCRM_PLATFORM, PANOPTES_PLATFORM],
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

/**
 * True when a persisted license is effective at the supplied instant.
 *
 * This shared domain helper defines the license-effective semantics consumed by
 * API authorization and related server/domain logic. UI navigation receives only
 * the resolved platform capability and does not evaluate license rows itself.
 */
export function licenseIsEffective(license: SysBOLicense, at: Date = new Date()): boolean {
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
  return (
    licenseGrantsPlatformAccess(license, platformId, at) &&
    (!license.applicationId || license.applicationId === applicationId)
  );
}
