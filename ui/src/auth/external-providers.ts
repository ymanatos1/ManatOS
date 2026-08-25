import { config } from '../config.js';

export type ExternalProviderKey = 'google' | 'facebook' | 'github' | 'microsoft';

/**
 * Provider metadata shared by authentication routes and EJS presentation.
 *
 * Keeping provider labels/icons/configuration in one place avoids repeating
 * provider-specific presentation logic throughout templates.
 *
 * Microsoft is intentionally visible but not yet implemented. It therefore
 * remains configured=false until its OAuth strategy/configuration is added.
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
    configured: false,
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
