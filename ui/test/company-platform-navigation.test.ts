import { describe, expect, it } from 'vitest';

import { MANATOS_COMPANY, SysUserRole, resolvePlatform } from '@manatos/shared';

import { navigationFor } from '../src/navigation.js';
import { effectiveSysBODefinitions } from '../src/sysbo/definitions.js';

describe('company/platform navigation composition', () => {
  it('merges Company and mCRM contributions into the current left-nav order', () => {
    const platform = resolvePlatform(MANATOS_COMPANY);
    const navigation = navigationFor(SysUserRole.Admin, true, MANATOS_COMPANY, platform).vertical;

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
    expect(preferences?.separatorBefore).not.toBe(true);
    expect(configuration?.children?.find((item) => item.id === 'external-authentication')?.icon).toBe('bi-globe2');
    expect(configuration?.children?.map((item) => item.id)).toEqual([
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
          requiresAuthentication: true,
        },
      ],
    };

    const configuration = navigationFor(
      SysUserRole.Admin,
      true,
      MANATOS_COMPANY,
      platform,
    ).vertical.find((item) => item.id === 'configuration');

    expect(configuration?.children?.map((item) => item.id)).toEqual([
      'external-authentication',
      'platform-settings',
    ]);
  });

  it('keeps Apps Playground dependent on the mCRM SysApplication capability', () => {
    const platform = {
      ...resolvePlatform(MANATOS_COMPANY),
      entities: [],
    };

    const navigation = navigationFor(SysUserRole.Admin, true, MANATOS_COMPANY, platform).vertical;

    expect(navigation.some((item) => item.id === 'app-playground')).toBe(false);
    expect(
      navigation.find((item) => item.id === 'administration')?.children?.some(
        (item) => item.id === 'applications',
      ),
    ).toBe(false);
  });

  it('preserves existing User navigation visibility and includes Superuser', () => {
    for (const role of [SysUserRole.User, SysUserRole.Superuser]) {
      const navigation = navigationFor(role, true).vertical;
      expect(navigation.some((item) => item.id === 'administration')).toBe(true);
      expect(navigation.some((item) => item.id === 'configuration')).toBe(false);
    }
  });
});

// The effective SysBO catalogue follows the same ownership composition as navigation.

describe('company/platform SysBO ownership', () => {
  it('combines Company-owned SysBOs with mCRM-owned SysApplication', () => {
    expect(Object.keys(effectiveSysBODefinitions()).sort()).toEqual([
      'sys-applications',
      'sys-ext-auth-providers',
      'sys-licenses',
      'sys-principals',
      'sys-users',
    ]);
  });

  it('removes mCRM SysApplication when the selected platform does not contribute it', () => {
    const platform = {
      ...resolvePlatform(MANATOS_COMPANY),
      entities: [],
    };

    expect(Object.keys(effectiveSysBODefinitions(MANATOS_COMPANY, platform)).sort()).toEqual([
      'sys-ext-auth-providers',
      'sys-licenses',
      'sys-principals',
      'sys-users',
    ]);
  });
});
