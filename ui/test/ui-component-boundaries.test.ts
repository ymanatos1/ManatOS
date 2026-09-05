import { access, readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const uiRoot = resolve(testDirectory, '..');

const filesBelow = async (directory: string): Promise<string[]> => {
  const result: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await filesBelow(path)));
    else if (entry.isFile() && entry.name.endsWith('.ejs')) result.push(path);
  }
  return result;
};

describe('UI component responsibility boundaries', () => {
  it('keeps concrete canonical field-components behind the entity-field dispatcher', async () => {
    const viewsRoot = resolve(uiRoot, 'views');
    const dispatcherPath = resolve(viewsRoot, 'components/sysbo/entry/fields/entity-field.ejs');
    const concreteNames = [
      'boolean-field',
      'enum-select',
      'reference-select',
      'date-field',
      'datetime-field',
      'duration-field',
      'version-field',
      'telephone-field',
      'text-field',
      'number-field',
    ];

    for (const file of await filesBelow(viewsRoot)) {
      if (file === dispatcherPath) continue;
      const source = await readFile(file, 'utf8');
      for (const concrete of concreteNames) {
        expect(
          source.includes(`components/sysbo/entry/fields/${concrete}`),
          `${relative(viewsRoot, file)} must use entity-field rather than ${concrete} directly`,
        ).toBe(false);
      }
    }
  });

  it('allows canonical compact/composite editors to embed the dispatcher without CTX field binding', async () => {
    const quick = await readFile(
      resolve(uiRoot, 'views/components/sysbo/hierarchy/record-quick.ejs'),
      'utf8',
    );
    const credentials = await readFile(
      resolve(uiRoot, 'views/components/sysbo/entry/content/provider-credentials.ejs'),
      'utf8',
    );

    expect(quick).toContain("include('../entry/fields/entity-field'");
    expect(quick).toContain('bindCtx: false');
    expect(credentials).toContain("include('../fields/entity-field'");
    expect(credentials).toContain("key: 'clientId'");
    expect(credentials).toContain('bindCtx: false');
  });

  it('keeps transient workflow values outside canonical field metadata and field tools', async () => {
    const credentials = await readFile(
      resolve(uiRoot, 'views/components/sysbo/entry/content/provider-credentials.ejs'),
      'utf8',
    );
    const workflow = await readFile(
      resolve(uiRoot, 'views/components/sysbo/entry/content/workflow-input.ejs'),
      'utf8',
    );

    expect(credentials).toContain("include('workflow-input'");
    expect(credentials).toContain("name: 'clientSecret'");
    expect(workflow).toContain('data-workflow-input');
    expect(workflow).not.toContain('data-ctx-field');
    expect(workflow).not.toContain('field-tools-menu');
  });

  it('keeps summary a higher-level container rather than an interactive field-component host', async () => {
    const summary = await readFile(
      resolve(uiRoot, 'views/components/sysbo/entry/content/summary.ejs'),
      'utf8',
    );
    expect(summary).toContain('Higher-level read-only field container');
    expect(summary).toContain("include('related-collections'");
    expect(summary).not.toContain('components/sysbo/entry/fields/');
    expect(summary).not.toContain('data-field-control');
  });
  it('keeps reusable EJS components self-documenting and free of extreme source lines', async () => {
    const reusableRoots = [resolve(uiRoot, 'views/components'), resolve(uiRoot, 'views/popups')];

    for (const reusableRoot of reusableRoots) {
      for (const file of await filesBelow(reusableRoot)) {
        const source = await readFile(file, 'utf8');
        const relativeName = relative(uiRoot, file);

        expect(
          source.startsWith('<%#\n  COMPONENT:'),
          `${relativeName} needs the standard component header`,
        ).toBe(true);
        for (const section of [
          'Purpose:',
          'Inputs / metadata:',
          'CTX contract:',
          'Embeds / delegates:',
          'Runtime contract:',
        ]) {
          expect(source, `${relativeName} needs the ${section} section`).toContain(section);
        }

        const longestLine = Math.max(...source.split(/\r?\n/).map((line) => line.length));
        expect(
          longestLine,
          `${relativeName} contains an excessively long source line`,
        ).toBeLessThanOrEqual(180);
      }
    }
  });

  it('keeps component folders aligned to UI responsibility instead of historical placement', async () => {
    const required = [
      'views/components/sysbo/entry/shell/entry-tab-content.ejs',
      'views/components/sysbo/entry/fields/entity-field.ejs',
      'views/components/sysbo/entry/content/collection-editor.ejs',
      'views/components/sysbo/list/list-row-cells.ejs',
      'views/components/sysbo/hierarchy/hierarchy-workspace.ejs',
      'views/popups/selectors/record-selector.ejs',
      'public/js/popups/popup-runtime.js',
      'public/js/popups/record-selector.js',
      'public/js/sysbo/entry/field-runtime.js',
      'public/js/sysbo/hierarchy/hierarchy-workspace.js',
    ];

    for (const path of required)
      await expect(access(resolve(uiRoot, path))).resolves.toBeUndefined();

    for (const obsolete of [
      'views/field-components',
      'views/components/sysbo/record-selector.ejs',
      'views/components/sysbo/collections',
      'public/js/field-components',
      'public/js/components/record-selector.js',
      'public/js/components/popup-runtime.js',
      'public/js/forms/modal-focus.js',
    ]) {
      await expect(access(resolve(uiRoot, obsolete))).rejects.toThrow();
    }
  });
});
