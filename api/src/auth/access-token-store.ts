import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

import type { SysUserRole } from '@manatos/shared';

/**
 * Client information observed when a session is created.
 *
 * This information is diagnostic only. It must never be used as
 * authentication proof.
 */
export interface SessionClientInfo {
  clientName?: string;
  userAgent?: string;
  ipAddress?: string;
}

/**
 * Authentication/session context attached to an authenticated request.
 */
export interface AccessTokenContext {
  tokenId: string;

  userId: string;
  userName: string;
  role: SysUserRole;

  createdAt: number;
  lastSeenAt: number;
  expiresAt: number;

  clientName?: string;
  userAgent?: string;
  ipAddress?: string;
}

/**
 * Safe session information that may be returned to the user.
 *
 * Raw tokens and token hashes are deliberately excluded.
 */
export interface UserSessionInfo {
  sessionId: string;

  current: boolean;

  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;

  clientName?: string;
  userAgent?: string;
  ipAddress?: string;
}

/**
 * Internal session representation.
 *
 * Only a SHA-256 hash of the actual Bearer token is retained.
 */
interface StoredAccessToken extends AccessTokenContext {
  tokenHash: string;
}

/**
 * Result returned when a new API session is created.
 */
export interface CreatedAccessToken {
  token: string;
  tokenId: string;

  expiresAt: number;
}

/**
 * In-memory opaque API access-token/session store.
 *
 * Important:
 *
 * - raw Bearer tokens are never stored;
 * - sessions disappear when the API process restarts;
 * - multiple simultaneous sessions per user are supported;
 * - logout revokes one session;
 * - logout-all revokes all sessions belonging to one user.
 *
 * A future Redis implementation can expose the same contract when
 * ManatOS runs on multiple API instances.
 */
export class AccessTokenStore {
  private readonly tokens = new Map<string, StoredAccessToken>();

  /**
   * Create a new independent session for a SysUser.
   *
   * Logging in twice therefore creates two active sessions.
   */
  create(
    user: {
      id: string;
      name: string;
      role: SysUserRole;
    },

    lifetimeMinutes: number,

    clientInfo: SessionClientInfo = {},
  ): CreatedAccessToken {
    this.removeExpired();

    const tokenId = randomUUID();

    const secret = randomBytes(32).toString('base64url');

    /*
     * The token Id lets us locate the hashed token efficiently.
     *
     * The secret supplies the cryptographic entropy.
     */
    const rawToken = `${tokenId}.${secret}`;

    const now = Date.now();

    const expiresAt = now + lifetimeMinutes * 60_000;

    const session: StoredAccessToken = {
      tokenId,

      userId: user.id,

      userName: user.name,

      role: user.role,

      createdAt: now,

      lastSeenAt: now,

      expiresAt,

      tokenHash: hash(rawToken),

      ...(clientInfo.clientName
        ? {
            clientName: clientInfo.clientName,
          }
        : {}),

      ...(clientInfo.userAgent
        ? {
            userAgent: clientInfo.userAgent,
          }
        : {}),

      ...(clientInfo.ipAddress
        ? {
            ipAddress: clientInfo.ipAddress,
          }
        : {}),
    };

    this.tokens.set(tokenId, session);

    return {
      token: rawToken,

      tokenId,

      expiresAt,
    };
  }

  /**
   * Validate an opaque Bearer token.
   *
   * Successful validation also updates lastSeenAt so the sessions
   * endpoint can show recent activity.
   */
  validate(rawToken: string): AccessTokenContext | null {
    const tokenId = tokenIdFrom(rawToken);

    if (!tokenId) {
      return null;
    }

    const stored = this.tokens.get(tokenId);

    if (!stored) {
      return null;
    }

    if (stored.expiresAt <= Date.now()) {
      this.tokens.delete(tokenId);

      return null;
    }

    if (!sameHash(stored.tokenHash, hash(rawToken))) {
      return null;
    }

    /*
     * The successful request proves the session is still active.
     */
    stored.lastSeenAt = Date.now();

    return this.publicContext(stored);
  }

  /**
   * Revoke exactly one session represented by its raw Bearer token.
   *
   * Returns true when an active session was actually removed.
   */
  revoke(rawToken: string): boolean {
    const tokenId = tokenIdFrom(rawToken);

    if (!tokenId) {
      return false;
    }

    return this.tokens.delete(tokenId);
  }

  /**
   * Revoke every active session belonging to one user.
   *
   * Returns the number of sessions removed.
   */
  revokeAllForUser(userId: string): number {
    this.removeExpired();

    let revoked = 0;

    for (const [tokenId, session] of this.tokens) {
      if (session.userId !== userId) {
        continue;
      }

      if (this.tokens.delete(tokenId)) {
        revoked++;
      }
    }

    return revoked;
  }

  /**
   * Return all active sessions belonging to a user.
   *
   * The currently used session is marked explicitly.
   */
  listUserSessions(userId: string, currentTokenId?: string): UserSessionInfo[] {
    this.removeExpired();

    const sessions: UserSessionInfo[] = [];

    for (const session of this.tokens.values()) {
      if (session.userId !== userId) {
        continue;
      }

      sessions.push({
        sessionId: session.tokenId,

        current: session.tokenId === currentTokenId,

        createdAt: new Date(session.createdAt).toISOString(),

        lastSeenAt: new Date(session.lastSeenAt).toISOString(),

        expiresAt: new Date(session.expiresAt).toISOString(),

        ...(session.clientName
          ? {
              clientName: session.clientName,
            }
          : {}),

        ...(session.userAgent
          ? {
              userAgent: session.userAgent,
            }
          : {}),

        ...(session.ipAddress
          ? {
              ipAddress: session.ipAddress,
            }
          : {}),
      });
    }

    /*
     * Current session first, then newest sessions.
     */
    sessions.sort((left, right) => {
      if (left.current !== right.current) {
        return left.current ? -1 : 1;
      }

      return Date.parse(right.createdAt) - Date.parse(left.createdAt);
    });

    return sessions;
  }

  /**
   * Remove expired sessions opportunistically.
   *
   * For the current small in-memory implementation this avoids needing
   * a dedicated cleanup timer.
   */
  private removeExpired(): void {
    const now = Date.now();

    for (const [tokenId, session] of this.tokens) {
      if (session.expiresAt <= now) {
        this.tokens.delete(tokenId);
      }
    }
  }

  /**
   * Remove tokenHash before returning session context outside the store.
   */
  private publicContext(session: StoredAccessToken): AccessTokenContext {
    return {
      tokenId: session.tokenId,
      userId: session.userId,
      userName: session.userName,
      role: session.role,
      createdAt: session.createdAt,
      lastSeenAt: session.lastSeenAt,
      expiresAt: session.expiresAt,
      ...(session.clientName !== undefined ? { clientName: session.clientName } : {}),
      ...(session.userAgent !== undefined ? { userAgent: session.userAgent } : {}),
      ...(session.ipAddress !== undefined ? { ipAddress: session.ipAddress } : {}),
    };
  }
}

/**
 * Extract the public token Id.
 */
function tokenIdFrom(rawToken: string): string | null {
  const separator = rawToken.indexOf('.');

  if (separator <= 0) {
    return null;
  }

  return rawToken.slice(0, separator);
}

/**
 * Hash a Bearer token before persistence.
 */
function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * Timing-safe comparison of two SHA-256 hashes.
 */
function sameHash(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'hex');

  const rightBuffer = Buffer.from(right, 'hex');

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

export const accessTokenStore = new AccessTokenStore();
