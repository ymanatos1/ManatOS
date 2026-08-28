import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('configuration presentation', () => {
  it('groups runtime settings and protects encrypted values', () => {
    const source = readFileSync(new URL('../views/pages/configuration.ejs', import.meta.url), 'utf8');
    expect(source).not.toContain('<h1');
    expect(source).not.toContain('Runtime application settings. Changes marked restart-required');
    expect(source).toContain('Secrets stay protected');
    expect(source).toContain('Secret configured');
    expect(source).toContain('Restart required');
    expect(source).toContain("item.valueType === 'boolean'");
  });
});
