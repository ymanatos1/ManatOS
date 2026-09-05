import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { SecretsEncryptionService } from '../src/security/secrets-encryption-service.js';

describe('SecretsEncryptionService', () => {
  it('round-trips secrets and uses a fresh IV for each encryption', () => {
    const service = new SecretsEncryptionService('test', randomBytes(32).toString('base64'));
    const first = service.encrypt('secret-value');
    const second = service.encrypt('secret-value');
    expect(first).not.toBe(second);
    expect(service.decrypt(first)).toBe('secret-value');
    expect(service.decrypt(second)).toBe('secret-value');
  });

  it('rejects malformed keys', () => {
    expect(
      () => new SecretsEncryptionService('test', Buffer.from('short').toString('base64')),
    ).toThrow(/32-byte/);
  });

  it('detects ciphertext tampering', () => {
    const service = new SecretsEncryptionService('test', randomBytes(32).toString('base64'));
    const encrypted = service.encrypt('secret-value');
    const parts = encrypted.split(':');
    parts[4] = Buffer.from('tampered').toString('base64');
    expect(() => service.decrypt(parts.join(':'))).toThrow();
  });
});
