import {
  MANATOS_COMPANY,
  effectiveEntityKeys,
  resolvePlatform,
  type CompanyInfo,
  type NavigationContribution,
  type PlatformInfo,
  type SysUserRole,
} from '@manatos/shared';

export interface AppNavMenuItem {
  id: string;
  text: string;
  icon?: string;
  url?: string;
  children?: AppNavMenuItem[];
  separatorBefore?: boolean;
  requiresAuthentication?: boolean;
  roles?: SysUserRole[];
  action?: 'open-preferences';
  dockBottom?: boolean;
}

/**
 * Horizontal navigation is still shell-global. Platform composition currently
 * applies to the authenticated left navigation, where platform capabilities
 * are operationally exposed. This can be generalized later if required.
 */
export const appHorizontalNavMenu: AppNavMenuItem[] = [
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
  { id: 'app-playground', text: 'Apps Playground', icon: 'bi-play-circle-fill', url: '/app-playground' },
];

/**
 * Compose the left navigation from Company contributions plus the selected
 * Platform contributions. Parent containers with the same id are merged, so
 * both owners can contribute entries to shared collections such as
 * Administration and Configuration without hard-coding the final menu in the
 * UI project.
 */
export function composeVerticalNavigation(
  company: CompanyInfo = MANATOS_COMPANY,
  platform: PlatformInfo = resolvePlatform(company),
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
  };
}

export function navigationFor(
  role: SysUserRole | null,
  auth: boolean,
  company: CompanyInfo = MANATOS_COMPANY,
  platform: PlatformInfo = resolvePlatform(company),
) {
  const filter = (items: AppNavMenuItem[]): AppNavMenuItem[] =>
    items.flatMap((item) => {
      if (item.requiresAuthentication && !auth) return [];
      if (item.roles && (!role || !item.roles.includes(role))) return [];

      const childItems = item.children ? filter(item.children) : undefined;
      return [{ ...item, ...(childItems ? { children: childItems } : {}) }];
    });

  return {
    horizontal: filter(appHorizontalNavMenu),
    vertical: auth ? filter(composeVerticalNavigation(company, platform)) : [],
  };
}
