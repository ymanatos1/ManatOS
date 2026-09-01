import type { ExternalProviderKey } from '@manatos/shared';

/**
 * Provider-neutral identity produced by an OAuth adapter.
 *
 * Provider-specific profile shapes stop at the adapter boundary. All ManatOS
 * account/linking code consumes this one normalized contract.
 */
export interface ExternalProfile {
  provider: ExternalProviderKey;
  providerSubject: string;
  email: string;
  emailVerified: boolean;
  displayName?: string;
  userName?: string;
  firstName?: string;
  lastName?: string;
}

/** Runtime credentials/configuration supplied by the trusted API endpoint. */
export interface ProviderStrategyOptions {
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
  tenant?: string;
}

/**
 * Minimal executable boundary that cannot be represented by presentation
 * metadata: concrete Passport packages/profile semantics differ per provider.
 * Static provider facts (label/icon/scope/callback/help/defaults) remain in the
 * canonical provider definitions exposed by the API.
 */
export interface ExternalProviderAdapter {
  key: ExternalProviderKey;
  configureLive(options: ProviderStrategyOptions): void;
  configureCredentialTest(strategyName: string, options: ProviderStrategyOptions): void;
}

/** Shared credential-test callback: a successful OAuth token/profile exchange is enough. */
export function credentialTestVerified(
  _accessToken: string,
  _refreshToken: string,
  _profile: unknown,
  done: (error: unknown, user?: Express.User | false) => void,
): void {
  done(null, {} as Express.User);
}
