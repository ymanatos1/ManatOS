import {
  isExternalProviderKey,
  type EmailVerificationSource,
  type SysBOUser,
} from '@manatos/shared';

/**
 * Restrict persisted verification provenance to the supported stable keys.
 */
export function parseEmailVerificationSource(value: unknown): EmailVerificationSource {
  const source = String(value ?? 'internal').toLowerCase();

  if (isExternalProviderKey(source)) {
    return source;
  }

  return 'internal';
}

/**
 * Creates the API-safe representation of a SysBOUser.
 *
 * passwordHash must never leave the trusted application layer. Callers receive
 * only hasPassword so trusted UI flows can determine whether a local password
 * exists without exposing the actual hash.
 */
export function publicUser(user: SysBOUser) {
  const { passwordHash, ...safeUser } = user;

  return {
    ...safeUser,
    hasPassword: Boolean(passwordHash),
  };
}
