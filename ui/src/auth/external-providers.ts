import type { ExternalProviderKey, EmailVerificationSource } from '@manatos/shared';

import { config } from '../config.js';

/**
 * Provider metadata shared by authentication routes and EJS presentation.
 *
 * Keeping provider labels/icons/configuration in one place avoids repeating
 * provider-specific presentation logic throughout templates.
 *
 * A provider becomes live only when all credentials required by its adapter
 * are configured. Unconfigured providers remain visible in the UI.
 */
export interface AuthProviderOption {
  key: ExternalProviderKey;
  label: string;
  icon: string;
  configured: boolean;

  /** OAuth scopes requested when beginning the provider flow. */
  scope?: string[];
}

const providerOptions = (): AuthProviderOption[] => [
  {
    key: 'microsoft',
    label: 'Microsoft',
    icon: 'bi-microsoft',
    configured: Boolean(
      config.MICROSOFT_CLIENT_ID &&
        config.MICROSOFT_CLIENT_SECRET &&
        config.MICROSOFT_CALLBACK_URL,
    ),
    scope: ['openid', 'profile', 'email', 'User.Read'],
  },
  {
    key: 'google',
    label: 'Google',
    icon: 'bi-google',
    configured: Boolean(
      config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET && config.GOOGLE_CALLBACK_URL,
    ),
    scope: ['profile', 'email'],
  },
  {
    key: 'facebook',
    label: 'Facebook',
    icon: 'bi-facebook',
    configured: Boolean(
      config.FACEBOOK_CLIENT_ID && config.FACEBOOK_CLIENT_SECRET && config.FACEBOOK_CALLBACK_URL,
    ),
    scope: ['email'],
  },
  {
    key: 'github',
    label: 'GitHub',
    icon: 'bi-github',
    configured: Boolean(
      config.GITHUB_CLIENT_ID && config.GITHUB_CLIENT_SECRET && config.GITHUB_CALLBACK_URL,
    ),
    scope: ['read:user', 'user:email'],
  },
];

/** Live providers for which Passport routes may be registered. */
export function configuredProviders(): AuthProviderOption[] {
  return providerOptions().filter((provider) => provider.configured);
}

/** All providers shown in the sign-in/register UI, including unavailable ones. */
export function availableProviders(): AuthProviderOption[] {
  return providerOptions();
}

/** Presentation metadata for a provider key received from an external profile. */
export function externalProviderOption(provider: string): AuthProviderOption | undefined {
  const normalized = provider.trim().toLowerCase();

  return providerOptions().find((option) => option.key === normalized);
}

/** Verification provenance key for a normalized external provider. */
export function externalVerificationSource(provider: ExternalProviderKey): EmailVerificationSource {
  return provider;
}
