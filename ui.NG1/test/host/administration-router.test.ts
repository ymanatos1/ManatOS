import { describe, expect, it } from 'vitest';

import { ng1AdministrationApiPath } from '../../src/host/administration-router.js';

const STORAGE_API = '/api/v1/system-settings/storage';
const CONFIGURATION_ID = '00000000-0000-4000-8000-000000000001';

describe('administration allowlist', () => {
  it('allows the Configuration read and single-setting Apply endpoints', () => {
    expect(ng1AdministrationApiPath('GET', '/configuration')).toBe('/api/v1/SysConfigurations');
    expect(ng1AdministrationApiPath('PATCH', `/configuration/${CONFIGURATION_ID}/value`)).toBe(
      `/api/v1/SysConfigurations/${CONFIGURATION_ID}/value`,
    );
  });

  it('rejects arbitrary methods, paths and internal Auth endpoints', () => {
    const rejected: Array<[string, string]> = [
      ['POST', '/configuration'],
      ['DELETE', '/storage'],
      ['GET', '/configuration/../../../internal/auth/session'],
      ['PATCH', '/configuration/evil/value'],
      ['PATCH', '/storage/configurations/123'],
      ['GET', '/internal/email'],
    ];

    for (const [method, path] of rejected) {
      expect(ng1AdministrationApiPath(method, path)).toBeNull();
    }
  });
});

describe('Storage administrative allowlist', () => {
  it('allows the Storage snapshot and the explicit configuration mutations', () => {
    expect(ng1AdministrationApiPath('GET', '/storage')).toBe(STORAGE_API);
    expect(ng1AdministrationApiPath('POST', '/storage/configurations')).toBe(
      `${STORAGE_API}/configurations`,
    );
    expect(ng1AdministrationApiPath('PATCH', `/storage/configurations/${CONFIGURATION_ID}`)).toBe(
      `${STORAGE_API}/configurations/${CONFIGURATION_ID}`,
    );
    expect(ng1AdministrationApiPath('PATCH', '/storage/configurations/default-json')).toBe(
      `${STORAGE_API}/configurations/default-json`,
    );
    expect(ng1AdministrationApiPath('DELETE', `/storage/configurations/${CONFIGURATION_ID}`)).toBe(
      `${STORAGE_API}/configurations/${CONFIGURATION_ID}`,
    );
    expect(ng1AdministrationApiPath('PATCH', '/storage/current')).toBe(`${STORAGE_API}/current`);
    expect(ng1AdministrationApiPath('PATCH', '/storage/debugging')).toBe(
      `${STORAGE_API}/debugging`,
    );
  });

  it('only allows known target operations', () => {
    const operations = ['schema/inspect', 'schema/prepare', 'database/prepare'];

    for (const operation of operations) {
      expect(ng1AdministrationApiPath('POST', `/storage/target/${operation}`)).toBe(
        `${STORAGE_API}/target/${operation}`,
      );
    }
  });

  it('rejects unsupported storage routes and HTTP methods', () => {
    expect(ng1AdministrationApiPath('PATCH', '/storage/configurations/123')).toBeNull();
    expect(ng1AdministrationApiPath('POST', '/storage/target/../../../private')).toBeNull();
    expect(ng1AdministrationApiPath('GET', '/storage/target/databases')).toBeNull();
  });
});
