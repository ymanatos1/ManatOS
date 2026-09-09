import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('V2 application create defaults', () => {
  it('declares the initial semantic version in canonical UI metadata', () => {
    const business = readFileSync(
      new URL('../../../shared/src/metadata/ui/business.ts', import.meta.url),
      'utf8',
    );
    expect(business).toContain("version: { createDefaultValue: '0.0.1' }");
  });
});
