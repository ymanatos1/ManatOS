import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { AppError, type ExternalProviderKey, type SysBOUser } from '@manatos/shared';
import type {
  SysBOExtAuthProviderService,
  RuntimeExternalAuthProvider,
} from '../services/sysbo/external-auth-provider-service.js';
import type { ExternalIdentityService } from '../services/identity/external-identity-service.js';
import type { SysBOUserService } from '../services/sysbo/user-service.js';
import { accessTokenStore, type SessionClientInfo } from './access-token-store.js';
import { nativeAuthorizationUrl, nativeProviderIdentity } from './native-oauth-provider.js';
import { config } from '../config.js';

/** One API process owns the state and all transitions. No background workers. */
export const NATIVE_OAUTH_POLICY = {
  attemptTtlMs: 10 * 60_000,
  retentionMs: 5 * 60_000,
  maximumAttempts: 2000,
  pollAfterSeconds: 2,
  confirmationAttempts: 5,
  maximumClientName: 80,
} as const;

type AttemptStatus =
  | 'pending'
  | 'processing'
  | 'awaitingApproval'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'expired'
  | 'redeemed';
interface NativeAttempt {
  id: string;
  provider: ExternalProviderKey;
  challenge: Buffer;
  createdAt: number;
  expiresAt: number;
  status: AttemptStatus;
  stateDigest: string;
  providerVerifier: string;
  confirmationDigest: Buffer;
  approvalTokenDigest?: Buffer;
  approvalFailures: number;
  userId?: string;
  providerSubject?: string;
  clientName?: string;
  completedAt?: number;
}

const digest = (value: string): Buffer => createHash('sha256').update(value, 'utf8').digest();
const hexDigest = (value: string): string => digest(value).toString('hex');
const same = (left: Buffer, right: Buffer): boolean =>
  left.byteLength === right.byteLength && timingSafeEqual(left, right);
const randomSecret = () => randomBytes(32).toString('base64url');
const validProof = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{43,128}$/.test(value);
const validChallenge = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[A-Za-z0-9_-]{43}$/.test(value) &&
  Buffer.from(value, 'base64url').byteLength === 32 &&
  Buffer.from(value, 'base64url').toString('base64url') === value;
const rejection = (
  code: string,
  message: string,
  statusMessage = 'Native authentication could not be completed.',
) => new AppError(code, message, statusMessage, false);

export class NativeOAuthService {
  private readonly records = new Map<string, NativeAttempt>();
  private readonly pendingStates = new Map<string, string>();

  constructor(
    private readonly providers: SysBOExtAuthProviderService,
    private readonly identities: ExternalIdentityService,
    private readonly users: SysBOUserService,
    private readonly publicOrigin: string,
  ) {}

  private sweep(): void {
    const now = Date.now();
    for (const [id, attempt] of this.records) {
      if (
        attempt.expiresAt <= now &&
        !['expired', 'redeemed', 'cancelled', 'failed'].includes(attempt.status)
      ) {
        attempt.status = 'expired';
        attempt.completedAt = now;
        attempt.providerVerifier = '';
        delete attempt.approvalTokenDigest;
        this.pendingStates.delete(attempt.stateDigest);
      }
      if (attempt.completedAt && now - attempt.completedAt >= NATIVE_OAUTH_POLICY.retentionMs) {
        this.records.delete(id);
        this.pendingStates.delete(attempt.stateDigest);
      }
    }
  }

  private async configured(provider: ExternalProviderKey): Promise<RuntimeExternalAuthProvider> {
    const all = await this.providers.resolveConfiguredProviders();
    const found = all.find((item) => item.provider === provider);
    if (!found)
      throw rejection(
        'NATIVE_OAUTH_PROVIDER_UNAVAILABLE',
        'Native OAuth provider is not enabled or verified.',
      );
    return found;
  }

  private callback(provider: ExternalProviderKey): string {
    // This is API-owned; UI-host /auth/oauth/... callback paths remain unchanged.
    return `${this.publicOrigin}/auth/${provider}/callback`;
  }

