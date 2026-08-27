import { describe, expect, it } from 'vitest';

import {
  availableProviders,
  externalProviderOption,
  externalVerificationSource,
} from '../src/auth/external-providers.js';

describe('external provider runtime registry', () => {
  it('starts empty until the API supplies configured runtime providers', () => {
    expect(availableProviders()).toEqual([]);
    expect(externalProviderOption('microsoft')).toBeUndefined();
  });

  it('uses the provider key as stable email-verification provenance', () => {
    expect(externalVerificationSource('github')).toBe('github');
    expect(externalVerificationSource('google')).toBe('google');
    expect(externalVerificationSource('microsoft')).toBe('microsoft');
  });
});
