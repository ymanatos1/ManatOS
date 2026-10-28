import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

import { AuthenticationError } from '@manatos/shared';
import { signAuthClientIp } from '@manatos/shared/node';

import { config } from '../../src/config.js';
import { createTestApi } from '../support/test-helpers.js';

/**
 * HTTP contract tests for the publicly accessible API.
 *
 * Each test creates a fresh API/router/limiter and isolated test datastore.
 * No production database, web server, or real user credentials are required.
 * Mocking password verification makes brute-force tests fast and deterministic.
 */
describe('API public authentication rate limits', () => {
  const secret = 'test-only-trusted-ng1-delegation-secret-12345';
  const originalSecret = config.AUTH_DELEGATION_SECRET;
  let context: Awaited<ReturnType<typeof createTestApi>>;

  beforeEach(async () => {
    config.AUTH_DELEGATION_SECRET = secret;
    context = await createTestApi();
  });

  afterEach(() => {
    if (originalSecret === undefined) delete config.AUTH_DELEGATION_SECRET;
    else config.AUTH_DELEGATION_SECRET = originalSecret;
    vi.restoreAllMocks();
  });

  function incorrectCredentials() {
    return vi
      .spyOn(context.services.users, 'verifyLocalCredentials')
      .mockRejectedValue(new AuthenticationError());
  }

  function login(identity: string, headers: Record<string, string> = {}) {
    let call = request(context.app).post('/api/v1/auth/login');
    for (const [name, value] of Object.entries(headers)) call = call.set(name, value);
    return call.send({ identity, password: 'incorrect' });
  }

  function delegated(identity: string, ip: string) {
    const body = { identity, password: 'incorrect' };
    return signAuthClientIp(secret, ip, 'POST', '/api/v1/auth/login', body);
  }

  it('returns 401 for five incorrect passwords and 429 with Retry-After for the sixth', async () => {
    const verify = incorrectCredentials();

    for (let i = 0; i < 5; i++) {
      expect((await login('target@example.test')).status).toBe(401);
    }

    const blocked = await login('target@example.test');
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('AUTH_RATE_LIMITED');
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    expect(verify).toHaveBeenCalledTimes(5);
  });

  it('limits password spraying to 30 total requests per client IP', async () => {
    const verify = incorrectCredentials();
    for (let i = 0; i < 30; i++) {
      expect((await login(`distinct-${i}@example.test`)).status).toBe(401);
    }
    const blocked = await login('thirty-first@example.test');
    expect(blocked.status).toBe(429);
    expect(verify).toHaveBeenCalledTimes(30);
  });

  it('uses the verified client IP for NG1 calls, but rejects forged delegation', async () => {
    incorrectCredentials();

    for (let i = 0; i < 5; i++) {
      expect(
        (await login('same@example.test', delegated('same@example.test', '198.51.100.11'))).status,
      ).toBe(401);
    }
    expect(
      (await login('same@example.test', delegated('same@example.test', '198.51.100.11'))).status,
    ).toBe(429);

    // A different real browser behind that same UI host must get its own allowance.
    expect(
      (await login('same@example.test', delegated('same@example.test', '198.51.100.12'))).status,
    ).toBe(401);

    const forged = {
      ...delegated('same@example.test', '198.51.100.12'),
      'x-manatos-auth-client-ip': '198.51.100.99',
    };
    const rejected = await login('same@example.test', forged);
    expect(rejected.status).toBe(403);
    expect(rejected.body.error.code).toBe('FORBIDDEN');
  });

  it('does not trust arbitrary X-Forwarded-For from direct public clients', async () => {
    const verify = incorrectCredentials();
    for (let i = 0; i < 5; i++) {
      const response = await login('target@example.test', {
        'x-forwarded-for': `198.51.100.${i + 1}`,
      });
      expect(response.status).toBe(401);
    }
    expect(
      (await login('target@example.test', { 'x-forwarded-for': '198.51.100.99' })).status,
    ).toBe(429);
    expect(verify).toHaveBeenCalledTimes(5);
  });

  it('reserves concurrent failed credential checks before any async verification finishes', async () => {
    let entered = 0;
    let signalReady: (() => void) | undefined;
    const ready = new Promise<void>((resolve) => {
      signalReady = resolve;
    });
    let unblock: (() => void) | undefined;
    const wait = new Promise<void>((resolve) => {
      unblock = resolve;
    });
    const verify = vi
      .spyOn(context.services.users, 'verifyLocalCredentials')
      .mockImplementation(async () => {
        entered++;
        if (entered === 5) signalReady?.();
        await wait;
        throw new AuthenticationError();
      });

    // Supertest executes a request when its promise is consumed.
    const running = Array.from({ length: 5 }, () =>
      login('parallel@example.test').then((response) => response),
    );

    try {
      await Promise.race([
        ready,
        new Promise<never>((_resolve, reject) =>
          setTimeout(() => reject(new Error('Credential calls did not start')), 5000),
        ),
      ]);
      const sixth = await login('parallel@example.test');
      expect(sixth.status).toBe(429);
      expect(verify).toHaveBeenCalledTimes(5);
    } finally {
      unblock?.();
      await Promise.all(running);
    }
  });

  it('limits registration before reaching the account-creation service', async () => {
    const register = vi
      .spyOn(context.services.users, 'registerGuest')
      .mockRejectedValue(new AuthenticationError());

    for (let i = 0; i < 5; i++) {
      const response = await request(context.app)
        .post('/api/v1/auth/register')
        .send({ name: 'x', email: 'x@x.test', password: 'x' });
      expect(response.status).toBe(401);
    }
    const blocked = await request(context.app)
      .post('/api/v1/auth/register')
      .send({ name: 'x', email: 'x@x.test', password: 'x' });
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    expect(register).toHaveBeenCalledTimes(5);
  });
});
