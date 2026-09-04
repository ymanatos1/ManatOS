import { describe, expect, it } from 'vitest';

import { MANATOS_COMPANY, PROTOCRM_PLATFORM, SysBOUserRole, resolvePlatform } from '@manatos/shared';

import { createManatOSContext } from '../src/context/manatos-context.js';
import { navigationFor } from '../src/navigation.js';
import { effectiveSysBODefinitions } from '../src/sysbo/definitions.js';


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

describe('company/platform navigation composition', () => {
  it('composes the Company catalogue from the canonical protoCRM platform module', () => {
    const platform = resolvePlatform(MANATOS_COMPANY);

    expect(platform).toBe(PROTOCRM_PLATFORM);
    expect(platform.presentation?.stylesheet).toBe('/css/platforms/protocrm.css');
  });

  it('places Platform immediately after Company in horizontal navigation', () => {
    const navigation = navigationFor(SysBOUserRole.Admin, true).horizontal;

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

    const platformItem = navigationFor(SysBOUserRole.Admin, true, company, resolvePlatform(company)).horizontal
      .find((item) => item.id === 'platform');

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
      { ctx: navigationCtx(SysBOUserRole.Admin, true) },
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
    expect(configuration?.children?.find((item) => item.id === 'external-authentication')?.icon).toBe('bi-globe2');
    expect(configuration?.children?.map((item) => item.id)).toEqual([
      'system-configuration',
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
          visible: { expression: 'user.permissions.userRole !== null' },
        },
      ],
    };

    const configuration = navigationFor(
      SysBOUserRole.Admin,
      true,
      MANATOS_COMPANY,
      platform,
    ).vertical.find((item) => item.id === 'configuration');

    expect(configuration?.children?.map((item) => item.id)).toEqual([
      'system-configuration',
      'external-authentication',
      'platform-settings',
    ]);
  });

  it('keeps Apps Playground dependent on the same platform capability in both menus', () => {
    const platform = {
      ...resolvePlatform(MANATOS_COMPANY),
      entities: [],
    };

    const navigation = navigationFor(SysBOUserRole.Admin, true, MANATOS_COMPANY, platform);

    expect(navigation.vertical.some((item) => item.id === 'app-playground')).toBe(false);
    expect(navigation.horizontal.some((item) => item.id === 'app-playground')).toBe(false);
    expect(
      navigation.vertical.find((item) => item.id === 'administration')?.children?.some(
        (item) => item.id === 'applications',
      ),
    ).toBe(false);
  });


  it('uses evaluator-backed CTX visibility for navigation decisions', () => {
    const platform = resolvePlatform(MANATOS_COMPANY);
    const playground = platform.navigation.find((item) => item.id === 'app-playground');
    expect(playground?.visible).toEqual({
      expression: 'user.permissions.platforms.protocrm.capabilities.platformAccess === true',
    });
  });

  it('gates protoCRM application navigation by entitlement for every non-Admin role', () => {
    for (const role of [SysBOUserRole.Guest, SysBOUserRole.User, SysBOUserRole.Superuser]) {
      const unlicensed = navigationFor(role, true);
      expect(unlicensed.vertical.some((item) => item.id === 'app-playground')).toBe(false);
      expect(unlicensed.horizontal.some((item) => item.id === 'app-playground')).toBe(false);
      expect(
        unlicensed.vertical.find((item) => item.id === 'administration')?.children?.some(
          (item) => item.id === 'applications',
        ),
      ).toBe(false);

      const licensed = navigationFor(
        role,
        true,
        MANATOS_COMPANY,
        resolvePlatform(MANATOS_COMPANY),
        { ctx: navigationCtx(role, true) },
      );
      expect(licensed.vertical.some((item) => item.id === 'app-playground')).toBe(true);
      expect(licensed.horizontal.some((item) => item.id === 'app-playground')).toBe(true);
      expect(
        licensed.vertical.find((item) => item.id === 'administration')?.children?.some(
          (item) => item.id === 'applications',
        ),
      ).toBe(true);
    }

    const admin = navigationFor(
      SysBOUserRole.Admin,
      true,
      MANATOS_COMPANY,
      resolvePlatform(MANATOS_COMPANY),
      { ctx: navigationCtx(SysBOUserRole.Admin, true) },
    );
    expect(admin.vertical.some((item) => item.id === 'app-playground')).toBe(true);
    expect(admin.horizontal.some((item) => item.id === 'app-playground')).toBe(true);
  });

  it('gives Guest access to the Users area without exposing unrelated administration entities', () => {
    const navigation = navigationFor(SysBOUserRole.Guest, true).vertical;
    const administration = navigation.find((item) => item.id === 'administration');

    expect(administration).toBeDefined();
    expect(administration?.children?.map((item) => item.id)).toEqual(['users']);
    expect(navigation.some((item) => item.id === 'configuration')).toBe(false);
  });

  it('preserves existing User navigation visibility and includes Superuser', () => {
    for (const role of [SysBOUserRole.User, SysBOUserRole.Superuser]) {
      const navigation = navigationFor(role, true).vertical;
      expect(navigation.some((item) => item.id === 'administration')).toBe(true);
      expect(navigation.some((item) => item.id === 'configuration')).toBe(false);
      expect(navigation.find((item) => item.id === 'preferences')?.separatorBefore).toBe(true);
    }
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
      entities: [],
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
