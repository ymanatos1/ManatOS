import passport from 'passport';
import { Strategy as FacebookStrategy } from 'passport-facebook';
import { Strategy as GitHubStrategy } from 'passport-github2';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as MicrosoftStrategy } from 'passport-microsoft';

import type { ExternalProviderKey } from '@manatos/shared';

export interface ProviderCredentialTestOptions {
  testId: string;
  provider: ExternalProviderKey;
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
  tenant?: string;
}

/**
 * Register a short-lived Passport strategy used only to prove that a proposed
 * Client ID + Client secret pair can complete the provider's real OAuth token
 * exchange. The strategy name is unique per test, so it never replaces the
 * live runtime authentication strategy.
 */
export function configureProviderCredentialTest(options: ProviderCredentialTestOptions): string {
  const strategyName = `credential-test-${options.testId}`;
  const verified = (_accessToken: string, _refreshToken: string, _profile: unknown, done: (error: unknown, user?: Express.User | false) => void) => {
    done(null, {} as Express.User);
  };

  if (options.provider === 'microsoft') {
    passport.use(
      strategyName,
      new MicrosoftStrategy(
        {
          clientID: options.clientId,
          clientSecret: options.clientSecret,
          callbackURL: options.callbackUrl,
          tenant: options.tenant ?? 'common',
        },
        verified,
      ),
    );
  } else if (options.provider === 'google') {
    passport.use(
      strategyName,
      new GoogleStrategy(
        {
          clientID: options.clientId,
          clientSecret: options.clientSecret,
          callbackURL: options.callbackUrl,
        },
        verified,
      ),
    );
  } else if (options.provider === 'facebook') {
    passport.use(
      strategyName,
      new FacebookStrategy(
        {
          clientID: options.clientId,
          clientSecret: options.clientSecret,
          callbackURL: options.callbackUrl,
          profileFields: ['id'],
        },
        verified,
      ),
    );
  } else {
    passport.use(
      strategyName,
      new GitHubStrategy(
        {
          clientID: options.clientId,
          clientSecret: options.clientSecret,
          callbackURL: options.callbackUrl,
        },
        verified,
      ),
    );
  }

  return strategyName;
}

export function removeProviderCredentialTest(strategyName: string): void {
  passport.unuse(strategyName);
}
