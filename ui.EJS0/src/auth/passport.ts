import passport from 'passport';
import { EXTERNAL_PROVIDER_KEYS } from '@manatos/shared';

import { config } from '../config.js';
import { externalProviderAdapter } from './providers/registry.js';
import { runtimeProvider } from './providers/runtime-registry.js';

/** Re-register Passport strategies from the current database-backed provider registry. */
export function configurePassport(): void {
  for (const key of EXTERNAL_PROVIDER_KEYS) {
    passport.unuse(key);
    const provider = runtimeProvider(key);
    if (!provider) continue;

    externalProviderAdapter(key).configureLive({
      clientId: provider.clientId,
      clientSecret: provider.clientSecret,
      callbackUrl: new URL(provider.callbackPath, config.PUBLIC_BASE_URL).toString(),
      ...(provider.tenant ? { tenant: provider.tenant } : {}),
    });
  }
}

export { passport };
