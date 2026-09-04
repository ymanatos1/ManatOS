import type { EmailVerificationSource, ExternalProviderKey } from '@manatos/shared';

import { apiClient } from '../../api/client.js';

/** Anonymous-safe provider projection used by Sign in/Register presentation. */
export interface AuthProviderOption {
  key: ExternalProviderKey;
  label: string;
  icon: string;
  configured: boolean;
}

/** Trusted UI-process configuration consumed only by server-side OAuth adapters. */
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

/** Refresh runtime provider state directly from the trusted API security boundary. */
export async function refreshExternalProviderRegistry(): Promise<void> {
  const response = await apiClient.get<{ items: RuntimeAuthProvider[] }>(
    '/api/v1/internal/external-auth-providers/runtime',
    { internal: true },
  );

  registry.clear();
  for (const item of response.data.items) registry.set(item.provider, item);
}

export function runtimeProvider(key: ExternalProviderKey): RuntimeAuthProvider | undefined {
  return registry.get(key);
}

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
  return runtime
    ? { key, label: runtime.label, icon: runtime.icon, configured: true }
    : undefined;
}

export function externalVerificationSource(provider: ExternalProviderKey): EmailVerificationSource {
  return provider;
}
