import { SysUserRole } from '@manatos/shared';

export interface AppNavMenuItem {
  id: string;
  text: string;
  icon?: string;
  url?: string;
  children?: AppNavMenuItem[];
  separatorBefore?: boolean;
  requiresAuthentication?: boolean;
  roles?: SysUserRole[];
}

export const appHorizontalNavMenu: AppNavMenuItem[] = [
  {
    id: 'home',
    text: 'Home',
    icon: 'bi-house',
    url: '/',
  },
  {
    id: 'company',
    text: 'Company',
    icon: 'bi-building',
    url: '/company',
  },
  {
    id: 'resources',
    text: 'Resources',
    icon: 'bi-grid',
    children: [
      {
        id: 'api',
        text: 'API / Swagger',
        icon: 'bi-braces',
        url: '/api-link',
      },
      {
        id: 'help',
        text: 'Help',
        icon: 'bi-question-circle',
        children: [
          {
            id: 'about',
            text: 'About this site',
            icon: 'bi-info-circle',
            url: '/company',
          },
        ],
      },
    ],
  },
  {
    id: 'app-playground',
    text: 'App Playground',
    icon: 'bi-play-circle-fill',
    url: '/app-playground',
  },
];

export const appVerticalNavMenu: AppNavMenuItem[] = [
  {
    id: 'account',
    text: 'Account',
    icon: 'bi-person-vcard',
    url: '/account',
    requiresAuthentication: true,
  },
  {
    id: 'administration',
    text: 'Administration',
    icon: 'bi-gear',
    requiresAuthentication: true,
    roles: [SysUserRole.Admin],
    children: [
      {
        id: 'users',
        text: 'Users',
        icon: 'bi-person-circle',
        url: '/bo/sys-users',
      },
      {
        id: 'principals',
        text: 'Principals',
        icon: 'bi-person-circle',
        url: '/bo/sys-principals',
      },
      {
        id: 'applications',
        text: 'Applications',
        icon: 'bi-window-stack',
        url: '/bo/sys-applications',
      },
      {
        id: 'licenses',
        text: 'Licenses',
        icon: 'bi-key',
        url: '/bo/sys-licenses',
      },
    ],
  },
  {
    id: 'logout',
    text: 'Logout',
    icon: 'bi-box-arrow-right',
    url: '/auth/logout',
    separatorBefore: true,
    requiresAuthentication: true,
  },
];

export function navigationFor(
  role: SysUserRole | null,
  auth: boolean,
) {
  const filter = (
    items: AppNavMenuItem[],
  ): AppNavMenuItem[] =>
    items.flatMap((item) => {
      if (item.requiresAuthentication && !auth) {
        return [];
      }

      if (item.roles && (!role || !item.roles.includes(role))) {
        return [];
      }

      const children = item.children
        ? filter(item.children)
        : undefined;

      return [
        {
          ...item,
          ...(children ? { children } : {}),
        },
      ];
    });

  return {
    horizontal: filter(appHorizontalNavMenu),
    vertical: auth
      ? filter(appVerticalNavMenu)
      : [],
  };
}
