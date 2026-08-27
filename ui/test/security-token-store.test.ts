import { describe, expect, it } from 'vitest';

import { SecurityTokenStore } from '../src/security/security-token-store.js';

describe('SecurityTokenStore email verification invalidation', () => {
  it('explains that a still-valid verification link became redundant through GitHub', () => {
    const store = new SecurityTokenStore();
    const token = store.create('user-1', 'verify-email', 30);

    store.invalidateEmailVerificationTokens('user-1', 'github');

    expect(store.consumeDetailed(token, 'verify-email')).toEqual({
      status: 'already-verified',
      userId: 'user-1',
      source: 'github',
    });
  });

  it('does not invalidate password-reset tokens when email verification is invalidated', () => {
    const store = new SecurityTokenStore();
    const token = store.create('user-1', 'reset-password', 30);

    store.invalidateEmailVerificationTokens('user-1', 'github');

    expect(store.consume(token, 'reset-password')).toBe('user-1');
  });
});

describe('SecurityTokenStore password recovery', () => {
  it('can inspect a password-reset token without consuming it', () => {
    const store = new SecurityTokenStore();
    const token = store.create('user-1', 'reset-password', 30, {
      subjectLabel: 'Admin',
    });

    expect(store.inspectUsable(token, 'reset-password')).toEqual({
      userId: 'user-1',
      subjectLabel: 'Admin',
    });
    expect(store.isUsable(token, 'verify-email')).toBe(false);
    expect(store.consume(token, 'reset-password')).toBe('user-1');
    expect(store.isUsable(token, 'reset-password')).toBe(false);
  });

  it('rejects a tampered token without consuming the untouched original', () => {
    const store = new SecurityTokenStore();
    const token = store.create('user-1', 'reset-password', 30);
    const tampered = `${token.slice(0, -2)}zz`;

    expect(store.isUsable(tampered, 'reset-password')).toBe(false);
    expect(store.isUsable(token, 'reset-password')).toBe(true);
    expect(store.consume(token, 'reset-password')).toBe('user-1');
  });

  it('allows only the newest outstanding reset token for the same user', () => {
    const store = new SecurityTokenStore();
    const tokenA = store.create('user-1', 'reset-password', 30);
    const tokenB = store.create('user-1', 'reset-password', 30);

    expect(store.isUsable(tokenA, 'reset-password')).toBe(false);
    expect(store.isUsable(tokenB, 'reset-password')).toBe(true);
    expect(store.consume(tokenA, 'reset-password')).toBeNull();
    expect(store.consume(tokenB, 'reset-password')).toBe('user-1');
  });

  it('does not invalidate another user reset token when a new token is issued', () => {
    const store = new SecurityTokenStore();
    const userOne = store.create('user-1', 'reset-password', 30);
    const userTwo = store.create('user-2', 'reset-password', 30);

    store.create('user-1', 'reset-password', 30);

    expect(store.isUsable(userOne, 'reset-password')).toBe(false);
    expect(store.isUsable(userTwo, 'reset-password')).toBe(true);
  });

  it('invalidates every remaining reset token for the user after recovery completes', () => {
    const store = new SecurityTokenStore();
    const current = store.create('user-1', 'reset-password', 30);

    expect(store.consume(current, 'reset-password')).toBe('user-1');

    // Simulate the post-password-update hardening call made by the recovery route.
    store.invalidatePasswordResetTokens('user-1');

    expect(store.isUsable(current, 'reset-password')).toBe(false);
    expect(store.consume(current, 'reset-password')).toBeNull();
  });

  it('rejects an otherwise untouched token after its expiry time', () => {
    let now = Date.parse('2026-08-26T00:00:00.000Z');
    const store = new SecurityTokenStore(() => now);
    const token = store.create('user-1', 'reset-password', 30);

    expect(store.isUsable(token, 'reset-password')).toBe(true);

    now += 31 * 60_000;

    expect(store.isUsable(token, 'reset-password')).toBe(false);
    expect(store.consume(token, 'reset-password')).toBeNull();
  });
});
