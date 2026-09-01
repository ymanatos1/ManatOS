import { describe, expect, it, vi } from 'vitest';

import { resolveGitHubEmail } from '../src/auth/providers/github-provider.js';

describe('GitHub external profile email resolution', () => {
  it('prefers the primary verified GitHub email', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify([
          {
            email: 'secondary@example.com',
            primary: false,
            verified: true,
            visibility: null,
          },
          {
            email: 'primary@example.com',
            primary: true,
            verified: true,
            visibility: 'private',
          },
        ]),
        { status: 200 },
      ),
    ) as unknown as typeof fetch;

    await expect(resolveGitHubEmail('access-token', fetchImpl)).resolves.toEqual({
      email: 'primary@example.com',
      verified: true,
    });
  });

  it('falls back to another verified GitHub email when primary is not verified', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify([
          {
            email: 'primary-unverified@example.com',
            primary: true,
            verified: false,
            visibility: null,
          },
          {
            email: 'verified@example.com',
            primary: false,
            verified: true,
            visibility: null,
          },
        ]),
        { status: 200 },
      ),
    ) as unknown as typeof fetch;

    await expect(resolveGitHubEmail('access-token', fetchImpl)).resolves.toEqual({
      email: 'verified@example.com',
      verified: true,
    });
  });

  it('accepts a primary unverified GitHub email without claiming verification', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify([
          {
            email: 'unverified@example.com',
            primary: true,
            verified: false,
            visibility: null,
          },
        ]),
        { status: 200 },
      ),
    ) as unknown as typeof fetch;

    await expect(resolveGitHubEmail('access-token', fetchImpl)).resolves.toEqual({
      email: 'unverified@example.com',
      verified: false,
    });
  });
});
