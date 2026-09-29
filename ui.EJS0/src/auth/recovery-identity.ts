/**
 * Validate only the syntax of a password-recovery identity.
 *
 * This helper must never perform account lookup: format validation is safe to
 * expose publicly, while account existence remains private.
 */
export function isRecoveryIdentitySyntaxValid(value: string): boolean {
  const identity = value.trim();

  if (identity.includes('@')) {
    // Deliberately modest email syntax validation. Canonical account lookup and
    // stored email validation remain server/domain concerns.
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identity);
  }

  // Matches the existing local registration minimum for user name.
  return identity.length >= 2;
}
