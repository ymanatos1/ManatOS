import { createHash, randomBytes } from 'node:crypto';
import { credentialId, makeCredential, matchesCredential } from './credential.js';

export type OAuthIntent = 'signin' | 'link';

export interface OAuthStart {
  readonly state: string;
  readonly codeChallenge: string;
  readonly nonce: string;
}

export interface OAuthCompletion {
  readonly codeVerifier: string;
  readonly nonce: string;
  readonly intent: OAuthIntent;
}

type OAuthChallenge = OAuthCompletion & {
  hash: Buffer;
  sessionId: string;
  provider: string;
  expiresAt: number;
};

/** Server-only, session-bound, single-use OAuth/OIDC state with PKCE. */
export class OAuthStateStore {
  private readonly pending = new Map<string, OAuthChallenge>();

  constructor(private readonly now: () => number = Date.now) {}

  start(sessionId: string, provider: string, intent: OAuthIntent = 'signin'): OAuthStart {
    if (!sessionId || !provider) {
      throw new Error('OAuth session and provider are required.');
    }

    this.prune();

    const credential = makeCredential();
    const codeVerifier = randomBytes(32).toString('base64url');
    const nonce = randomBytes(32).toString('base64url');

    const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');

    this.pending.set(credential.id, {
      hash: credential.digest,
      sessionId,
      provider,
      expiresAt: this.now() + 10 * 60_000,
      codeVerifier,
      nonce,
      intent,
    });

    return {
      state: credential.value,
      codeChallenge,
      nonce,
    };
  }

  /** A mismatched callback cannot consume a valid challenge. */
  consume(sessionId: string, provider: string, state: string): OAuthCompletion | null {
    const id = credentialId(state);
    if (!id) return null;

    const challenge = this.pending.get(id);

    if (
      !challenge ||
      challenge.sessionId !== sessionId ||
      challenge.provider !== provider ||
      challenge.expiresAt <= this.now() ||
      !matchesCredential(challenge.hash, state)
    ) {
      return null;
    }

    this.pending.delete(id);

    return {
      codeVerifier: challenge.codeVerifier,
      nonce: challenge.nonce,
      intent: challenge.intent,
    };
  }

  revokeSession(sessionId: string): void {
    for (const [id, challenge] of this.pending) {
      if (challenge.sessionId === sessionId) {
        this.pending.delete(id);
      }
    }
  }

  prune(): void {
    for (const [id, challenge] of this.pending) {
      if (challenge.expiresAt <= this.now()) {
        this.pending.delete(id);
      }
    }
  }
}
