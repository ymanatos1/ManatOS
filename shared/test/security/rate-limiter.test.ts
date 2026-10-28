import { describe, expect, it } from 'vitest';

import { InMemoryRateLimiter } from '../../src/security/rate-limiter.js';
import {
  AUTH_RATE_LIMITS,
  RATE_LIMIT_RESERVATION_MAX_MS,
} from '../../src/security/rate-limit-policy.js';

/**
 * Fixed clocks make these tests repeatable and fast: no sleeping for ten minutes.
 * Each case owns its own limiter, exactly as an independently started server does.
 */
describe('shared rate limiting', () => {
  it('admits five completed failed attempts and rejects the sixth with Retry-After', () => {
    let now = 100_000;
    const limiter = new InMemoryRateLimiter(() => now);
    const key = 'login:failure:ip:identity';

    for (let i = 0; i < AUTH_RATE_LIMITS.loginFailures.limit; i++) {
      const reservation = limiter.reserve(key, AUTH_RATE_LIMITS.loginFailures);
      expect(reservation.decision.allowed).toBe(true);
      reservation.finish('failure');
    }

    const blocked = limiter.reserve(key, AUTH_RATE_LIMITS.loginFailures);
    expect(blocked.decision).toMatchObject({ allowed: false, remaining: 0 });
    expect(blocked.decision.retryAfterSeconds).toBe(600);

    now += AUTH_RATE_LIMITS.loginFailures.windowMs + 1;
    expect(limiter.reserve(key, AUTH_RATE_LIMITS.loginFailures).decision.allowed).toBe(true);
  });

  it('atomically reserves capacity for concurrent password checks', () => {
    const limiter = new InMemoryRateLimiter(() => 100_000);
    const key = 'same-ip-and-identity';
    const pending = Array.from({ length: AUTH_RATE_LIMITS.loginFailures.limit }, () =>
      limiter.reserve(key, AUTH_RATE_LIMITS.loginFailures),
    );

    expect(pending.every((reservation) => reservation.decision.allowed)).toBe(true);
    expect(limiter.reserve(key, AUTH_RATE_LIMITS.loginFailures).decision.allowed).toBe(false);

    pending[0]!.finish('release'); // Successful login or infrastructure failure.
    pending[0]!.finish('failure'); // Double finishing must not count another failure.
    expect(limiter.reserve(key, AUTH_RATE_LIMITS.loginFailures).decision.allowed).toBe(true);
  });

  it('releases infrastructure errors and clears finished failures after success', () => {
    const limiter = new InMemoryRateLimiter();
    const key = 'identity:ip';
    const policy = AUTH_RATE_LIMITS.loginFailures;

    const error = limiter.reserve(key, policy);
    error.finish('release');
    expect(limiter.check(key, policy).remaining).toBe(policy.limit);

    const failure = limiter.reserve(key, policy);
    failure.finish('failure');
    expect(limiter.check(key, policy).remaining).toBe(policy.limit - 1);

    const success = limiter.reserve(key, policy);
    success.finish('release');
    limiter.clear(key);
    expect(limiter.check(key, policy).remaining).toBe(policy.limit);
  });

  it('keeps outstanding reservations when another request succeeds', () => {
    const limiter = new InMemoryRateLimiter();
    const key = 'same-identity-and-ip';
    const policy = AUTH_RATE_LIMITS.loginFailures;
    const first = limiter.reserve(key, policy);
    const second = limiter.reserve(key, policy);

    first.finish('release');
    limiter.clear(key);
    expect(limiter.check(key, policy).remaining).toBe(policy.limit - 1);

    second.finish('failure');
    expect(limiter.check(key, policy).remaining).toBe(policy.limit - 1);
  });

  it('counts thirty total requests per IP independently of identity', () => {
    const limiter = new InMemoryRateLimiter(() => 50_000);
    const policy = AUTH_RATE_LIMITS.loginByIp;

    for (let i = 0; i < policy.limit; i++) {
      expect(limiter.record('ip:A', policy).allowed).toBe(true);
    }
    expect(limiter.record('ip:A', policy)).toMatchObject({
      allowed: false,
      retryAfterSeconds: 600,
    });
    expect(limiter.record('ip:B', policy).allowed).toBe(true);
  });

  it('expires abandoned reservations and bounds the number of counter keys', () => {
    let now = 100_000;
    const limiter = new InMemoryRateLimiter(() => now, 1);
    const policy = AUTH_RATE_LIMITS.loginFailures;

    const abandoned = limiter.reserve('ip:A', policy);
    expect(abandoned.decision.allowed).toBe(true);
    expect(limiter.reserve('ip:B', policy).decision.allowed).toBe(false);

    now += RATE_LIMIT_RESERVATION_MAX_MS + 1;

    // The abandoned reservation expires, freeing the single key slot.
    // A different identity can now acquire that capacity.
    const active = limiter.reserve('ip:B', policy);
    expect(active.decision.allowed).toBe(true);

    // The old, expired reservation must never recreate its counter.
    abandoned.finish('failure');

    // While B owns the only slot, A must still be refused.
    expect(limiter.reserve('ip:A', policy).decision.allowed).toBe(false);

    // Once B releases its reservation, A must have its full allowance.
    active.finish('release');
    expect(limiter.check('ip:A', policy).remaining).toBe(policy.limit);
  });
});
