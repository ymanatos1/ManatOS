import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash, randomBytes } from 'node:crypto';
import { SysBOUserRole, type SysBOUser } from '@manatos/shared';
import { NativeOAuthService } from '../../src/auth/native-oauth-service.js';
import type { SysBOExtAuthProviderService } from '../../src/services/sysbo/external-auth-provider-service.js';
import type { ExternalIdentityService } from '../../src/services/identity/external-identity-service.js';
import type { SysBOUserService } from '../../src/services/sysbo/user-service.js';

const testUser = {
  id: 'user-1',
  name: 'Valid user',
  role: SysBOUserRole.Guest,
  enabled: true,
  emailVerified: true,
} as unknown as SysBOUser;

function harness() {
  const provider = {
    provider: 'google',
    clientId: 'public-id',
    clientSecret: 'server-only-secret',
    scope: ['profile', 'email'],
    callbackPath: '/auth/google/callback',
    label: 'Google',
    icon: 'bi-google',
  };
  const providers = { resolveConfiguredProviders: vi.fn(async () => [provider]) };
  const identities = {
    find: vi.fn(async (): Promise<{ userId: string; enabled: boolean } | null> => ({
      userId: testUser.id,
      enabled: true,
    })),
  };
  const users = { get: vi.fn(async () => testUser) };
  const service = new NativeOAuthService(
    providers as unknown as SysBOExtAuthProviderService,
    identities as unknown as ExternalIdentityService,
    users as unknown as SysBOUserService,
    'https://api.example.test',
  );
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async (url: string) =>
        new Response(
          JSON.stringify(
            url.includes('/token')
              ? { access_token: 'provider-token', token_type: 'Bearer' }
              : { sub: 'google-uid-1' },
          ),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    ),
  );
  return { service, verifier, challenge, providers, identities, users };
}

afterEach(() => vi.unstubAllGlobals());

describe('API Native OAuth broker', () => {
  it('requires canonical proof and a configured provider before starting', async () => {
    const h = harness();
    await expect(h.service.start('google', 'wrong', 'Desktop')).rejects.toMatchObject({
      code: 'NATIVE_OAUTH_INVALID_REQUEST',
    });
    h.providers.resolveConfiguredProviders.mockResolvedValueOnce([]);
    await expect(h.service.start('google', h.challenge, 'Desktop')).rejects.toMatchObject({
      code: 'NATIVE_OAUTH_PROVIDER_UNAVAILABLE',
    });
  });

  it('requires browser code approval and issues an ordinary one-use API session', async () => {
    const h = harness();
    const started = await h.service.start('google', h.challenge, 'Desktop');
    const authorization = new URL(started.authorizationUrl);
    expect(authorization.searchParams.get('redirect_uri')).toBe(
      'https://api.example.test/auth/google/callback',
    );
    expect(started.confirmationCode).toMatch(/^\d{8}$/);
    expect((await h.service.claim(started.attemptId, h.verifier, {})).pending).toBe(true);
    const state = authorization.searchParams.get('state');
    expect(await h.service.callbackResult('google', 'wrong-state', 'code', undefined)).toBeNull();
    const confirmation = await h.service.callbackResult(
      'google',
      state,
      'provider-code',
      undefined,
    );
    expect(confirmation).not.toBeNull();
    expect(await h.service.callbackResult('google', state, 'provider-code', undefined)).toBeNull();
    expect((await h.service.claim(started.attemptId, h.verifier, {})).pending).toBe(true);
    expect(h.service.approve(started.attemptId, confirmation!.approvalToken, '00000000')).toBe(
      false,
    );
    expect(
      h.service.approve(started.attemptId, confirmation!.approvalToken, started.confirmationCode),
    ).toBe(true);
    const results = await Promise.allSettled([
      h.service.claim(started.attemptId, h.verifier, {}),
      h.service.claim(started.attemptId, h.verifier, {}),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const successful = results.find((result) => result.status === 'fulfilled');
    if (!successful || successful.status !== 'fulfilled') throw new Error('Claim did not succeed.');
    expect(successful.value.pending).toBe(false);
    if (!successful.value.pending) {
      expect(successful.value.data.user.id).toBe(testUser.id);
      expect(successful.value.data).toHaveProperty('accessToken');
      expect(successful.value.data.user).not.toHaveProperty('passwordHash');
    }
  });

  it('does not reveal attempt state with invalid proof and forbids claims after cancellation', async () => {
    const h = harness();
    const started = await h.service.start('google', h.challenge, 'Android');
    await expect(
      h.service.claim(started.attemptId, randomBytes(32).toString('base64url'), {}),
    ).rejects.toMatchObject({ code: 'NATIVE_OAUTH_NOT_FOUND' });
    h.service.cancel(started.attemptId, h.verifier);
    await expect(h.service.claim(started.attemptId, h.verifier, {})).rejects.toMatchObject({
      code: 'NATIVE_OAUTH_CANCELLED',
    });
    expect(
      await h.service.callbackResult(
        'google',
        new URL(started.authorizationUrl).searchParams.get('state'),
        'code',
        undefined,
      ),
    ).toBeNull();
  });

  it('rejects a claim if the linked external identity is removed or reassigned', async () => {
    for (const lostLink of [null, { userId: 'different-user', enabled: true }]) {
      const h = harness();
      const started = await h.service.start('google', h.challenge, 'Desktop');
      const confirmation = await h.service.callbackResult(
        'google',
        new URL(started.authorizationUrl).searchParams.get('state'),
        'provider-code',
        undefined,
      );
      expect(confirmation).not.toBeNull();
      expect(
        h.service.approve(started.attemptId, confirmation!.approvalToken, started.confirmationCode),
      ).toBe(true);
      h.identities.find.mockResolvedValueOnce(lostLink);
      await expect(h.service.claim(started.attemptId, h.verifier, {})).rejects.toMatchObject({
        code: 'NATIVE_OAUTH_FAILED',
      });
    }
  });

  it('keeps cancellation terminal when a provider callback fails in flight', async () => {
    const h = harness();
    const started = await h.service.start('google', h.challenge, 'Desktop');
    h.providers.resolveConfiguredProviders.mockRejectedValueOnce(new Error('Provider offline'));
    const callback = h.service.callbackResult(
      'google',
      new URL(started.authorizationUrl).searchParams.get('state'),
      'provider-code',
      undefined,
    );
    h.service.cancel(started.attemptId, h.verifier);
    expect(await callback).toBeNull();
    await expect(h.service.claim(started.attemptId, h.verifier, {})).rejects.toMatchObject({
      code: 'NATIVE_OAUTH_CANCELLED',
    });
  });
});
