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

  create(userId: string, purpose: Purpose, minutes = 30) {
    const raw = randomBytes(32).toString('base64url');
    const id = randomUUID();

    this.tokens.set(id, {
      id,
      userId,
      purpose,
      tokenHash: hash(raw),
      expiresAt: Date.now() + minutes * 60_000,
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
    const [id, raw] = compound.split('.', 2);

    if (!id || !raw) return false;

    const token = this.tokens.get(id);

    return Boolean(
      token
      && token.purpose === purpose
      && token.tokenHash === hash(raw)
      && !token.usedAt
      && !token.invalidatedAt
      && token.expiresAt >= Date.now(),
    );
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

    if (token.usedAt || token.expiresAt < Date.now()) {
      return { status: 'invalid' };
    }

    token.usedAt = Date.now();

    return {
      status: 'valid',
      userId: token.userId,
    };
  }

  /**
   * Invalidate every still-live email-verification link for this account
   * while retaining enough transient provenance to explain an old click.
   */
  invalidateEmailVerificationTokens(
    userId: string,
    source: EmailVerificationSource,
  ): void {
    for (const token of this.tokens.values()) {
      if (
        token.userId === userId &&
        token.purpose === 'verify-email' &&
        !token.usedAt &&
        !token.invalidatedAt
      ) {
        token.invalidatedAt = Date.now();
        token.invalidatedVerificationSource = source;
      }
    }
  }
}

const hash = (value: string) => createHash('sha256').update(value).digest('hex');

export const securityTokenStore = new SecurityTokenStore();
