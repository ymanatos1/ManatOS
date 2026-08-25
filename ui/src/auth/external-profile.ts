import type { ExternalProviderKey } from '@manatos/shared';

/**
 * Provider-neutral identity information produced after external authentication.
 * Provider adapters normalize their native profile into this shape; all
 * downstream ManatOS account resolution/linking logic is provider-independent.
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
