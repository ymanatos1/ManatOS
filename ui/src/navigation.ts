import {
  MANATOS_COMPANY,
  effectiveEntityKeys,
  resolvePlatform,
  SysBOUserRole,
  type CompanyInfo,
  type NavigationContribution,
  type SysPlatform,
} from '@manatos/shared';

export interface AppNavMenuItem {
  id: string;
  text: string;
  icon?: string;
  url?: string;
  children?: AppNavMenuItem[];
  separatorBefore?: boolean;
  requiresAuthentication?: boolean;
  roles?: SysBOUserRole[];
  action?: 'open-preferences';
  dockBottom?: boolean;
  /** Platform-owned function that requires a current license entitlement. */
  requiresPlatformEntitlement?: boolean;
}

const baseHorizontalNavMenu: AppNavMenuItem[] = [
  { id: 'home', text: 'Home', icon: 'bi-house', url: '/' },
  { id: 'company', text: 'Company', icon: 'bi-building', url: '/company' },
  {
    id: 'resources',
    text: 'Resources',
    icon: 'bi-grid',
    children: [
      { id: 'api', text: 'API / Swagger', icon: 'bi-braces', url: '/api-link' },
      {
        id: 'help',
        text: 'Help',
        icon: 'bi-question-circle',
        children: [
          { id: 'about', text: 'About this site', icon: 'bi-info-circle', url: '/company' },
        ],
      },
    ],
  },
];

/**
 * Build the horizontal platform entry from the code-defined platform catalogue.
 * With one enabled platform it behaves as a simple link; once more platforms
 * are added, the same entry becomes a dropdown without changing shell markup.
 */
export function horizontalNavigation(
  company: CompanyInfo = MANATOS_COMPANY,
  platform: SysPlatform = resolvePlatform(company),
): AppNavMenuItem[] {
  const enabledPlatforms = company.platforms.filter((entry) => entry.enabled);
  const platformItem: AppNavMenuItem = enabledPlatforms.length <= 1
    ? {
        id: 'platform',
        text: 'Platform',
        icon: 'bi-boxes',
        url: `/platform/${encodeURIComponent(platform.id)}`,
      }
    : {
        id: 'platform',
        text: 'Platform',
        icon: 'bi-boxes',
        children: enabledPlatforms.map((entry) => ({
          id: `platform-${entry.id}`,
          text: entry.shortName,
          icon: 'bi-boxes',
          url: `/platform/${encodeURIComponent(entry.id)}`,
        })),
      };

  /*
   * Horizontal platform shortcuts reuse the SAME platform navigation
   * contribution as the left navigation. This prevents two independent copies
   * of authentication/role/capability rules from drifting apart. Apps
   * Playground is currently the platform shortcut exposed horizontally; if its
   * vertical contribution is unavailable for the selected platform capability,
   * it is unavailable here too. Role/auth filtering is applied later by the
   * shared navigationFor() filter to both menu surfaces.
   */
  const entityKeys = effectiveEntityKeys(company, platform);
  const playgroundContribution = platform.navigation.find(
    (item) =>
      item.id === 'app-playground' &&
      !item.parentId &&
      (item.requiresEntityKeys ?? []).every((key) => entityKeys.has(key)),
  );

  return [
    ...baseHorizontalNavMenu.slice(0, 2),
    platformItem,
    ...baseHorizontalNavMenu.slice(2),
    ...(playgroundContribution ? [toMenuItem(playgroundContribution)] : []),
  ];
}

/**
 * Compose the left navigation from Company contributions plus the selected
 * Platform contributions. Parent containers with the same id are merged, so
 * both owners can contribute entries to shared collections such as
 * Administration and Configuration without hard-coding the final menu in the
 * UI project.
 */
export function composeVerticalNavigation(
  company: CompanyInfo = MANATOS_COMPANY,
  platform: SysPlatform = resolvePlatform(company),
): AppNavMenuItem[] {
  const entityKeys = effectiveEntityKeys(company, platform);
  const contributions = [...company.navigation, ...platform.navigation]
    .filter((item) => (item.requiresEntityKeys ?? []).every((key) => entityKeys.has(key)))
    .sort((a, b) => a.order - b.order);

  const roots = new Map<string, AppNavMenuItem>();
  const children = new Map<string, NavigationContribution[]>();

  for (const contribution of contributions) {
    if (contribution.parentId) {
      const bucket = children.get(contribution.parentId) ?? [];
      bucket.push(contribution);
      children.set(contribution.parentId, bucket);
      continue;
    }

    roots.set(contribution.id, toMenuItem(contribution));
  }

  for (const [parentId, entries] of children) {
    const parent = roots.get(parentId);
    if (!parent) continue;
    parent.children = entries.sort((a, b) => a.order - b.order).map(toMenuItem);
  }

  return [...roots.values()];
}

function toMenuItem(item: NavigationContribution): AppNavMenuItem {
  return {
    id: item.id,
    text: item.text,
    ...(item.icon ? { icon: item.icon } : {}),
    ...(item.url ? { url: item.url } : {}),
    ...(item.separatorBefore ? { separatorBefore: true } : {}),
    ...(item.requiresAuthentication ? { requiresAuthentication: true } : {}),
    ...(item.roles ? { roles: item.roles } : {}),
    ...(item.action === 'open-preferences' ? { action: 'open-preferences' as const } : {}),
    ...(item.dockBottom ? { dockBottom: true } : {}),
    ...(item.requiresPlatformEntitlement ? { requiresPlatformEntitlement: true } : {}),
  };
}

export interface NavigationAccessContext {
  /** Current user is licensed for the selected platform. Admin is implicit. */
  platformEntitled?: boolean;
}

export function navigationFor(
  role: SysBOUserRole | null,
  auth: boolean,
  company: CompanyInfo = MANATOS_COMPANY,
  platform: SysPlatform = resolvePlatform(company),
  access: NavigationAccessContext = {},
) {
  const platformEntitled = role === SysBOUserRole.Admin || access.platformEntitled === true;

  const filter = (items: AppNavMenuItem[]): AppNavMenuItem[] =>
    items.flatMap((item) => {
      if (item.requiresAuthentication && !auth) return [];
      if (item.roles && (!role || !item.roles.includes(role))) return [];
      if (item.requiresPlatformEntitlement && !platformEntitled) return [];

      const childItems = item.children ? filter(item.children) : undefined;
      return [{ ...item, ...(childItems ? { children: childItems } : {}) }];
    });

  return {
    horizontal: filter(horizontalNavigation(company, platform)),
    vertical: auth ? filter(composeVerticalNavigation(company, platform)) : [],
  };
}
