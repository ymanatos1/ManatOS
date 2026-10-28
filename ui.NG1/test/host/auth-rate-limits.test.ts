// @vitest-environment node
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { verifyAuthClientIp } from '@manatos/shared/node';
import { AuthApiFailure } from '@manatos/shared-ui/node';

import { Ng1AuthApi } from '../../src/host/auth-api.js';
import { createNg1AuthRouter } from '../../src/host/auth-router.js';
import type { Ng1HostConfig } from '../../src/host/config.js';

/**
 * Real HTTP tests of NG1's Node Auth gateway. No Angular UI or production API
 * is required. Each test starts a temporary loopback server and cleans it up.
 *
 * These tests deliberately enforce the new concurrency/delegation contract:
 * the supplied baseline NG1 code still uses check()+record() and does not yet
 * sign the browser's IP, so those regressions MUST fail until the agreed
 * NG1 edits are applied. Do not weaken the assertions to make them green.
 */
describe('NG1 authentication HTTP gateway', () => {
  const secret = 'test-only-trusted-ng1-delegation-secret-12345';
  const user = { id: 'user1', name: 'Browser test user' };
  const servers: Server[] = [];

  async function serve(app: Parameters<typeof createServer>[0]): Promise<string> {
    const server = createServer(app);
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }

  /** One browser profile: both tabs send the same cookie and CSRF credential. */
  async function browser(origin: string) {
    const response = await fetch(`${origin}/_manatos/auth/csrf`);
    expect(response.status).toBe(200);
    const cookie = response.headers.get('set-cookie')?.split(';')[0];
    expect(cookie).toMatch(/^manatos_ng1_auth=/);
    expect(response.headers.get('set-cookie')).toContain('HttpOnly');
    const json = (await response.json()) as { data: { csrfToken: string } };

    return {
      cookie: cookie!,
      csrf: json.data.csrfToken,
      signIn(identity = 'target@example.test') {
        return fetch(`${origin}/_manatos/auth/signin`, {
          method: 'POST',
          headers: {
            origin,
            cookie: cookie!,
            'content-type': 'application/json',
            'x-manatos-csrf': json.data.csrfToken,
          },
          body: JSON.stringify({ identity, password: 'incorrect' }),
        });
      },
    };
  }

  function uiConfig(apiBaseUrl = 'http://127.0.0.1:55555') {
    // The shared secret is intentionally server-only. It is needed by the
    // agreed NG1 integration but is not yet declared in the uploaded baseline.
    const config: Ng1HostConfig & { authDelegationSecret: string } = {
      nodeEnv: 'test',
      uiPort: 3004,
      apiBaseUrl,
      authDelegationSecret: secret,
      documentationRepositoryRoot: '.',
      angularDistRoot: '.',
    };
    return config;
  }

  async function host(apiBaseUrl?: string) {
    const app = express();
    app.use('/_manatos/auth', createNg1AuthRouter(uiConfig(apiBaseUrl)));
    return serve(app);
  }

  afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(
      servers.splice(0).map(
        (server) =>
          new Promise<void>((resolve) => {
            server.close(() => resolve());
            server.closeAllConnections();
          }),
      ),
    );
  });

  it('returns 429 and Retry-After after five rejected passwords', async () => {
    const verify = vi
      .spyOn(Ng1AuthApi.prototype, 'login')
      .mockRejectedValue(new AuthApiFailure(401, 'INVALID_CREDENTIALS', 'Invalid credentials'));
    const origin = await host();
    const client = await browser(origin);

    for (let i = 0; i < 5; i++) {
      expect((await client.signIn()).status).toBe(401);
    }
    const blocked = await client.signIn();
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(verify).toHaveBeenCalledTimes(5);
  });

  it('blocks the sixth concurrent password check before contacting the API', async () => {
    let entered = 0;
    let markReady: (() => void) | undefined;
    let unblock: (() => void) | undefined;
    const ready = new Promise<void>((resolve) => {
      markReady = resolve;
    });
    const waiting = new Promise<void>((resolve) => {
      unblock = resolve;
    });
    const verify = vi.spyOn(Ng1AuthApi.prototype, 'login').mockImplementation(async () => {
      entered++;
      if (entered === 5) markReady?.();
      await waiting;
      throw new AuthApiFailure(401, 'INVALID_CREDENTIALS', 'Invalid credentials');
    });
    const origin = await host();
    const client = await browser(origin);
    const running = Array.from({ length: 5 }, () => client.signIn());

    try {
      await Promise.race([
        ready,
        new Promise<never>((_resolve, reject) =>
          setTimeout(() => reject(new Error('Five calls did not start')), 5000),
        ),
      ]);
      const sixth = await Promise.race([
        client.signIn(),
        new Promise<never>((_resolve, reject) =>
          setTimeout(() => reject(new Error('Sixth call was not blocked promptly')), 1000),
        ),
      ]);
      expect(sixth.status).toBe(429);
      expect(verify).toHaveBeenCalledTimes(5);
    } finally {
      unblock?.();
      await Promise.all(running);
    }
  });

  it('preserves authenticated session across browser tabs/windows and sign-out', async () => {
    vi.spyOn(Ng1AuthApi.prototype, 'login').mockResolvedValue({
      accessToken: 'server-only-token',
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
      user,
    });
    vi.spyOn(Ng1AuthApi.prototype, 'currentUser').mockResolvedValue(user);
    vi.spyOn(Ng1AuthApi.prototype, 'logout').mockResolvedValue(undefined);

    const origin = await host();
    const browserProfile = await browser(origin);
    const signedIn = await browserProfile.signIn();
    expect(signedIn.status).toBe(200);
    const signedInCookie = signedIn.headers.get('set-cookie')?.split(';')[0];
    expect(signedInCookie).toMatch(/^manatos_ng1_auth=/);

    for (const surface of ['tab one', 'tab two', 'another window', 'refresh']) {
      const result = await fetch(`${origin}/_manatos/auth/session`, {
        headers: { cookie: signedInCookie! },
      });
      expect(result.status, surface).toBe(200);
      expect((await result.json()) as unknown, surface).toMatchObject({
        data: { status: 'authenticated', user },
      });
    }

    const signedInData = (await signedIn.json()) as { data: { csrfToken: string } };
    const signedOut = await fetch(`${origin}/_manatos/auth/signout`, {
      method: 'POST',
      headers: { origin, cookie: signedInCookie!, 'x-manatos-csrf': signedInData.data.csrfToken },
    });
    expect(signedOut.status).toBe(200);

    const otherTab = await fetch(`${origin}/_manatos/auth/session`, {
      headers: { cookie: signedInCookie! },
    });
    expect((await otherTab.json()) as unknown).toMatchObject({ data: { status: 'anonymous' } });
  });

  it('forwards a valid signed browser IP to the API from its server-only adapter', async () => {
    let observed:
      | {
          method: string;
          path: string;
          headers: Record<string, string | string[] | undefined>;
          body: unknown;
        }
      | undefined;
    const api = await serve((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
        observed = {
          method: req.method ?? '',
          path: req.url ?? '',
          headers: req.headers,
          body,
        };
        res.setHeader('content-type', 'application/json');
        res.end(
          JSON.stringify({
            success: true,
            data: {
              accessToken: 'server-token',
              expiresAt: new Date(Date.now() + 300_000).toISOString(),
              user,
            },
          }),
        );
      });
    });

    // Specify the intended NG1 AuthApi constructor/call contract. A cast
    // allows this *test file* to type-check on the previous source baseline,
    // while its runtime assertion still fails until forwarding is implemented.
    const Adapter = Ng1AuthApi as unknown as new (url: string, secret: string) => Ng1AuthApi;
    const adapter = new Adapter(api, secret);
    const client = adapter as unknown as {
      login(identity: string, password: string, ip: string): Promise<unknown>;
    };
    await client.login('tester', 'dummy-password', '198.51.100.27');

    expect(observed).toBeDefined();
    const headers = observed!.headers;
    const delegated = verifyAuthClientIp(
      secret,
      {
        ip: headers['x-manatos-auth-client-ip'] as string,
        time: headers['x-manatos-auth-client-time'] as string,
        signature: headers['x-manatos-auth-client-signature'] as string,
      },
      observed!.method,
      observed!.path,
      observed!.body,
    );
    expect(delegated).toBe('198.51.100.27');
  });
});
