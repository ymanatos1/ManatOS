import { describe, expect, it } from 'vitest';

import {
  AUTH_DELEGATION_MAX_SKEW_MS,
  AUTH_DELEGATION_HEADERS,
  signAuthClientIp,
  verifyAuthClientIp,
} from '../../src/security/auth-client-delegation.js';

/** Test the Node-only proof used between the UI host and the public API. */
describe('trusted Auth client-IP delegation', () => {
  const secret = 'a-dedicated-auth-delegation-secret-for-testing-only';
  const when = 1_790_000_000_000;
  const path = '/api/v1/auth/login';
  const body = { identity: 'tester', password: 'dummy-not-a-real-password' };

  function signed(ip = '198.51.100.8') {
    const headers = signAuthClientIp(secret, ip, 'POST', path, body, when);
    return {
      ip: headers[AUTH_DELEGATION_HEADERS.ip],
      time: headers[AUTH_DELEGATION_HEADERS.time],
      signature: headers[AUTH_DELEGATION_HEADERS.signature],
    };
  }

  it('authenticates distinct public client IPs via the same trusted UI server', () => {
    expect(verifyAuthClientIp(secret, signed(), 'POST', path, body, when)).toBe('198.51.100.8');
    expect(verifyAuthClientIp(secret, signed('198.51.100.9'), 'POST', path, body, when)).toBe(
      '198.51.100.9',
    );
  });

  it('does not require delegation headers for ordinary direct API clients', () => {
    expect(verifyAuthClientIp(undefined, {}, 'POST', path, body, when)).toBeNull();
  });

  it('rejects an altered IP, body, path, method, signature or secret', () => {
    const headers = signed();
    expect(() =>
      verifyAuthClientIp(secret, { ...headers, ip: '198.51.100.99' }, 'POST', path, body, when),
    ).toThrow();
    expect(() =>
      verifyAuthClientIp(secret, headers, 'POST', path, { ...body, password: 'other' }, when),
    ).toThrow();
    expect(() =>
      verifyAuthClientIp(secret, headers, 'POST', '/api/v1/auth/register', body, when),
    ).toThrow();
    expect(() => verifyAuthClientIp(secret, headers, 'GET', path, body, when)).toThrow();
    expect(() =>
      verifyAuthClientIp(
        secret,
        { ...headers, signature: '0'.repeat(64) },
        'POST',
        path,
        body,
        when,
      ),
    ).toThrow();
    expect(() =>
      verifyAuthClientIp(
        'different-secret-of-sufficient-length-123',
        headers,
        'POST',
        path,
        body,
        when,
      ),
    ).toThrow();
  });

  it('rejects missing parts, stale signatures and malformed client IPs', () => {
    const headers = signed();
    expect(() =>
      verifyAuthClientIp(secret, { ip: headers.ip }, 'POST', path, body, when),
    ).toThrow();
    expect(() =>
      verifyAuthClientIp(
        secret,
        headers,
        'POST',
        path,
        body,
        when + AUTH_DELEGATION_MAX_SKEW_MS + 1,
      ),
    ).toThrow();
    expect(() => signAuthClientIp(secret, 'forged-hostname', 'POST', path, body, when)).toThrow();
    expect(() => signAuthClientIp('short', '198.51.100.8', 'POST', path, body, when)).toThrow();
  });
});
