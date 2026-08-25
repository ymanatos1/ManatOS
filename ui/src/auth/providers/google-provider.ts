import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';

import { config } from '../../config.js';

import type { ExternalProfile } from '../external-profile.js';

export function configureGoogleProvider(): void {
  if (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET || !config.GOOGLE_CALLBACK_URL) {
    return;
  }

  passport.use(
    new GoogleStrategy(
      {
        clientID: config.GOOGLE_CLIENT_ID,
        clientSecret: config.GOOGLE_CLIENT_SECRET,
        callbackURL: config.GOOGLE_CALLBACK_URL,
      },
      (_accessToken, _refreshToken, profile, done) => {
        const email = profile.emails?.[0]?.value;

        if (!email) {
          return done(new Error('Google did not supply an email.'));
        }

        const emailVerified = Boolean(
          (profile as typeof profile & { _json?: { email_verified?: boolean } })._json
            ?.email_verified,
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
}
