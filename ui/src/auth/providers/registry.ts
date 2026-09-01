import { EXTERNAL_PROVIDER_KEYS, type ExternalProviderKey } from '@manatos/shared';

import type { ExternalProviderAdapter } from './contracts.js';
import { facebookProviderAdapter } from './facebook-provider.js';
import { githubProviderAdapter } from './github-provider.js';
import { googleProviderAdapter } from './google-provider.js';
import { microsoftProviderAdapter } from './microsoft-provider.js';

/**
 * Executable OAuth adapter registry.
 *
 * This is deliberately code, not UI metadata: Passport strategy constructors
 * and provider-native profile normalization are executable protocol adapters.
 * The registry removes provider branching from callers while the declarative
 * provider facts continue to come from the canonical API definitions.
 */
const adapters: Readonly<Record<ExternalProviderKey, ExternalProviderAdapter>> = Object.freeze({
  google: googleProviderAdapter,
  facebook: facebookProviderAdapter,
  github: githubProviderAdapter,
  microsoft: microsoftProviderAdapter,
});

export function externalProviderAdapter(key: ExternalProviderKey): ExternalProviderAdapter {
  const adapter = adapters[key];
  if (!adapter) throw new Error(`No OAuth adapter is registered for provider '${key}'.`);
  return adapter;
}

/** Contract helper used by regression tests to prevent adapter/metadata drift. */
export function registeredExternalProviderKeys(): readonly ExternalProviderKey[] {
  return EXTERNAL_PROVIDER_KEYS.filter((key) => Boolean(adapters[key]));
}
