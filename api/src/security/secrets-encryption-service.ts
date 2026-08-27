import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/** AES-256-GCM envelope encryption for reversible application secrets. */
export class SecretsEncryptionService {
  private readonly key?: Buffer;

  constructor(private readonly activeKeyId: string, base64Key?: string) {
    if (!base64Key) return;
    const decoded = Buffer.from(base64Key, 'base64');
    if (decoded.length !== 32) throw new Error('SECRETS_ENCRYPTION_KEY must be a base64-encoded 32-byte key.');
    this.key = decoded;
  }

  encrypt(plaintext: string): string {
    if (!plaintext) throw new Error('Cannot encrypt an empty secret.');
    const key = this.requireKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return ['v1', this.activeKeyId, iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join(':');
  }

  decrypt(envelope: string): string {
    const key = this.requireKey();
    const [version, keyId, iv64, tag64, ciphertext64, ...extra] = envelope.split(':');
    if (version !== 'v1' || keyId !== this.activeKeyId || !iv64 || !tag64 || ciphertext64 === undefined || extra.length) {
      throw new Error('Invalid or unsupported encrypted-secret envelope.');
    }
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv64, 'base64'));
    decipher.setAuthTag(Buffer.from(tag64, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext64, 'base64')), decipher.final()]).toString('utf8');
  }

  private requireKey(): Buffer {
    if (!this.key) throw new Error('SECRETS_ENCRYPTION_KEY is required before encrypted application secrets can be stored or read. Generate it once with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"');
    return this.key;
  }
}
