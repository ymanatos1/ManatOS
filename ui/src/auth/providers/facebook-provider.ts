import passport from 'passport';
import { Strategy as FacebookStrategy } from 'passport-facebook';

import { config } from '../../config.js';

import type { ExternalProfile } from '../external-profile.js';

export function configureFacebookProvider(): void {
  if (!config.FACEBOOK_CLIENT_ID || !config.FACEBOOK_CLIENT_SECRET || !config.FACEBOOK_CALLBACK_URL) {
    return;
  }

  passport.use(
    new FacebookStrategy(
      {
        clientID: config.FACEBOOK_CLIENT_ID,
        clientSecret: config.FACEBOOK_CLIENT_SECRET,
        callbackURL: config.FACEBOOK_CALLBACK_URL,
        profileFields: ['id', 'displayName', 'name', 'emails'],
      },
      (_accessToken, _refreshToken, profile, done) => {
        const email = profile.emails?.[0]?.value;

        if (!email) {
          return done(new Error('Facebook did not supply an email.'));
        }

        const externalProfile: ExternalProfile = {
          provider: 'facebook',
          providerSubject: profile.id,
          email,
          emailVerified: false,
          ...(profile.displayName ? { displayName: profile.displayName } : {}),
          ...(profile.name?.givenName ? { firstName: profile.name.givenName } : {}),
          ...(profile.name?.familyName ? { lastName: profile.name.familyName } : {}),
        };

        done(null, {} as Express.User, { externalProfile });
      },
    ),
  );
}
