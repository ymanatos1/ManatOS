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
    }
  });
});

// The effective SysBO catalogue follows the same ownership composition as navigation.

describe('company/platform SysBO ownership', () => {
  it('combines Company-owned SysBOs with mCRM-owned SysApplication', () => {
    expect(Object.keys(effectiveSysBODefinitions()).sort()).toEqual([
      'sys-applications',
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
      'sys-licenses',
      'sys-principals',
      'sys-users',
    ]);
  });
});
