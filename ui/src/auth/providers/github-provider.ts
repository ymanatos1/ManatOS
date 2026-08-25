import passport from 'passport';
import { Strategy as GitHubStrategy, type Profile as GitHubProfile } from 'passport-github2';

import { config } from '../../config.js';

import type { ExternalProfile } from '../external-profile.js';
import { resolveGitHubEmail } from '../github-profile.js';

export function configureGitHubProvider(): void {
  if (!config.GITHUB_CLIENT_ID || !config.GITHUB_CLIENT_SECRET || !config.GITHUB_CALLBACK_URL) {
    return;
  }

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
}
