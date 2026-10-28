import { credentialId, makeCredential, matchesCredential } from './credential.js';

type Purpose = 'verify-email' | 'reset-password';

type TokenRecord = {
  userId: string;
  purpose: Purpose;
  hash: Buffer;
  expiresAt: number;
  used: boolean;
  invalidated: boolean;
  verifiedBy?: string;
};

export type AuthTokenResult =
  | { status: 'valid'; userId: string }
  | { status: 'already-verified'; userId: string; source: string }
  | { status: 'invalid' };

/** Single-process, hashed, expiring, one-use email and recovery credentials. */
export class AuthActionTokens {
  private readonly records = new Map<string, TokenRecord>();

  constructor(private readonly now: () => number = Date.now) {}

  issue(userId: string, purpose: Purpose): string {
    if (!userId.trim()) throw new Error('A user ID is required.');

    this.prune();

    if (purpose === 'reset-password') this.invalidate(userId, purpose);

    const { id, value, digest } = makeCredential();

    this.records.set(id, {
      userId,
      purpose,
      hash: digest,
      expiresAt: this.now() + (purpose === 'verify-email' ? 24 * 60 : 30) * 60_000,
      used: false,
      invalidated: false,
    });

    return value;
  }

  inspect(value: string, purpose: Purpose): AuthTokenResult {
    const id = credentialId(value);
    const record = id ? this.records.get(id) : undefined;

    if (!record || record.purpose !== purpose || !matchesCredential(record.hash, value)) {
      return { status: 'invalid' };
    }

    if (record.used || record.expiresAt <= this.now()) {
      return { status: 'invalid' };
    }

    if (record.invalidated) {
      return purpose === 'verify-email' && record.verifiedBy
        ? { status: 'already-verified', userId: record.userId, source: record.verifiedBy }
        : { status: 'invalid' };
    }

    return { status: 'valid', userId: record.userId };
  }

  /** Consume synchronously before a privileged side effect; never reusable. */
  consume(value: string, purpose: Purpose): AuthTokenResult {
    const result = this.inspect(value, purpose);

    if (result.status !== 'valid') return result;

    const id = credentialId(value);
    if (!id) return { status: 'invalid' };

    const record = this.records.get(id);
    if (!record || record.used) return { status: 'invalid' };

    record.used = true;
    return result;
  }

  invalidate(userId: string, purpose: Purpose, verifiedBy?: string): void {
    for (const record of this.records.values()) {
      if (record.userId !== userId || record.purpose !== purpose || record.used) continue;

      record.invalidated = true;

      if (purpose === 'verify-email' && verifiedBy) {
        record.verifiedBy = verifiedBy;
      }
    }
  }

  prune(): void {
    const now = this.now();

    for (const [id, record] of this.records) {
      if (record.expiresAt <= now || record.used) {
        this.records.delete(id);
      }
    }
  }
}
