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

  it('does not invalidate password-reset tokens', () => {
    const store = new SecurityTokenStore();
    const token = store.create('user-1', 'reset-password', 30);

    store.invalidateEmailVerificationTokens('user-1', 'github');

    expect(store.consume(token, 'reset-password')).toBe('user-1');
  });
  it('can inspect a password-reset token without consuming it', () => {
    const store = new SecurityTokenStore();
    const token = store.create('user-1', 'reset-password', 30);

    expect(store.isUsable(token, 'reset-password')).toBe(true);
    expect(store.isUsable(token, 'verify-email')).toBe(false);
    expect(store.consume(token, 'reset-password')).toBe('user-1');
    expect(store.isUsable(token, 'reset-password')).toBe(false);
  });

});
