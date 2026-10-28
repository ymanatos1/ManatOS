import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

import { validatePassword } from '@manatos/shared';

import { internalAuditActor } from '../audit/audit-service.js';
import type { IEmailService } from '../email/email-service.js';
import type { SysBOUserService } from '../services/sysbo/user-service.js';

/** API-authoritative, single-instance recovery state. UI hosts never create tokens. */
export const PASSWORD_RECOVERY_TTL_MS = 30 * 60 * 1000;
const MAX_OUTSTANDING = 2000;
const MAX_TOKEN_LENGTH = 200;

interface RecoveryTicket {
  userId: string;
  digest: Buffer;
  expiresAt: number;
}

export class PasswordRecoveryService {
  private readonly tickets = new Map<string, RecoveryTicket>();

  constructor(
    private readonly users: SysBOUserService,
    private readonly email: IEmailService,
    private readonly now: () => number = Date.now,
  ) {}

  private cleanup(): void {
    for (const [id, ticket] of this.tickets) {
      if (ticket.expiresAt < this.now()) this.tickets.delete(id);
    }
    while (this.tickets.size > MAX_OUTSTANDING) {
      const first = this.tickets.keys().next().value;
      if (!first) break;
      this.tickets.delete(first);
    }
  }

  private lookup(token: string): { id: string; ticket: RecoveryTicket } | null {
    if (!token || token.length > MAX_TOKEN_LENGTH) return null;
    const [id, secret, extra] = token.split('.');
    if (!id || !secret || extra || secret.length !== 43) return null;
    const ticket = this.tickets.get(id);
    if (!ticket || ticket.expiresAt < this.now()) return null;
    const digest = createHash('sha256').update(secret).digest();
    if (!timingSafeEqual(digest, ticket.digest)) return null;
    return { id, ticket };
  }

  /** Only accepts an origin from a trusted, API-key-authenticated UI host. */
  async request(identity: string, uiOrigin: string): Promise<void> {
    this.cleanup();
    const origin = new URL(uiOrigin);
    if (
      !['http:', 'https:'].includes(origin.protocol) ||
      origin.username ||
      origin.password ||
      origin.pathname !== '/' ||
      origin.search ||
      origin.hash ||
      (origin.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(origin.hostname))
    )
      throw new Error('Invalid trusted UI recovery origin.');

    const value = identity.trim();
    if (!value || value.length > 320) return;
    const user = await this.users.lookupByIdentity(value);
    if (!user || !user.enabled || !user.email) return;

    const id = randomUUID();
    const secret = randomBytes(32).toString('base64url');
    const url = new URL('/auth/password/reset', origin);
    url.searchParams.set('token', `${id}.${secret}`);
    // Send before publishing a token: disabled SMTP leaves no usable recovery credential.
    await this.email.sendPasswordResetEmail(user, url.toString());
    for (const [existingId, ticket] of this.tickets) {
      if (ticket.userId === user.id) this.tickets.delete(existingId);
    }
    this.tickets.set(id, {
      userId: user.id,
      digest: createHash('sha256').update(secret).digest(),
      expiresAt: this.now() + PASSWORD_RECOVERY_TTL_MS,
    });
  }

  inspect(token: string): boolean {
    this.cleanup();
    return this.lookup(token) !== null;
  }

  async complete(token: string, password: string): Promise<boolean> {
    const failures = validatePassword(password);
    if (failures.length) throw new Error(failures.join(' '));
    const match = this.lookup(token);
    if (!match) return false;
    // Reserve the credential before any await. A second simultaneous request cannot use it.
    this.tickets.delete(match.id);
    await this.users.setPassword(match.ticket.userId, password, internalAuditActor());
    for (const [id, ticket] of this.tickets) {
      if (ticket.userId === match.ticket.userId) this.tickets.delete(id);
    }
    const user = await this.users.get(match.ticket.userId);
    if (user) {
      // Email notification must not roll back an already committed password change.
      try {
        await this.email.sendPasswordChangedEmail(user);
      } catch {
        /* best effort */
      }
    }
    return true;
  }
}
