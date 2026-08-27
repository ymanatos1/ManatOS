import passport from 'passport';
import { EXTERNAL_PROVIDER_KEYS } from '@manatos/shared';
import { config } from '../config.js';
import { runtimeProvider } from './external-providers.js';
import { configureFacebookProvider } from './providers/facebook-provider.js';
import { configureGitHubProvider } from './providers/github-provider.js';
import { configureGoogleProvider } from './providers/google-provider.js';
import { configureMicrosoftProvider } from './providers/microsoft-provider.js';

/** Re-register Passport strategies from the current database-backed provider registry. */
export function configurePassport(): void {
  for (const key of EXTERNAL_PROVIDER_KEYS) {
    passport.unuse(key);
    const provider = runtimeProvider(key);
    if (!provider) continue;
    const callbackUrl = new URL(provider.callbackPath, config.PUBLIC_BASE_URL).toString();
    const common = { clientId: provider.clientId, clientSecret: provider.clientSecret, callbackUrl };
    if (key === 'microsoft') configureMicrosoftProvider({ ...common, ...(provider.tenant ? { tenant: provider.tenant } : {}) });
    else if (key === 'google') configureGoogleProvider(common);
    else if (key === 'facebook') configureFacebookProvider(common);
    else configureGitHubProvider(common);
  }
}
export { passport };
