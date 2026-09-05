import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const uiRoot = resolve(testDirectory, '..');

const filesBelow = async (directory: string): Promise<string[]> => {
  const result: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await filesBelow(path));
    else if (entry.isFile() && entry.name.endsWith('.ejs')) result.push(path);
  }
  return result;
};

describe('UI component responsibility boundaries', () => {
  it('keeps concrete canonical field-components behind the entity-field dispatcher', async () => {
    const viewsRoot = resolve(uiRoot, 'views');
    const dispatcherPath = resolve(viewsRoot, 'field-components/entity-field.ejs');
    const concreteNames = [
      'boolean-field', 'enum-select', 'reference-select', 'date-field', 'datetime-field',
      'duration-field', 'version-field', 'telephone-field', 'text-field', 'number-field',
    ];

    for (const file of await filesBelow(viewsRoot)) {
      if (file === dispatcherPath) continue;
      const source = await readFile(file, 'utf8');
      for (const concrete of concreteNames) {
        expect(
          source.includes(`field-components/${concrete}`),
          `${relative(viewsRoot, file)} must use entity-field rather than ${concrete} directly`,
        ).toBe(false);
      }
    }
  });

  it('allows canonical compact/composite editors to embed the dispatcher without CTX field binding', async () => {
    const quick = await readFile(resolve(uiRoot, 'views/components/sysbo/hierarchy/record-quick.ejs'), 'utf8');
    const credentials = await readFile(resolve(uiRoot, 'views/components/sysbo/entry/provider-credentials.ejs'), 'utf8');

    expect(quick).toContain("include('../../../field-components/entity-field'");
    expect(quick).toContain('bindCtx: false');
    expect(credentials).toContain("include('../../../field-components/entity-field'");
    expect(credentials).toContain("key: 'clientId'");
    expect(credentials).toContain('bindCtx: false');
  });

  it('keeps transient workflow values outside canonical field metadata and field tools', async () => {
    const credentials = await readFile(resolve(uiRoot, 'views/components/sysbo/entry/provider-credentials.ejs'), 'utf8');
    const workflow = await readFile(resolve(uiRoot, 'views/components/common/workflow-input.ejs'), 'utf8');

    expect(credentials).toContain("include('../../common/workflow-input'");
    expect(credentials).toContain("name: 'clientSecret'");
    expect(workflow).toContain('data-workflow-input');
    expect(workflow).not.toContain('data-ctx-field');
    expect(workflow).not.toContain('field-tools-menu');
  });

  it('keeps summary a higher-level container rather than an interactive field-component host', async () => {
    const summary = await readFile(resolve(uiRoot, 'views/components/sysbo/entry/summary.ejs'), 'utf8');
    expect(summary).toContain('Higher-level read-only field container');
    expect(summary).toContain("include('../collections/related-collections'");
    expect(summary).not.toContain('field-components/');
    expect(summary).not.toContain('data-field-control');
  });
});
