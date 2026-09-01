import passport from 'passport';
import { Strategy as GitHubStrategy, type Profile as GitHubProfile } from 'passport-github2';

import type { ExternalProfile, ExternalProviderAdapter } from './contracts.js';
import { credentialTestVerified } from './contracts.js';

/** Minimal GitHub email record returned by GET /user/emails. */
export interface GitHubEmailRecord {
  email: string;
  primary: boolean;
  verified: boolean;
  visibility: string | null;
}

export interface ResolvedGitHubEmail {
  email: string;
  verified: boolean;
}

/**
 * GitHub can hide email from the ordinary profile. Resolve the best address
 * from the authenticated /user/emails endpoint without conflating provider
 * authentication with email verification.
 */
export async function resolveGitHubEmail(
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ResolvedGitHubEmail> {
  const response = await fetchImpl('https://api.github.com/user/emails', {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${accessToken}`,
      'User-Agent': 'ManatOS',
    },
  });

  if (!response.ok) throw new Error(`GitHub email lookup failed with HTTP ${response.status}.`);

  const emails = (await response.json()) as GitHubEmailRecord[];
  const selected =
    emails.find((record) => record.primary && record.verified) ??
    emails.find((record) => record.verified) ??
    emails.find((record) => record.primary) ??
    emails[0];

  if (!selected?.email) throw new Error('GitHub did not supply an email address.');
  return { email: selected.email, verified: selected.verified };
}

export const githubProviderAdapter: ExternalProviderAdapter = {
  key: 'github',

  configureLive(options) {
    passport.use(
      new GitHubStrategy(
        {
          clientID: options.clientId,
          clientSecret: options.clientSecret,
          callbackURL: options.callbackUrl,
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
            const githubEmail = await resolveGitHubEmail(accessToken);
            const externalProfile: ExternalProfile = {
              provider: 'github',
              providerSubject: profile.id,
              email: githubEmail.email,
              emailVerified: githubEmail.verified,
              ...(profile.displayName ? { displayName: profile.displayName } : {}),
              ...(profile.username ? { userName: profile.username } : {}),
            };

            done(null, {} as Express.User, { externalProfile });
          } catch (error) {
            done(error instanceof Error ? error : new Error('GitHub authentication failed.'));
          }
        },
      ),
    );
  },

  configureCredentialTest(strategyName, options) {
    passport.use(
      strategyName,
      new GitHubStrategy(
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
