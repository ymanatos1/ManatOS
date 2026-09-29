import { describe, expect, it } from 'vitest';

import {
  MANATOS_COMPANY,
  PROTOCRM_PLATFORM,
  SysBOUserRole,
  resolvePlatform,
} from '@manatos/shared';

import { createManatOSContext } from '../../src/context/manatos-context.js';
import { navigationFor } from '../../src/navigation.js';
import { effectiveSysBODefinitions } from '../../src/sysbo/definitions.js';

const navigationCtx = (role: SysBOUserRole, platformAccess: boolean) => {
  const platform = resolvePlatform(MANATOS_COMPANY);
  const now = new Date().toISOString();
  return createManatOSContext(
    MANATOS_COMPANY,
    platform,
    'http://localhost:3000',
    '0.1.0',
    {
      id: '11111111-1111-4111-8111-111111111111',
      name: 'navigation-test',
      email: 'navigation@example.test',
      role,
      enabled: true,
      emailVerified: true,
      createdAt: now,
      createdBy: 'test',
      updatedAt: now,
      updatedBy: 'test',
    } as any,
    {},
    'sys',
    'test',
    { platformAccess },
  );
};

const collectionCapabilities = (
  role: SysBOUserRole,
  applicationRead = role === SysBOUserRole.Admin || role === SysBOUserRole.Superuser,
) => {
  const capability = (read: boolean) => ({ read, create: false, update: false, delete: false });
  return {
    'sys-users': capability(true),
    'sys-principals': capability(role !== SysBOUserRole.Guest),
    'sys-licenses': capability(
      role === SysBOUserRole.Admin ||
        role === SysBOUserRole.Superuser ||
        role === SysBOUserRole.User,
    ),
    'sys-applications': capability(applicationRead),
    'sys-ext-auth-providers': capability(
      role === SysBOUserRole.Admin || role === SysBOUserRole.Superuser,
    ),
    'sys-configurations': capability(
      role === SysBOUserRole.Admin || role === SysBOUserRole.Superuser,
    ),
  };
};

const navigationAccess = (
  role: SysBOUserRole,
  platformAccess: boolean,
  applicationRead = role === SysBOUserRole.Admin || role === SysBOUserRole.Superuser,
) => ({
  ctx: navigationCtx(role, platformAccess),
  entityCapabilities: collectionCapabilities(role, applicationRead),
});

