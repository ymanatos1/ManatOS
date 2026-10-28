import { describe, expect, it } from 'vitest';

import { readNg1RuntimeConfig } from '../src/runtime-config';

describe('NG1 public runtime configuration', () => {
  it('normalizes the configured API origin', () => {
    expect(readNg1RuntimeConfig({ apiBaseUrl: 'https://api.manatos.info/' })).toEqual({
      apiBaseUrl: 'https://api.manatos.info',
    });
  });

  it('rejects missing and non-HTTP API origins', () => {
    expect(() => readNg1RuntimeConfig({})).toThrow(/apiBaseUrl/);
    expect(() => readNg1RuntimeConfig({ apiBaseUrl: 'file:///tmp/api' })).toThrow(/http or https/);
  });
});
