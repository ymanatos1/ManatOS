import type { EmailVerificationSource, ExternalProviderKey } from '@manatos/shared';

import { apiClient } from '../api-client.js';

/**
 * Public provider projection used by Sign in/Register presentation.
 * It intentionally contains no Client ID, secret or persisted Admin metadata.
 */
export interface AuthProviderOption {
  key: ExternalProviderKey;
  label: string;
  icon: string;
  configured: boolean;
}

/**
 * Trusted UI-process runtime configuration used only by Passport.
 * This payload comes from the API's internal endpoint and never reaches the browser.
 */
export interface RuntimeAuthProvider {
  provider: ExternalProviderKey;
  label: string;
  icon: string;
  scope: string[];
  clientId: string;
  clientSecret: string;
  callbackPath: string;
  tenant?: string;
}

const registry = new Map<ExternalProviderKey, RuntimeAuthProvider>();

/**
 * Refresh the trusted Passport registry from the API immediately.
 *
 * There is deliberately no TTL/cache policy here: authentication routes call
 * this before starting a provider flow so an Admin change made by another client
 * is observed at the security boundary rather than being trusted from UI state.
 */
export async function refreshExternalProviderRegistry(): Promise<void> {
  const response = await apiClient.get<{ items: RuntimeAuthProvider[] }>(
    '/api/v1/internal/external-auth-providers/runtime',
    { internal: true },
  );

  registry.clear();

  for (const item of response.data.items) {
    registry.set(item.provider, item);
  }
}

export function runtimeProvider(key: ExternalProviderKey): RuntimeAuthProvider | undefined {
  return registry.get(key);
}

/**
 * Current configured provider presentation available inside the trusted UI
 * process. Ordinary anonymous pages intentionally begin with an empty list;
 * Sign in/Register obtains current public state on demand instead.
 */
export function availableProviders(): AuthProviderOption[] {
  return [...registry.values()].map((provider) => ({
    key: provider.provider,
    label: provider.label,
    icon: provider.icon,
    configured: true,
  }));
}

export function externalProviderOption(provider: string): AuthProviderOption | undefined {
  const key = provider.trim().toLowerCase() as ExternalProviderKey;
  const runtime = registry.get(key);

  if (!runtime) {
    return undefined;
  }

  return {
    key,
    label: runtime.label,
    icon: runtime.icon,
    configured: true,
  };
}

export function externalVerificationSource(
  provider: ExternalProviderKey,
): EmailVerificationSource {
  return provider;
}
