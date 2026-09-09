import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const entryTemplatePath = resolve(testDirectory, '../../views/components/runtime/entity-entry.ejs');

describe('metadata-driven entry render contract', () => {
  it('passes canonical compiled entity metadata explicitly to field components', async () => {
    const source = await readFile(entryTemplatePath, 'utf8');
    const tabContent = await readFile(
      resolve(testDirectory, '../../views/components/sysbo/entry/shell/entry-tab-content.ejs'),
      'utf8',
    );

    expect(source).toMatch(
      /const\s+compiledEntityMetadata\s*=\s*compiledEntityContext\?\.metadata\s*\|\|\s*\{\}/,
    );
    expect(source).toMatch(
      /const\s+v2FieldComponentContext\s*=\s*\{[\s\S]*?\bcompiledEntityMetadata\b[\s\S]*?\};/,
    );
    expect(tabContent).toMatch(
      /include\(['"]\.\.\/fields\/form-field['"],\s*\{\s*\.\.\.fieldComponentContext/,
    );
  });
  it('keeps the split Debugging panel data contract in sync with its partial', async () => {
    const source = await readFile(entryTemplatePath, 'utf8');
    const panel = await readFile(
      resolve(testDirectory, '../../views/components/debugging/debugging-panel.ejs'),
      'utf8',
    );

    expect(source).toContain('buildMetadataDebuggingModel({');
    expect(source).toContain('entityDebuggingDisplayRows, uiDebuggingDisplayRows');
    expect(source).toMatch(
      /include\(['"]\.\.\/debugging\/debugging-panel['"],\s*\{[\s\S]*?entityDebuggingDisplayRows,[\s\S]*?uiDebuggingDisplayRows,[\s\S]*?debugElementNameParts,[\s\S]*?debuggingEntityKey:\s*definition\.key,[\s\S]*?debuggingCsrfToken:\s*csrfToken[\s\S]*?\}\)/,
    );
    // Section navigation is metadata-declared; the generic panel only maps
    // runtime row data onto those semantic section ids.
    expect(panel).toContain('const sectionRows = {');
    expect(panel).toContain('entity: entityDebuggingDisplayRows || []');
    expect(panel).toContain('ui: uiDebuggingDisplayRows || []');
    expect(panel).toContain('rows: sectionRows[section.id] || []');
    expect(panel).toContain('suppliedDebuggingComponent?.options?.sections');
  });

  it('keeps the live V2 entry renderer composed from entity-agnostic reusable primitives', async () => {
    const source = await readFile(entryTemplatePath, 'utf8');
    const tabsNav = await readFile(
      resolve(testDirectory, '../../views/components/sysbo/entry/shell/entry-tabs-nav.ejs'),
      'utf8',
    );
    const metadataComponent = await readFile(
      resolve(testDirectory, '../../views/components/sysbo/entry/shell/metadata-component.ejs'),
      'utf8',
    );
    const entityField = await readFile(
      resolve(testDirectory, '../../views/components/sysbo/entry/fields/entity-field.ejs'),
      'utf8',
    );
    const saveSplit = await readFile(
      resolve(testDirectory, '../../views/components/sysbo/entry/shell/save-split-action.ejs'),
      'utf8',
    );

    expect(source).toContain("include('../sysbo/entry/shell/entry-tabs-nav', {");
    expect(source).toContain("include('../sysbo/entry/shell/metadata-component', {");
    expect(source).toContain("include('../sysbo/entry/fields/entity-field', {");
    expect(source).toContain("include('../sysbo/entry/shell/save-split-action', {");
    expect(tabsNav).toContain('for (let tabIndex = 0; tabIndex < tabs.length; tabIndex += 1)');
    expect(saveSplit).toContain('data-form-save');

    const reusableRendererSource = `${tabsNav}\n${metadataComponent}\n${entityField}\n${saveSplit}`;
    expect(reusableRendererSource).not.toMatch(
      /SysUsers|SysPrincipals|SysExtAuthProviders|SysLicenses/,
    );
  });
});
