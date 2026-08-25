import { describe, expect, it } from 'vitest';

import {
  availableProviders,
  externalProviderOption,
  externalVerificationSource,
} from '../src/auth/external-providers.js';

describe('external provider metadata', () => {
  it('exposes the four provider choices in stable display order', () => {
    expect(availableProviders().map((provider) => provider.key)).toEqual([
      'microsoft',
      'google',
      'facebook',
      'github',
    ]);
  });

  it('uses Bootstrap Icon metadata for every provider', () => {
    expect(
      Object.fromEntries(availableProviders().map((provider) => [provider.key, provider.icon])),
    ).toEqual({
      google: 'bi-google',
      facebook: 'bi-facebook',
      github: 'bi-github',
      microsoft: 'bi-microsoft',
    });
  });

  it('keeps Microsoft visible but unavailable until its OAuth strategy is implemented', () => {
    expect(externalProviderOption('microsoft')).toMatchObject({
      label: 'Microsoft',
      icon: 'bi-microsoft',
      configured: false,
    });
  });

  it('uses the provider key as stable email-verification provenance', () => {
    expect(externalVerificationSource('github')).toBe('github');
    expect(externalVerificationSource('google')).toBe('google');
    expect(externalVerificationSource('microsoft')).toBe('microsoft');
  });

  it('resolves provider metadata case-insensitively', () => {
    expect(externalProviderOption(' GitHub ')).toMatchObject({
      key: 'github',
      label: 'GitHub',
      icon: 'bi-github',
    });
  });
});
