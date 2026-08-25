import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as FacebookStrategy } from 'passport-facebook';
import { Strategy as GitHubStrategy, type Profile as GitHubProfile } from 'passport-github2';

import { config } from '../config.js';

import { resolveGitHubEmail } from './github-profile.js';

export interface ExternalProfile {
  provider: string;
  providerSubject: string;
  email: string;
  emailVerified: boolean;
  displayName?: string;

  /** Provider-specific login/user name when the provider exposes one. */
  userName?: string;

  firstName?: string;
  lastName?: string;
}

/**
 * Passport handles only the external-provider protocol.
 *
 * SysUser lookup/linking/creation remains ManatOS domain logic.
 */
export function configurePassport() {
  if (config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET && config.GOOGLE_CALLBACK_URL) {
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

          const googleEmailVerified = Boolean(
            (profile as typeof profile & { _json?: { email_verified?: boolean } })._json
              ?.email_verified,
          );

          done(null, {} as Express.User, {
            externalProfile: {
              provider: 'google',
              providerSubject: profile.id,
              email,
              emailVerified: googleEmailVerified,
              ...(profile.displayName ? { displayName: profile.displayName } : {}),
              ...(profile.name?.givenName ? { firstName: profile.name.givenName } : {}),
              ...(profile.name?.familyName ? { lastName: profile.name.familyName } : {}),
            },
          });
        },
      ),
    );
  }

  if (config.FACEBOOK_CLIENT_ID && config.FACEBOOK_CLIENT_SECRET && config.FACEBOOK_CALLBACK_URL) {
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

          done(null, {} as Express.User, {
            externalProfile: {
              provider: 'facebook',
              providerSubject: profile.id,
              email,
              emailVerified: false,
              ...(profile.displayName ? { displayName: profile.displayName } : {}),
              ...(profile.name?.givenName ? { firstName: profile.name.givenName } : {}),
              ...(profile.name?.familyName ? { lastName: profile.name.familyName } : {}),
            },
          });
        },
      ),
    );
  }

  if (config.GITHUB_CLIENT_ID && config.GITHUB_CLIENT_SECRET && config.GITHUB_CALLBACK_URL) {
    passport.use(
      new GitHubStrategy(
        {
          clientID: config.GITHUB_CLIENT_ID,
          clientSecret: config.GITHUB_CLIENT_SECRET,
          callbackURL: config.GITHUB_CALLBACK_URL,
        },
        async (
          accessToken: string,
          _refreshToken: string,
          profile: GitHubProfile,
          done: (
            error: Error | null,
            user?: Express.User | false,
            info?: { externalProfile: ExternalProfile },
          ) => void,
        ) => {
          try {
            /**
             * GitHub may omit email from the ordinary profile when the user
             * keeps it private. Because the provider route requests
             * user:email, resolve a verified address from /user/emails.
             */
            const githubEmail = await resolveGitHubEmail(accessToken);

            const externalProfile: ExternalProfile = {
              provider: 'github',
              providerSubject: profile.id,
              email: githubEmail.email,
              emailVerified: githubEmail.verified,
              ...(profile.displayName ? { displayName: profile.displayName } : {}),
              ...(profile.username ? { userName: profile.username } : {}),
            };

            /**
             * Keep GitHub aligned with the existing Google/Facebook pipeline:
             * auth-routes.ts reads req.authInfo.externalProfile after Passport
             * completes the provider callback.
             */
            done(null, {} as Express.User, { externalProfile });
          } catch (error) {
            done(error instanceof Error ? error : new Error('GitHub authentication failed.'));
          }
        },
      ),
    );
  }
}

export { passport };
