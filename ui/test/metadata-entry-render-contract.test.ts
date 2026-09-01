import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const entryTemplatePath = resolve(
  testDirectory,
  '../views/pages/metadata-driven/bo-entry-metadata.ejs',
);

describe('metadata-driven entry render contract', () => {
  it('passes canonical compiled entity metadata explicitly to field components', async () => {
    const source = await readFile(entryTemplatePath, 'utf8');

    expect(source).toMatch(
      /const\s+compiledEntityMetadata\s*=\s*compiledEntityContext\?\.metadata\s*\|\|\s*\{\}/,
    );
    expect(source).toMatch(
      /const\s+fieldComponentContext\s*=\s*\{[\s\S]*?\bcompiledEntityMetadata\b[\s\S]*?\};/,
    );
    expect(source).toMatch(
      /include\(['\"]field-components\/form-field['\"],\s*\{\s*\.\.\.fieldComponentContext/,
    );
  });
});