  async start(provider: ExternalProviderKey, challenge: unknown, clientName: unknown) {
    this.sweep();
    if (!validChallenge(challenge))
      throw rejection('NATIVE_OAUTH_INVALID_REQUEST', 'Invalid native proof challenge.');
    if (
      clientName !== undefined &&
      (typeof clientName !== 'string' ||
        clientName.length > NATIVE_OAUTH_POLICY.maximumClientName ||
        /[\p{Cc}\p{Cf}\p{Cs}]/u.test(clientName))
    )
      throw rejection('NATIVE_OAUTH_INVALID_REQUEST', 'Invalid native client name.');
    if (this.records.size >= NATIVE_OAUTH_POLICY.maximumAttempts)
      throw rejection(
        'NATIVE_OAUTH_BUSY',
        'Native authentication capacity exceeded.',
        'Authentication is temporarily unavailable.',
      );
    const selected = await this.configured(provider);
    const id = randomUUID();
    const state = randomSecret();
    const providerVerifier = randomSecret();
    const providerChallenge = createHash('sha256').update(providerVerifier).digest('base64url');
    // This is a human-readable pairing check, not an authentication secret.
    const confirmationCode = String(randomBytes(4).readUInt32BE(0) % 100_000_000).padStart(8, '0');
    const now = Date.now();
    const attempt: NativeAttempt = {
      id,
      provider,
      challenge: Buffer.from(challenge, 'base64url'),
      createdAt: now,
      expiresAt: now + NATIVE_OAUTH_POLICY.attemptTtlMs,
      status: 'pending',
      stateDigest: hexDigest(state),
      providerVerifier,
      confirmationDigest: digest(confirmationCode),
      approvalFailures: 0,
      ...(typeof clientName === 'string' && clientName.trim()
        ? { clientName: clientName.trim() }
        : {}),
    };
    this.records.set(id, attempt);
    this.pendingStates.set(attempt.stateDigest, id);
    return {
      attemptId: id,
      authorizationUrl: nativeAuthorizationUrl(
        selected,
        this.callback(provider),
        state,
        providerChallenge,
        randomSecret(),
      ),
      expiresAt: new Date(attempt.expiresAt).toISOString(),
      pollAfterSeconds: NATIVE_OAUTH_POLICY.pollAfterSeconds,
      confirmationCode,
    };
  }

  private verified(id: string, verifier: unknown): NativeAttempt {
    this.sweep();
    const record = this.records.get(id);
    // Invalid IDs/proofs are indistinguishable. Never reveal status first.
    if (!record || !validProof(verifier) || !same(record.challenge, digest(verifier)))
      throw rejection('NATIVE_OAUTH_NOT_FOUND', 'Unknown native attempt or invalid verifier.');
    return record;
  }

  async claim(id: string, verifier: unknown, clientInfo: SessionClientInfo) {
    const attempt = this.verified(id, verifier);
    if (['pending', 'processing', 'awaitingApproval'].includes(attempt.status)) {
      return {
        pending: true as const,
        data: {
          status: 'pending',
          expiresAt: new Date(attempt.expiresAt).toISOString(),
          pollAfterSeconds: NATIVE_OAUTH_POLICY.pollAfterSeconds,
        },
      };
    }
    if (attempt.status !== 'completed' || !attempt.userId) this.throwTerminal(attempt.status);
    const user = await this.users.get(attempt.userId);
    // Repository calls can interleave with Cancel, expiry, or another Claim.
    // Preserve an existing terminal result rather than overwriting it.
    if (!user?.enabled || !user.emailVerified)
      this.failClaim(attempt, 'Linked user is no longer eligible for sign-in.');
    try {
      await this.configured(attempt.provider);
    } catch (error) {
      if (attempt.status !== 'completed') this.throwTerminal(attempt.status);
      attempt.status = 'failed';
      attempt.completedAt = Date.now();
      throw error;
    }
    // Revalidate the SAME external subject -> user link immediately before
    // redemption. Unlinking, disabling, or reassigning the identity while the
    // browser is open must never issue a session for its former user.
    const link = attempt.providerSubject
      ? await this.identities.find(attempt.provider, attempt.providerSubject)
      : null;
    if (!link?.enabled || link.userId !== attempt.userId)
      this.failClaim(attempt, 'External identity is no longer linked to this user.');
    if (attempt.status !== 'completed' || attempt.expiresAt <= Date.now()) {
      if (attempt.status === 'completed' && attempt.expiresAt <= Date.now()) {
        attempt.status = 'expired';
        attempt.completedAt = Date.now();
      }
      this.throwTerminal(attempt.status);
    }
    // Single-threaded, synchronous critical section: consume and issue together.
    attempt.status = 'redeemed';
    attempt.completedAt = Date.now();
    try {
      const token = accessTokenStore.create(user, config.API_ACCESS_TOKEN_MINUTES, {
        ...clientInfo,
        ...(attempt.clientName ? { clientName: attempt.clientName } : {}),
      });
      return {
        pending: false as const,
        data: {
          accessToken: token.token,
          tokenType: 'Bearer' as const,
          sessionId: token.tokenId,
          expiresInSeconds: config.API_ACCESS_TOKEN_MINUTES * 60,
          expiresAt: new Date(token.expiresAt).toISOString(),
          user: this.publicUser(user),
        },
      };
    } catch {
      attempt.status = 'failed';
      throw rejection('NATIVE_OAUTH_FAILED', 'Could not issue API session.');
    }
  }

