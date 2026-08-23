import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as FacebookStrategy } from 'passport-facebook';

import { config } from '../config.js';


export interface ExternalProfile {
  provider: string;
  providerSubject: string;
  email: string;
  emailVerified: boolean;
  displayName?: string;
  firstName?: string;
  lastName?: string;
}


/**
 * Authentication-provider information exposed to the UI.
 *
 * All supported providers are returned so the sign-in/register dialogs
 * remain visually stable and make provider capability discoverable.
 *
 * configured=false means the application administrator still needs to
 * provide that provider's OAuth client ID/secret in the environment.
 */
export interface AuthProviderOption {
  key: string;
  label: string;
  icon: string;
  configured: boolean;
}


const providerOptions = (): AuthProviderOption[] => [
  {
    key: 'google',
    label: 'Google',
    icon: 'bi-google',
    configured: Boolean(
      config.GOOGLE_CLIENT_ID &&
      config.GOOGLE_CLIENT_SECRET &&
      config.GOOGLE_CALLBACK_URL
    ),
  },
  {
    key: 'facebook',
    label: 'Facebook',
    icon: 'bi-facebook',
    configured: Boolean(
      config.FACEBOOK_CLIENT_ID &&
      config.FACEBOOK_CLIENT_SECRET &&
      config.FACEBOOK_CALLBACK_URL
    ),
  },
];


/**
 * Passport handles only the external-provider protocol.
 *
 * SysUser lookup/linking/creation remains ManatOS domain logic.
 */
export function configurePassport() {
  if (
    config.GOOGLE_CLIENT_ID &&
    config.GOOGLE_CLIENT_SECRET &&
    config.GOOGLE_CALLBACK_URL
  ) {
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
            return done(
              new Error('Google did not supply an email.'),
            );
          }

          done(
            null,
            {} as Express.User,
            {
              externalProfile: {
                provider: 'google',
                providerSubject: profile.id,
                email,
                emailVerified: true,
                ...(profile.displayName
                  ? { displayName: profile.displayName }
                  : {}),
                ...(profile.name?.givenName
                  ? { firstName: profile.name.givenName }
                  : {}),
                ...(profile.name?.familyName
                  ? { lastName: profile.name.familyName }
                  : {}),
              },
            },
          );
        },
      ),
    );
  }

  if (
    config.FACEBOOK_CLIENT_ID &&
    config.FACEBOOK_CLIENT_SECRET &&
    config.FACEBOOK_CALLBACK_URL
  ) {
    passport.use(
      new FacebookStrategy(
        {
          clientID: config.FACEBOOK_CLIENT_ID,
          clientSecret: config.FACEBOOK_CLIENT_SECRET,
          callbackURL: config.FACEBOOK_CALLBACK_URL,
          profileFields: [
            'id',
            'displayName',
            'name',
            'emails',
          ],
        },
        (_accessToken, _refreshToken, profile, done) => {
          const email = profile.emails?.[0]?.value;

          if (!email) {
            return done(
              new Error('Facebook did not supply an email.'),
            );
          }

          done(
            null,
            {} as Express.User,
            {
              externalProfile: {
                provider: 'facebook',
                providerSubject: profile.id,
                email,
                emailVerified: false,
                ...(profile.displayName
                  ? { displayName: profile.displayName }
                  : {}),
                ...(profile.name?.givenName
                  ? { firstName: profile.name.givenName }
                  : {}),
                ...(profile.name?.familyName
                  ? { lastName: profile.name.familyName }
                  : {}),
              },
            },
          );
        },
      ),
    );
  }
}


/**
 * Provider list used by route registration.
 *
 * Only configured providers may have live Passport routes.
 */
export function configuredProviders(): AuthProviderOption[] {
  return providerOptions().filter(
    (provider) => provider.configured,
  );
}


/**
 * Provider list used by the sign-in/register UI.
 *
 * Unsupported-by-configuration providers remain visible but disabled.
 */
export function availableProviders(): AuthProviderOption[] {
  return providerOptions();
}


export {
  passport,
};
