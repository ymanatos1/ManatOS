import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

/** An unpredictable bearer value; store only its SHA-256 digest. */
export function makeCredential(): { id: string; value: string; digest: Buffer } {
  const id = randomUUID();
  const value = `${id}.${randomBytes(32).toString('base64url')}`;
  return { id, value, digest: credentialDigest(value) };
}

export function credentialId(value: string): string | null {
  return (
    /^([a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})\.[A-Za-z0-9_-]{43}$/.exec(value)?.[1] ?? null
  );
}

export function credentialDigest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

export function matchesCredential(expected: Buffer, raw: string): boolean {
  return timingSafeEqual(expected, credentialDigest(raw));
}