  cancel(id: string, verifier: unknown): void {
    const attempt = this.verified(id, verifier);
    if (attempt.status === 'redeemed') this.throwTerminal(attempt.status);
    if (!['cancelled', 'expired'].includes(attempt.status)) {
      attempt.status = 'cancelled';
      attempt.completedAt = Date.now();
      attempt.providerVerifier = '';
      delete attempt.approvalTokenDigest;
      this.pendingStates.delete(attempt.stateDigest);
    }
  }

  /** One-use provider callback. No browser session or API token is created here. */
  async callbackResult(
    provider: ExternalProviderKey,
    state: unknown,
    code: unknown,
    error: unknown,
  ) {
    this.sweep();
    const stateDigest = typeof state === 'string' && state.length <= 512 ? hexDigest(state) : '';
    const id = this.pendingStates.get(stateDigest);
    const attempt = id ? this.records.get(id) : undefined;
    if (!attempt || attempt.provider !== provider || attempt.status !== 'pending') return null;
    this.pendingStates.delete(stateDigest);
    attempt.status = 'processing';
    if (error !== undefined || typeof code !== 'string' || !code || code.length > 4096) {
      attempt.status = 'failed';
      attempt.completedAt = Date.now();
      return null;
    }
    try {
      const selected = await this.configured(provider);
      const identity = await nativeProviderIdentity(
        selected,
        this.callback(provider),
        code,
        attempt.providerVerifier,
      );
      const link = await this.identities.find(identity.provider, identity.subject);
      if (!link?.enabled) throw new Error('External identity is not linked.');
      const user = await this.users.get(link.userId);
      if (!user?.enabled || !user.emailVerified) throw new Error('Linked user is not eligible.');
      if (attempt.status !== 'processing' || attempt.expiresAt <= Date.now()) return null;
      const approvalToken = randomSecret();
      attempt.approvalTokenDigest = digest(approvalToken);
      attempt.userId = user.id;
      attempt.providerSubject = identity.subject;
      attempt.status = 'awaitingApproval';
      return {
        id: attempt.id,
        approvalToken,
        clientName: attempt.clientName ?? 'ManatOS native client',
      };
    } catch {
      // Cancellation or expiry can happen while provider HTTP and repository
      // requests are in flight; terminal states must remain terminal.
      if (attempt.status === 'processing') {
        attempt.status = 'failed';
        attempt.completedAt = Date.now();
      }
      return null;
    } finally {
      // PKCE secret is no longer needed after an exchange attempt.
      attempt.providerVerifier = '';
    }
  }

  approve(id: string, approvalToken: unknown, confirmationCode: unknown): boolean {
    this.sweep();
    const attempt = this.records.get(id);
    if (
      !attempt ||
      attempt.status !== 'awaitingApproval' ||
      typeof approvalToken !== 'string' ||
      !validProof(approvalToken) ||
      !attempt.approvalTokenDigest ||
      !same(digest(approvalToken), attempt.approvalTokenDigest)
    )
      return false;
    attempt.approvalFailures++;
    if (attempt.approvalFailures > NATIVE_OAUTH_POLICY.confirmationAttempts) {
      attempt.status = 'failed';
      attempt.completedAt = Date.now();
      return false;
    }
    if (
      typeof confirmationCode !== 'string' ||
      !/^\d{8}$/.test(confirmationCode) ||
      !same(digest(confirmationCode), attempt.confirmationDigest)
    )
      return false;
    attempt.status = 'completed';
    delete attempt.approvalTokenDigest;
    return true;
  }

  private failClaim(attempt: NativeAttempt, message: string): never {
    if (attempt.status !== 'completed') this.throwTerminal(attempt.status);
    if (attempt.expiresAt <= Date.now()) {
      attempt.status = 'expired';
      attempt.completedAt = Date.now();
      this.throwTerminal(attempt.status);
    }
    attempt.status = 'failed';
    attempt.completedAt = Date.now();
    throw rejection('NATIVE_OAUTH_FAILED', message);
  }

  private throwTerminal(status: AttemptStatus): never {
    const codes: Partial<Record<AttemptStatus, string>> = {
      expired: 'NATIVE_OAUTH_EXPIRED',
      cancelled: 'NATIVE_OAUTH_CANCELLED',
      redeemed: 'NATIVE_OAUTH_REDEEMED',
      failed: 'NATIVE_OAUTH_FAILED',
    };
    throw rejection(
      codes[status] ?? 'NATIVE_OAUTH_FAILED',
      `Native authentication attempt is ${status}.`,
    );
  }

  private publicUser(user: SysBOUser) {
    const { passwordHash, ...safe } = user;
    return { ...safe, hasPassword: Boolean(passwordHash) };
  }
}
