import { describe, expect, it } from 'vitest';

import { readEjs1Config } from '../src/config.js';

describe('EJS1 host configuration', () => {
  it('reads and normalizes environment-owned host values', () => {
    expect(
      readEjs1Config({
        NODE_ENV: 'development',
        UI_PORT: '3003',
        API_BASE_URL: 'http://localhost:3000/',
        AUTH_DELEGATION_SECRET: 'test-delegation-secret',
        PUBLIC_BASE_URL: 'http://localhost:3003/',
        DOCUMENTATION_REPOSITORY_ROOT: '..',
      }),
    ).toEqual({
      nodeEnv: 'development',
      uiPort: 3003,
      apiBaseUrl: 'http://localhost:3000',
      authDelegationSecret: 'test-delegation-secret',
      publicBaseUrl: 'http://localhost:3003',
      documentationRepositoryRoot: expect.any(String),
    });
  });

  it('accepts the existing UI host environment keys', () => {
    const config = readEjs1Config({
      UI_ENVIRONMENT: 'development',
      UI_PORT: '3005',
      API_BASE_URL: 'http://localhost:3000',
      AUTH_DELEGATION_SECRET: 'test-delegation-secret',
      UI_PUBLIC_BASE_URL: 'http://localhost:3003',
      DOCUMENTATION_REPOSITORY_ROOT: '..',
    });
    expect(config.nodeEnv).toBe('development');
    expect(config.publicBaseUrl).toBe('http://localhost:3003');
  });

  it('refuses to start without the private delegation secret', () => {
    expect(() =>
      readEjs1Config({
        UI_ENVIRONMENT: 'test',
        UI_PORT: '3003',
        API_BASE_URL: 'http://localhost:3000',
        UI_PUBLIC_BASE_URL: 'http://localhost:3003',
        DOCUMENTATION_REPOSITORY_ROOT: '..',
      }),
    ).toThrow(/AUTH_DELEGATION_SECRET/);
  });

  it('fails fast when required host configuration is missing', () => {
    expect(() => readEjs1Config({ NODE_ENV: 'development' })).toThrow(/UI_PORT/);
  });
});
