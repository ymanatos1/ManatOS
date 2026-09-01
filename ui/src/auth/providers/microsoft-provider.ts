import passport from 'passport';
import { Strategy as MicrosoftStrategy } from 'passport-microsoft';

import type { ExternalProfile, ExternalProviderAdapter } from './contracts.js';
import { credentialTestVerified } from './contracts.js';

/** Minimal Microsoft Graph profile shape consumed at the adapter boundary. */
export interface MicrosoftGraphProfile {
  id: string;
  displayName?: string;
  name?: { givenName?: string; familyName?: string };
  emails?: Array<{ value?: string }>;
  _json?: {
    mail?: string | null;
    userPrincipalName?: string | null;
    givenName?: string | null;
    surname?: string | null;
  };
}

export function normalizeMicrosoftProfile(profile: MicrosoftGraphProfile): ExternalProfile {
  const email =
    profile.emails?.find((entry) => entry.value?.trim())?.value?.trim() ||
    profile._json?.mail?.trim() ||
    profile._json?.userPrincipalName?.trim();

  if (!email) throw new Error('Microsoft did not supply an email address.');

  const firstName = profile.name?.givenName?.trim() || profile._json?.givenName?.trim();
  const lastName = profile.name?.familyName?.trim() || profile._json?.surname?.trim();

  return {
    provider: 'microsoft',
    providerSubject: profile.id,
    email,
    // Graph mail/UPN presence is not itself proof of verified email ownership.
    emailVerified: false,
    ...(profile.displayName?.trim() ? { displayName: profile.displayName.trim() } : {}),
    ...(firstName ? { firstName } : {}),
    ...(lastName ? { lastName } : {}),
  };
}

export const microsoftProviderAdapter: ExternalProviderAdapter = {
  key: 'microsoft',

  configureLive(options) {
    passport.use(
      new MicrosoftStrategy(
        {
          clientID: options.clientId,
          clientSecret: options.clientSecret,
          callbackURL: options.callbackUrl,
          tenant: options.tenant ?? 'common',
        },
        (
          _accessToken: string,
          _refreshToken: string,
          profile: MicrosoftGraphProfile,
          done: (
            error: unknown,
            user?: Express.User | false,
            info?: { externalProfile: ExternalProfile },
          ) => void,
        ) => {
          try {
            done(null, {} as Express.User, { externalProfile: normalizeMicrosoftProfile(profile) });
          } catch (error) {
            done(error instanceof Error ? error : new Error('Microsoft authentication failed.'));
          }
        },
      ),
    );
  },

  configureCredentialTest(strategyName, options) {
    passport.use(
      strategyName,
      new MicrosoftStrategy(
        {
          clientID: options.clientId,
          clientSecret: options.clientSecret,
          callbackURL: options.callbackUrl,
          tenant: options.tenant ?? 'common',
        },
        credentialTestVerified,
      ),
    );
  },
};
