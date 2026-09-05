import { createHash, randomBytes, randomUUID } from 'node:crypto';

import type { EmailVerificationSource } from '@manatos/shared';

type Purpose = 'verify-email' | 'reset-password';

interface Token {
  id: string;
  userId: string;
  purpose: Purpose;
  tokenHash: string;
  expiresAt: number;
  usedAt?: number;
  invalidatedAt?: number;
  invalidatedVerificationSource?: EmailVerificationSource;
  subjectLabel?: string;
}

export interface UsableTokenInfo {
  userId: string;
  subjectLabel?: string;
}

export type TokenConsumeResult =
  | {
      status: 'valid';
      userId: string;
    }
  | {
      status: 'already-verified';
      userId: string;
      source: EmailVerificationSource;
    }
  | {
      status: 'invalid';
    };

/** Transient verification/reset tokens. Never written to business JSON. */
export class SecurityTokenStore {
  private readonly tokens = new Map<string, Token>();

  constructor(private readonly now: () => number = Date.now) {}

  create(userId: string, purpose: Purpose, minutes = 30, options: { subjectLabel?: string } = {}) {
    if (purpose === 'reset-password') {
      // A newly requested recovery link supersedes every older outstanding
      // reset link for the same account. Only one recovery credential may be
      // usable for a user at any point in time.
      this.invalidatePasswordResetTokens(userId);
    }
    const raw = randomBytes(32).toString('base64url');
    const id = randomUUID();

    this.tokens.set(id, {
      id,
      userId,
      purpose,
      tokenHash: hash(raw),
      expiresAt: this.now() + minutes * 60_000,
      ...(options.subjectLabel ? { subjectLabel: options.subjectLabel } : {}),
    });

    return `${id}.${raw}`;
  }

  consume(compound: string, purpose: Purpose) {
    const result = this.consumeDetailed(compound, purpose);

    return result.status === 'valid' ? result.userId : null;
  }

  /**
   * Check whether a one-time token is currently usable without consuming it.
   *
   * This is used only to choose the appropriate recovery presentation. The
   * mutating POST still consumes the token atomically before changing data.
   */
  isUsable(compound: string, purpose: Purpose): boolean {
    return this.inspectUsable(compound, purpose) !== null;
  }

  /**
   * Inspect a valid token without consuming it. Only non-sensitive metadata
   * required for presentation is returned; the raw token is never stored.
   */
  inspectUsable(compound: string, purpose: Purpose): UsableTokenInfo | null {
    const [id, raw] = compound.split('.', 2);

    if (!id || !raw) return null;

    const token = this.tokens.get(id);

    if (
      !token ||
      token.purpose !== purpose ||
      token.tokenHash !== hash(raw) ||
      token.usedAt ||
      token.invalidatedAt ||
      token.expiresAt < this.now()
    ) {
      return null;
    }

    return {
      userId: token.userId,
      ...(token.subjectLabel ? { subjectLabel: token.subjectLabel } : {}),
    };
  }

  /**
   * Consume a token while preserving a friendly outcome for verification
   * links that became redundant because an external provider verified the
   * same email first.
   */
  consumeDetailed(compound: string, purpose: Purpose): TokenConsumeResult {
    const [id, raw] = compound.split('.', 2);

    if (!id || !raw) {
      return { status: 'invalid' };
    }

    const token = this.tokens.get(id);

    if (!token || token.purpose !== purpose || token.tokenHash !== hash(raw)) {
      return { status: 'invalid' };
    }

    if (token.invalidatedAt && token.invalidatedVerificationSource) {
      return {
        status: 'already-verified',
        userId: token.userId,
        source: token.invalidatedVerificationSource,
      };
    }

    // Reset-token supersession uses generic invalidation without an email
    // verification source. It must be enforced by the authoritative consume
    // path as well as by the non-consuming presentation check.
    if (token.invalidatedAt) {
      return { status: 'invalid' };
    }

    if (token.usedAt || token.expiresAt < this.now()) {
      return { status: 'invalid' };
    }

    token.usedAt = this.now();

    return {
      status: 'valid',
      userId: token.userId,
    };
  }

  /**
   * Revoke every outstanding password-recovery link for a user.
   *
   * This is called both when a newer link is issued and after a password
   * reset completes, so stale emails can never remain valid credentials.
   */
  invalidatePasswordResetTokens(userId: string): void {
    for (const token of this.tokens.values()) {
      if (
        token.userId === userId &&
        token.purpose === 'reset-password' &&
        !token.usedAt &&
        !token.invalidatedAt
      ) {
        token.invalidatedAt = this.now();
      }
    }
  }

  /**
   * Invalidate every still-live email-verification link for this account
   * while retaining enough transient provenance to explain an old click.
   */
  invalidateEmailVerificationTokens(userId: string, source: EmailVerificationSource): void {
    for (const token of this.tokens.values()) {
      if (
        token.userId === userId &&
        token.purpose === 'verify-email' &&
        !token.usedAt &&
        !token.invalidatedAt
      ) {
        token.invalidatedAt = this.now();
        token.invalidatedVerificationSource = source;
      }
    }
  }
}

const hash = (value: string) => createHash('sha256').update(value).digest('hex');

export const securityTokenStore = new SecurityTokenStore();
