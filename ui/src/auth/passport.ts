import passport from 'passport';

import { configureFacebookProvider } from './providers/facebook-provider.js';
import { configureGitHubProvider } from './providers/github-provider.js';
import { configureGoogleProvider } from './providers/google-provider.js';

/**
 * Register configured provider adapters with Passport.
 *
 * Each adapter is responsible only for its provider protocol/profile shape.
 * All account resolution, linking, registration and session behavior remains
 * in the provider-neutral authentication routes.
 */
export function configurePassport(): void {
  configureGoogleProvider();
  configureFacebookProvider();
  configureGitHubProvider();
}

export { passport };
