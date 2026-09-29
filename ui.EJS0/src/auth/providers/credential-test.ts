import passport from 'passport';
import type { ExternalProviderKey } from '@manatos/shared';

import { externalProviderAdapter } from './registry.js';

export interface ProviderCredentialTestOptions {
  testId: string;
  provider: ExternalProviderKey;
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
  tenant?: string;
}

/**
 * Register a short-lived strategy through the same provider adapter registry
 * used by live authentication. Callers remain provider-neutral.
 */
export function configureProviderCredentialTest(options: ProviderCredentialTestOptions): string {
  const strategyName = `credential-test-${options.testId}`;
  externalProviderAdapter(options.provider).configureCredentialTest(strategyName, options);
  return strategyName;
}

export function removeProviderCredentialTest(strategyName: string): void {
  passport.unuse(strategyName);
}
