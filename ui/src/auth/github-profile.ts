/**
 * Minimal GitHub email record returned by GET /user/emails.
 */
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
 * Resolve the best GitHub email address for an OAuth-authenticated user.
 *
 * GitHub's ordinary profile may omit email when the user keeps it private.
 * The OAuth flow therefore requests user:email and this helper queries the
 * authenticated-user email endpoint. Preference order is:
 *
 *   1. primary + verified;
 *   2. any verified email;
 *   3. primary unverified email;
 *   4. any available email.
 *
 * Authentication by GitHub and verification of the email are deliberately
 * kept as separate facts. An unverified GitHub email may still be used to
 * identify/register the external account, but it MUST NOT mark the ManatOS
 * email as verified.
 */
export async function resolveGitHubEmail(
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ResolvedGitHubEmail> {
  const response = await fetchImpl(
    'https://api.github.com/user/emails',

    {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${accessToken}`,
        'User-Agent': 'ManatOS',
      },
    },
  );

  if (!response.ok) {
    throw new Error(
      `GitHub email lookup failed with HTTP ${response.status}.`,
    );
  }

  const emails = (await response.json()) as GitHubEmailRecord[];

  const selected =
    emails.find((record) => record.primary && record.verified) ??
    emails.find((record) => record.verified) ??
    emails.find((record) => record.primary) ??
    emails[0];

  if (!selected?.email) {
    throw new Error('GitHub did not supply an email address.');
  }

  return {
    email: selected.email,
    verified: selected.verified,
  };
}
