import { randomBytes } from 'node:crypto';
import { credentialId, makeCredential, matchesCredential } from './credential.js';

/** Server-only data: never serialize this type to a browser. */
export interface BrowserAuthSession {
  readonly id: string;
  readonly csrfToken: string;
  readonly expiresAt: number;
  readonly userId: string | null;
  readonly apiAccessToken: string | null;
}

type StoredSession = {
  readonly hash: Buffer;
  readonly session: BrowserAuthSession;
};

export interface IssuedBrowserSession {
  /** Opaque value for an HttpOnly cookie; never response JSON or CTX. */
  readonly cookieValue: string;
  readonly expiresAt: number;
}

/** In-memory browser session authority; a UI-server restart signs everyone out. */
export class BrowserAuthSessions {
  private readonly sessions = new Map<string, StoredSession>();
  private readonly listPageSizes = new Map<string, number>();

  constructor(private readonly now: () => number = Date.now) {}

  createAnonymous(lifetimeMs = 30 * 60_000): IssuedBrowserSession {
    return this.create(null, null, lifetimeMs);
  }

  /** Login rotates the cookie and limits lifetime to the underlying API token. */
  establish(
    previousCookie: string | null,
    userId: string,
    apiAccessToken: string,
    apiExpiresAt: number,
    lifetimeMs = 30 * 60_000,
  ): IssuedBrowserSession {
    if (!userId || !apiAccessToken || apiExpiresAt <= this.now()) {
      throw new Error('A valid API session is required.');
    }

    const issued = this.create(
      userId,
      apiAccessToken,
      Math.min(lifetimeMs, apiExpiresAt - this.now()),
    );

    if (previousCookie) this.revoke(previousCookie);

    return issued;
  }

  read(cookieValue: string): BrowserAuthSession | null {
    const id = credentialId(cookieValue);
    if (!id) return null;

    const record = this.sessions.get(id);

    if (!record || !matchesCredential(record.hash, cookieValue)) return null;

    if (record.session.expiresAt <= this.now()) {
      this.sessions.delete(id);
      return null;
    }

    return record.session;
  }

  /** Per UI-server browser session, matching EJS0 without browser storage. */
  pageSize(cookieValue: string): number | null {
    const session = this.read(cookieValue);
    return session ? (this.listPageSizes.get(session.id) ?? null) : null;
  }

  rememberPageSize(cookieValue: string, size: number): void {
    const session = this.read(cookieValue);
    if (session && Number.isSafeInteger(size) && size >= 1 && size <= 100)
      this.listPageSizes.set(session.id, size);
  }

  revoke(cookieValue: string): boolean {
    const session = this.read(cookieValue);
    if (!session) return false;
    this.listPageSizes.delete(session.id);
    return this.sessions.delete(session.id);
  }

  prune(): void {
    for (const [id, record] of this.sessions) {
      if (record.session.expiresAt <= this.now()) {
        this.listPageSizes.delete(id);
        this.sessions.delete(id);
      }
    }
  }

  private create(
    userId: string | null,
    token: string | null,
    lifetimeMs: number,
  ): IssuedBrowserSession {
    if (!Number.isSafeInteger(lifetimeMs) || lifetimeMs <= 0) {
      throw new Error('Invalid session lifetime.');
    }

    this.prune();

    const credential = makeCredential();
    const expiresAt = this.now() + lifetimeMs;

    this.sessions.set(credential.id, {
      hash: credential.digest,
      session: {
        id: credential.id,
        csrfToken: randomBytes(32).toString('base64url'),
        expiresAt,
        userId,
        apiAccessToken: token,
      },
    });

    return { cookieValue: credential.value, expiresAt };
  }
}
