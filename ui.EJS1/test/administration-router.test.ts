import { describe, expect, it } from 'vitest';
import { ejs1AdministrationApiPath } from '../src/administration-router.js';

describe('EJS1 authenticated administration proxy', () => {
  it('maps supported operations to the canonical API', () => {
    expect(ejs1AdministrationApiPath('GET', '/configuration')).toBe('/api/v1/SysConfigurations');
    expect(ejs1AdministrationApiPath('GET', '/storage')).toBe('/api/v1/system-settings/storage');
    expect(ejs1AdministrationApiPath('POST', '/storage/target/test-connection')).toBe(
      '/api/v1/system-settings/storage/target/test-connection',
    );
    expect(ejs1AdministrationApiPath('PATCH', '/storage/current')).toBe(
      '/api/v1/system-settings/storage/current',
    );
  });

  it('refuses arbitrary API paths, wrong methods, and path traversal', () => {
    expect(ejs1AdministrationApiPath('DELETE', '/configuration')).toBeNull();
    expect(ejs1AdministrationApiPath('POST', '/storage/target/anything')).toBeNull();
    expect(ejs1AdministrationApiPath('GET', '/storage/target/test-connection')).toBeNull();
    expect(ejs1AdministrationApiPath('PATCH', '/storage/../../auth')).toBeNull();
  });
});
