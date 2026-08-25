import passport from 'passport';
import { Strategy as MicrosoftStrategy } from 'passport-microsoft';

import { config } from '../../config.js';

import { normalizeMicrosoftProfile, type MicrosoftGraphProfile } from '../microsoft-profile.js';

/**
 * Microsoft identity platform adapter.
 *
 * passport-microsoft performs the OAuth 2.0 authorization-code exchange and
 * loads the signed-in user's profile from Microsoft Graph. OIDC identity
 * scopes are requested as part of the authorization request, while ManatOS
 * normalizes the resulting provider profile into its provider-neutral shape.
 */
export function configureMicrosoftProvider(): void {
  if (
    !config.MICROSOFT_CLIENT_ID ||
    !config.MICROSOFT_CLIENT_SECRET ||
    !config.MICROSOFT_CALLBACK_URL
  ) {
    return;
  }

  passport.use(
    new MicrosoftStrategy(
      {
        clientID: config.MICROSOFT_CLIENT_ID,
        clientSecret: config.MICROSOFT_CLIENT_SECRET,
        callbackURL: config.MICROSOFT_CALLBACK_URL,
        tenant: config.MICROSOFT_TENANT,
      },
      (
        _accessToken: string,
        _refreshToken: string,
        profile: MicrosoftGraphProfile,
        done: (
          error: unknown,
          user?: Express.User | false,
          info?: { externalProfile: ReturnType<typeof normalizeMicrosoftProfile> },
        ) => void,
      ) => {
        try {
          const externalProfile = normalizeMicrosoftProfile(profile);

          done(null, {} as Express.User, { externalProfile });
        } catch (error) {
          done(error instanceof Error ? error : new Error('Microsoft authentication failed.'));
        }
      },
    ),
  );
}
