import { describe, expect, it } from 'vitest';

import {
  configurationInputError,
  groupUiConfigurations,
  hasDirtyConfigurationDrafts,
  isUiProtectedPageRoute,
  resolveUiPageRoute,
  type UiConfigurationSetting,
} from '../src/index.js';

const setting = (patch: Partial<UiConfigurationSetting>): UiConfigurationSetting => ({
  id: '00000000-0000-4000-8000-000000000001',
  name: 'SETTING',
  group: 'API',
  valueType: 'string',
  value: null,
  restartRequired: false,
  editable: true,
  enabled: true,
  sensitive: false,
  ...patch,
});

describe('NG1 Configuration contracts', () => {
  it('registers Configuration as protected but keeps the existing Home and List routes', () => {
    expect(resolveUiPageRoute('/configuration')?.page).toEqual({
      folder: 'administration',
      name: 'Configuration',
    });
    expect(isUiProtectedPageRoute(resolveUiPageRoute('/configuration'))).toBe(true);
    expect(isUiProtectedPageRoute(resolveUiPageRoute('/bo/sys-users'))).toBe(true);
    expect(isUiProtectedPageRoute(resolveUiPageRoute('/'))).toBe(false);
    expect(resolveUiPageRoute('/configuration', undefined, 'EL')?.title).toBe('Παραμετροποίηση');
  });

  it('groups the canonical API order without cloning or exposing secret values', () => {
    const a = setting({ name: 'A' });
    const b = setting({ name: 'B', group: 'Mail', sensitive: true, value: null });
    const c = setting({ name: 'C' });
    const groups = groupUiConfigurations([a, b, c]);
    expect(groups.map((group) => group.name)).toEqual(['API', 'Mail']);
    expect(groups[0]?.items).toEqual([a, c]);
    expect(groups[1]?.items[0]).toBe(b);
  });

  it('guards unapplied configuration changes without confusing stored secrets with drafts', () => {
    const ordinary = setting({ id: 'normal', value: 'before' });
    const secret = setting({ id: 'secret', sensitive: true, secretConfigured: true });
    expect(hasDirtyConfigurationDrafts([ordinary, secret], new Map())).toBe(false);
    expect(hasDirtyConfigurationDrafts([ordinary, secret], new Map([['normal', 'before']]))).toBe(
      false,
    );
    expect(hasDirtyConfigurationDrafts([ordinary, secret], new Map([['normal', 'after']]))).toBe(
      true,
    );
    expect(hasDirtyConfigurationDrafts([ordinary, secret], new Map([['secret', '']]))).toBe(false);
    expect(
      hasDirtyConfigurationDrafts([ordinary, secret], new Map([['secret', 'new-secret']])),
    ).toBe(true);
  });

  it('validates enum, boolean and positive-number fields without changing API authority', () => {
    expect(configurationInputError(setting({ valueType: 'number' }), '0')).toBeTruthy();
    expect(configurationInputError(setting({ valueType: 'number' }), 'NaN')).toBeTruthy();
    expect(configurationInputError(setting({ valueType: 'number' }), '12')).toBe(null);
    expect(configurationInputError(setting({ valueType: 'boolean' }), 'yes')).toBeTruthy();
    expect(configurationInputError(setting({ valueType: 'boolean' }), 'false')).toBe(null);
    expect(
      configurationInputError(
        setting({ valueType: 'enum', allowedValues: ['basic', 'full'] }),
        'other',
      ),
    ).toBeTruthy();
    expect(
      configurationInputError(
        setting({ valueType: 'enum', allowedValues: ['basic', 'full'] }),
        'full',
      ),
    ).toBe(null);
  });
});

/** The Storage page reuses the existing protected-page routing contract. */
describe('NG1 Storage configuration contracts', () => {
  it('registers System Settings as a protected virtual page', () => {
    const route = resolveUiPageRoute('/system-settings');
    expect(route?.kind).toBe('administration');
    expect(route?.page).toEqual({ folder: 'administration', name: 'SystemSettings' });
    expect(isUiProtectedPageRoute(route)).toBe(true);
    expect(resolveUiPageRoute('/system-settings', undefined, 'EL')?.title).toBe(
      'Ρυθμίσεις συστήματος',
    );
  });
});
