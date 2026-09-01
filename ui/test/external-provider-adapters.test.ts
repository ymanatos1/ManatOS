import { describe, expect, it } from 'vitest';
import { EXTERNAL_PROVIDER_KEYS } from '@manatos/shared';

import { registeredExternalProviderKeys } from '../src/auth/providers/registry.js';

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const source = (path: string) => readFile(resolve(process.cwd(), path), 'utf8');

describe('external authentication executable adapter boundary', () => {
  it('registers one executable OAuth adapter for every canonical provider key', () => {
    expect(registeredExternalProviderKeys()).toEqual(EXTERNAL_PROVIDER_KEYS);
  });

  it('keeps callers provider-neutral while static provider facts remain declarative', async () => {
    const passportSource = await source('src/auth/passport.ts');
    const credentialSource = await source('src/auth/providers/credential-test.ts');
    const registrySource = await source('src/auth/providers/registry.ts');

    expect(passportSource).toContain('externalProviderAdapter(key).configureLive');
    expect(passportSource).not.toContain("key === 'microsoft'");
    expect(passportSource).not.toContain("key === 'google'");
    expect(credentialSource).toContain('externalProviderAdapter(options.provider).configureCredentialTest');
    expect(credentialSource).not.toContain("options.provider ===");
    expect(registrySource).toContain('google: googleProviderAdapter');
    expect(registrySource).toContain('microsoft: microsoftProviderAdapter');
  });
});