describe('company/platform navigation composition', () => {
  it('composes the Company catalogue from the canonical protoCRM platform module', () => {
    const platform = resolvePlatform(MANATOS_COMPANY);

    expect(platform).toBe(PROTOCRM_PLATFORM);
    expect(MANATOS_COMPANY.description).toBe(
      'We build semantic business application platforms on reusable Application Foundations',
    );
    expect(platform.description).toContain('on the ManatOS Application Foundation');
    expect(platform.presentation?.stylesheet).toBe('/css/platforms/protocrm.css');
  });

  it('places Platform immediately after Company in horizontal navigation', () => {
    const navigation = navigationFor(
      SysBOUserRole.Admin,
      true,
      MANATOS_COMPANY,
      resolvePlatform(MANATOS_COMPANY),
      navigationAccess(SysBOUserRole.Admin, true),
    ).horizontal;

    expect(navigation.slice(0, 4).map((item) => item.id)).toEqual([
      'home',
      'company',
      'platform',
      'resources',
    ]);
    expect(navigation.find((item) => item.id === 'platform')?.url).toBe('/platform/protocrm');
  });

  it('turns Platform into a catalogue dropdown when multiple platforms are enabled', () => {
    const secondPlatform = {
      ...resolvePlatform(MANATOS_COMPANY),
      id: 'analytics',
      code: 'analytics',
      name: 'Analytics Platform',
      shortName: 'Analytics',
    };
    const company = {
      ...MANATOS_COMPANY,
      platforms: [...MANATOS_COMPANY.platforms, secondPlatform],
    };

    const platformItem = navigationFor(
      SysBOUserRole.Admin,
      true,
      company,
      resolvePlatform(company),
    ).horizontal.find((item) => item.id === 'platform');

    expect(platformItem?.url).toBeUndefined();
    expect(platformItem?.children?.map((item) => item.text)).toEqual(['protoCRM', 'Analytics']);
  });

  it('merges Company and protoCRM contributions into the current left-nav order', () => {
    const platform = resolvePlatform(MANATOS_COMPANY);
    const navigation = navigationFor(
      SysBOUserRole.Admin,
      true,
      MANATOS_COMPANY,
      platform,
      navigationAccess(SysBOUserRole.Admin, true),
    ).vertical;

    expect(navigation.map((item) => item.id)).toEqual([
      'account',
      'app-playground',
      'administration',
      'configuration',
      'preferences',
      'logout',
    ]);

    const administration = navigation.find((item) => item.id === 'administration');
    expect(administration?.children?.map((item) => item.id)).toEqual([
      'users',
      'principals',
      'applications',
      'licenses',
    ]);

    const configuration = navigation.find((item) => item.id === 'configuration');
    const preferences = navigation.find((item) => item.id === 'preferences');
    expect(configuration?.separatorBefore).toBe(true);
    expect(preferences?.separatorBefore).toBe(true);
    expect(
      configuration?.children?.find((item) => item.id === 'external-authentication')?.icon,
    ).toBe('bi-globe2');
    expect(configuration?.children?.map((item) => item.id)).toEqual([
      'system-configuration',
      'system-settings',
      'external-authentication',
    ]);
  });

  it('allows Platform contributions to join the shared Configuration collection', () => {
    const platform = {
      ...resolvePlatform(MANATOS_COMPANY),
      navigation: [
        ...resolvePlatform(MANATOS_COMPANY).navigation,
        {
          id: 'platform-settings',
          parentId: 'configuration',
          text: 'Platform settings',
          icon: 'bi-gear-wide-connected',
          url: '/platform-settings',
          order: 420,
          visible: { expression: '$user.permissions.userRole !== null' },
        },
      ],
    };

    const configuration = navigationFor(
      SysBOUserRole.Admin,
      true,
      MANATOS_COMPANY,
      platform,
      navigationAccess(SysBOUserRole.Admin, true),
    ).vertical.find((item) => item.id === 'configuration');

    expect(configuration?.children?.map((item) => item.id)).toEqual([
      'system-configuration',
      'system-settings',
      'external-authentication',
      'platform-settings',
    ]);
  });

  it('keeps Apps Playground dependent on the same platform capability in both menus', () => {
    const platform = {
      ...resolvePlatform(MANATOS_COMPANY),
      subsystems: [],
    };

    const navigation = navigationFor(
      SysBOUserRole.Admin,
      true,
      MANATOS_COMPANY,
      platform,
      navigationAccess(SysBOUserRole.Admin, true),
    );

    expect(navigation.vertical.some((item) => item.id === 'app-playground')).toBe(false);
    expect(navigation.horizontal.some((item) => item.id === 'app-playground')).toBe(false);
    expect(
      navigation.vertical
        .find((item) => item.id === 'administration')
        ?.children?.some((item) => item.id === 'applications'),
    ).toBe(false);
  });

  it('uses evaluator-backed CTX visibility for navigation decisions', () => {
    const platform = resolvePlatform(MANATOS_COMPANY);
    const playground = platform.navigation.find((item) => item.id === 'app-playground');
    expect(playground?.visible).toEqual({
      expression: '$user.permissions.platforms.protocrm.capabilities.platformAccess === true',
    });
  });

  it('declares entity-backed navigation through API collection-read capabilities, not role copies', () => {
    const byId = new Map(MANATOS_COMPANY.navigation.map((item) => [item.id, item]));
    expect(byId.get('users')).toMatchObject({ requiresEntityRead: 'sys-users' });
    expect(byId.get('principals')).toMatchObject({ requiresEntityRead: 'sys-principals' });
    expect(byId.get('licenses')).toMatchObject({ requiresEntityRead: 'sys-licenses' });
    expect(byId.get('external-authentication')).toMatchObject({
      requiresEntityRead: 'sys-ext-auth-providers',
    });
    expect(byId.get('principals')?.visible).toBeUndefined();
    expect(byId.get('licenses')?.visible).toBeUndefined();

    const platformById = new Map(
      resolvePlatform(MANATOS_COMPANY).navigation.map((item) => [item.id, item]),
    );
    expect(platformById.get('applications')).toMatchObject({
      requiresEntityRead: 'sys-applications',
    });
    expect(platformById.get('app-playground')).toMatchObject({
      requiresEntityRead: 'sys-applications',
    });
  });

  it('keeps User/Guest Apps Playground execution-gated while allowing Superuser execution', () => {
    for (const role of [SysBOUserRole.Guest, SysBOUserRole.User]) {
      const unlicensed = navigationFor(
        role,
        true,
        MANATOS_COMPANY,
        resolvePlatform(MANATOS_COMPANY),
        navigationAccess(role, false),
      );
      expect(unlicensed.vertical.some((item) => item.id === 'app-playground')).toBe(false);
      expect(unlicensed.horizontal.some((item) => item.id === 'app-playground')).toBe(false);
      expect(
        unlicensed.vertical
          .find((item) => item.id === 'administration')
          ?.children?.some((item) => item.id === 'applications'),
      ).toBe(false);

      const platformOnly = navigationFor(
        role,
        true,
        MANATOS_COMPANY,
        resolvePlatform(MANATOS_COMPANY),
        navigationAccess(role, true),
      );
      expect(platformOnly.vertical.some((item) => item.id === 'app-playground')).toBe(false);
      expect(platformOnly.horizontal.some((item) => item.id === 'app-playground')).toBe(false);
      expect(
        platformOnly.vertical
          .find((item) => item.id === 'administration')
          ?.children?.some((item) => item.id === 'applications'),
      ).toBe(false);

      const fullyAuthorized = navigationFor(
        role,
        true,
        MANATOS_COMPANY,
        resolvePlatform(MANATOS_COMPANY),
        navigationAccess(role, true, true),
      );
      expect(fullyAuthorized.vertical.some((item) => item.id === 'app-playground')).toBe(true);
      expect(fullyAuthorized.horizontal.some((item) => item.id === 'app-playground')).toBe(true);
      expect(
        fullyAuthorized.vertical
          .find((item) => item.id === 'administration')
          ?.children?.some((item) => item.id === 'applications'),
      ).toBe(true);
    }

    const superuser = navigationFor(
      SysBOUserRole.Superuser,
      true,
      MANATOS_COMPANY,
      resolvePlatform(MANATOS_COMPANY),
      navigationAccess(SysBOUserRole.Superuser, true),
    );
    expect(superuser.vertical.some((item) => item.id === 'app-playground')).toBe(true);
    expect(superuser.horizontal.some((item) => item.id === 'app-playground')).toBe(true);
    expect(
      superuser.vertical
        .find((item) => item.id === 'administration')
        ?.children?.some((item) => item.id === 'applications'),
    ).toBe(true);

    const admin = navigationFor(
      SysBOUserRole.Admin,
      true,
      MANATOS_COMPANY,
      resolvePlatform(MANATOS_COMPANY),
      navigationAccess(SysBOUserRole.Admin, true),
    );
    expect(admin.vertical.some((item) => item.id === 'app-playground')).toBe(true);
    expect(admin.horizontal.some((item) => item.id === 'app-playground')).toBe(true);
  });

  it('gives Guest access to the Users area without exposing unrelated administration entities', () => {
    const navigation = navigationFor(
      SysBOUserRole.Guest,
      true,
      MANATOS_COMPANY,
      resolvePlatform(MANATOS_COMPANY),
      navigationAccess(SysBOUserRole.Guest, false),
    ).vertical;
    const administration = navigation.find((item) => item.id === 'administration');

    expect(administration).toBeDefined();
    expect(administration?.children?.map((item) => item.id)).toEqual(['users']);
    expect(navigation.some((item) => item.id === 'configuration')).toBe(false);
  });

  it('keeps User operational navigation limited and exposes Superuser inspection surfaces', () => {
    for (const role of [SysBOUserRole.User, SysBOUserRole.Superuser]) {
      const navigation = navigationFor(
        role,
        true,
        MANATOS_COMPANY,
        resolvePlatform(MANATOS_COMPANY),
        navigationAccess(role, false),
      ).vertical;
      expect(navigation.some((item) => item.id === 'administration')).toBe(true);
      expect(navigation.some((item) => item.id === 'configuration')).toBe(
        role === SysBOUserRole.Superuser,
      );
      expect(navigation.find((item) => item.id === 'preferences')?.separatorBefore).toBe(true);
    }
  });

  it('fails entity-backed navigation closed without API-projected collection capabilities', () => {
    const navigation = navigationFor(
      SysBOUserRole.Admin,
      true,
      MANATOS_COMPANY,
      resolvePlatform(MANATOS_COMPANY),
      { ctx: navigationCtx(SysBOUserRole.Admin, true) },
    ).vertical;

    expect(navigation.find((item) => item.id === 'administration')?.children).toEqual([]);
  });
});

// The effective SysBO catalogue follows the same ownership composition as navigation.

describe('company/platform SysBO ownership', () => {
  it('combines Company-owned SysBOs with protoCRM-owned SysBOApplication', () => {
    expect(Object.keys(effectiveSysBODefinitions()).sort()).toEqual([
      'sys-applications',
      'sys-configurations',
      'sys-ext-auth-providers',
      'sys-licenses',
      'sys-principals',
      'sys-users',
    ]);
  });

  it('removes protoCRM SysBOApplication when the selected platform does not contribute it', () => {
    const platform = {
      ...resolvePlatform(MANATOS_COMPANY),
      subsystems: [],
    };

    expect(Object.keys(effectiveSysBODefinitions(MANATOS_COMPANY, platform)).sort()).toEqual([
      'sys-configurations',
      'sys-ext-auth-providers',
      'sys-licenses',
      'sys-principals',
      'sys-users',
    ]);
  });
});
