import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const source = (path: string) => readFile(resolve(testDirectory, '..', path), 'utf8');

describe('metadata-driven entity field components', () => {
  it('routes canonical date, datetime and duration entity inputs through explicit reusable field components', async () => {
    const renderer = await source('views/components/sysbo/entry/fields/entity-field.ejs');
    const date = await source('views/components/sysbo/entry/fields/date-field.ejs');
    const datetime = await source('views/components/sysbo/entry/fields/datetime-field.ejs');
    const duration = await source('views/components/sysbo/entry/fields/duration-field.ejs');
    const runtime = await source('public/js/sysbo/entry/field-runtime.js');

    expect(renderer).toContain("field.type === 'date'");
    expect(renderer).toContain("field.type === 'datetime'");
    expect(renderer).toContain("field.type === 'duration'");
    expect(date).toContain('type="date"');
    expect(datetime).toContain('type="datetime-local"');
    expect(duration).toContain('data-duration-canonical-value');
    expect(duration).toContain('data-ctx-value-type="duration"');
    expect(runtime).toContain('window.ManatOSFieldComponents');
    expect(runtime).toContain('setDurationValue');
  });

  it('keeps generic tab rendering entity-agnostic while allowing ordered field/component content', async () => {
    const renderer = await source('views/components/sysbo/entry/shell/entry-tab-content.ejs');
    const registry = await source('src/presentation/metadata-component-registry.ts');

    expect(renderer).toContain('const tabContents = Array.isArray(tab.content)');
    expect(renderer).toContain("content?.kind === 'component'");
    expect(renderer).toContain('for (let contentIndex = 0; contentIndex < tab.content.length; contentIndex += 1)');
    expect(renderer).toContain('const content = tab.content[contentIndex]');
    expect(renderer).toContain('metadataComponentPartialFor');
    expect(registry).toContain("'contextual-help'");
    expect(registry).toContain("'provider-credentials'");
    expect(registry).toContain("'date-duration-range'");
    expect(renderer).not.toContain("definition.key === 'sys-ext-auth-providers'");
    expect(renderer).not.toContain("definition.key === 'sys-licenses'");
  });
});
