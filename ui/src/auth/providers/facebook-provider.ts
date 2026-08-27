import passport from 'passport';
import { Strategy as FacebookStrategy } from 'passport-facebook';

import type { ExternalProfile } from '../external-profile.js';

export function configureFacebookProvider(options: { clientId: string; clientSecret: string; callbackUrl: string }): void {
  passport.use(
    new FacebookStrategy(
      {
        clientID: options.clientId,
        clientSecret: options.clientSecret,
        callbackURL: options.callbackUrl,
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
