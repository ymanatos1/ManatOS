import { createHash, randomBytes, randomUUID } from 'node:crypto';

import type { SysUserRole } from '@manatos/shared';

export interface AccessTokenContext {
  tokenId: string;

  userId: string;
  userName: string;
  role: SysUserRole;

  createdAt: number;
  expiresAt: number;
}

interface StoredAccessToken extends AccessTokenContext {
  tokenHash: string;
}

/**
 * In-memory opaque API access-token store.
 *
 * Raw bearer tokens are never stored. Only their SHA-256 hashes
 * remain in memory.
 *
 * A future multi-instance deployment can replace this implementation
 * with Redis without changing the HTTP authentication contract.
 */
export class AccessTokenStore {
  private readonly tokens = new Map<string, StoredAccessToken>();

  create(
    user: {
      id: string;
      name: string;
      role: SysUserRole;
    },
    lifetimeMinutes: number,
  ) {
    const tokenId = randomUUID();

    const secret = randomBytes(32).toString('base64url');

    const rawToken = `${tokenId}.${secret}`;

    const now = Date.now();

    const createdAt = now;
    const expiresAt = createdAt + lifetimeMinutes * 60_000;

    this.tokens.set(tokenId, {
      tokenId,

      userId: user.id,

      userName: user.name,

      role: user.role,

      createdAt: createdAt,

      expiresAt: expiresAt,

      tokenHash: hash(rawToken),
    });

    return {
      token: rawToken,

      expiresAt: expiresAt,
    };
  }

  validate(rawToken: string): AccessTokenContext | null {
    const [tokenId] = rawToken.split('.', 1);

    if (!tokenId) {
      return null;
    }

    const stored = this.tokens.get(tokenId);

    if (!stored || stored.expiresAt <= Date.now() || stored.tokenHash !== hash(rawToken)) {
      if (stored && stored.expiresAt <= Date.now()) {
        this.tokens.delete(tokenId);
      }

      return null;
    }

    const { tokenHash: _tokenHash, ...context } = stored;

    return context;
  }

  revoke(rawToken: string): void {
    const [tokenId] = rawToken.split('.', 1);

    if (tokenId) {
      this.tokens.delete(tokenId);
    }
  }
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export const accessTokenStore = new AccessTokenStore();
