import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/** Guard the source declarations: duplicate JS object keys are already lost at runtime. */
describe('metadata localization dictionary codes', () => {
  it('defines each qualified dictionary code exactly once', () => {
    const seen = new Set<string>();
    const duplicates: string[] = [];
    for (const prefix of ['CO', 'PL', 'SS', 'EN', 'CM'] as const) {
      const url = new URL(
        `../../src/multilingual/metadata/${prefix.toLowerCase()}.ts`,
        import.meta.url,
      );
      const source = readFileSync(fileURLToPath(url), 'utf8');
      for (const line of source.split(/\r?\n/)) {
        const match = /^\s*"([^"]+)":\s*\{\s*EN:/.exec(line);
        if (!match) continue;
        const code = `${prefix}.${match[1]}`;
        if (seen.has(code)) duplicates.push(code);
        seen.add(code);
      }
    }
    expect(duplicates).toEqual([]);
  });
});
