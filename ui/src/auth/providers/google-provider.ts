import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';

import type { ExternalProfile, ExternalProviderAdapter } from './contracts.js';
import { credentialTestVerified } from './contracts.js';

export const googleProviderAdapter: ExternalProviderAdapter = {
  key: 'google',

  configureLive(options) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: options.clientId,
          clientSecret: options.clientSecret,
          callbackURL: options.callbackUrl,
        },
        (_accessToken, _refreshToken, profile, done) => {
          const email = profile.emails?.[0]?.value;

          if (!email) return done(new Error('Google did not supply an email.'));

          const emailVerified = Boolean(
            (profile as typeof profile & { _json?: { email_verified?: boolean } })._json?.email_verified,
          );

          const externalProfile: ExternalProfile = {
            provider: 'google',
            providerSubject: profile.id,
            email,
            emailVerified,
            ...(profile.displayName ? { displayName: profile.displayName } : {}),
            ...(profile.name?.givenName ? { firstName: profile.name.givenName } : {}),
            ...(profile.name?.familyName ? { lastName: profile.name.familyName } : {}),
          };

          done(null, {} as Express.User, { externalProfile });
        },
      ),
    );
  },

  configureCredentialTest(strategyName, options) {
    passport.use(
      strategyName,
      new GoogleStrategy(
        {
          clientID: options.clientId,
          clientSecret: options.clientSecret,
          callbackURL: options.callbackUrl,
        },
        credentialTestVerified,
      ),
    );
  },
};
