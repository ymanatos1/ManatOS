import { describe, expect, it } from 'vitest';

import { isRecoveryIdentitySyntaxValid } from '../src/auth/recovery-identity.js';

describe('password recovery identity syntax', () => {
  it.each([
    ['Admin', true],
    ['abc', true],
    ['a', false],
    ['abc@', false],
    ['@example.com', false],
    ['nobody@example.com', true],
    [' yiannis@manatos.gr ', true],
  ])('validates %s as %s', (identity, expected) => {
    expect(isRecoveryIdentitySyntaxValid(identity)).toBe(expected);
  });
});
