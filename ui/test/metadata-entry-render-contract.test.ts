import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const entryTemplatePath = resolve(testDirectory, '../views/pages/sysbo/entry.ejs');

describe('metadata-driven entry render contract', () => {
  it('passes canonical compiled entity metadata explicitly to field components', async () => {
    const source = await readFile(entryTemplatePath, 'utf8');
    const tabContent = await readFile(
      resolve(testDirectory, '../views/components/sysbo/entry/shell/entry-tab-content.ejs'),
      'utf8',
    );

    expect(source).toMatch(
      /const\s+compiledEntityMetadata\s*=\s*compiledEntityContext\?\.metadata\s*\|\|\s*\{\}/,
    );
    expect(source).toMatch(
      /const\s+fieldComponentContext\s*=\s*\{[\s\S]*?\bcompiledEntityMetadata\b[\s\S]*?\};/,
    );
    expect(tabContent).toMatch(
      /include\(['"]\.\.\/fields\/form-field['"],\s*\{\s*\.\.\.fieldComponentContext/,
    );
  });
  it('keeps the split Debugging panel data contract in sync with its partial', async () => {
    const source = await readFile(entryTemplatePath, 'utf8');
    const panel = await readFile(
      resolve(testDirectory, '../views/components/debugging/debugging-panel.ejs'),
      'utf8',
    );

    expect(source).toContain('buildMetadataDebuggingModel({');
    expect(source).toContain('entityDebuggingDisplayRows, uiDebuggingDisplayRows');
    const tabContent = await readFile(
      resolve(testDirectory, '../views/components/sysbo/entry/shell/entry-tab-content.ejs'),
      'utf8',
    );
    expect(source).toContain("include('../../components/sysbo/entry/shell/entry-tab-content', {");
    expect(tabContent).toMatch(
      /include\(['"]\.\.\/\.\.\/\.\.\/debugging\/debugging-panel['"],\s*\{[\s\S]*?entityDebuggingDisplayRows,[\s\S]*?uiDebuggingDisplayRows,[\s\S]*?debugElementNameParts,[\s\S]*?debuggingEntityKey:\s*definition\.key,[\s\S]*?debuggingCsrfToken:\s*csrfToken[\s\S]*?\}\)/,
    );
    expect(panel).toContain('rows: entityDebuggingDisplayRows || []');
    expect(panel).toContain('rows: uiDebuggingDisplayRows || []');
  });

  it('keeps the entry shell decomposed into entity-agnostic renderer partials', async () => {
    const source = await readFile(entryTemplatePath, 'utf8');
    const tabsNav = await readFile(
      resolve(testDirectory, '../views/components/sysbo/entry/shell/entry-tabs-nav.ejs'),
      'utf8',
    );
    const tabContent = await readFile(
      resolve(testDirectory, '../views/components/sysbo/entry/shell/entry-tab-content.ejs'),
      'utf8',
    );
    const actionsFooter = await readFile(
      resolve(testDirectory, '../views/components/sysbo/entry/shell/entry-actions-footer.ejs'),
      'utf8',
    );
    const commandForms = await readFile(
      resolve(testDirectory, '../views/components/sysbo/entry/shell/entry-command-forms.ejs'),
      'utf8',
    );

    expect(source).toContain(
      "include('../../components/sysbo/entry/shell/entry-tabs-nav', { tabs, activeTabId })",
    );
    expect(source).toContain("include('../../components/sysbo/entry/shell/entry-tab-content', {");
    expect(source).toContain(
      "include('../../components/sysbo/entry/shell/entry-actions-footer', {",
    );
    expect(source).toContain("include('../../components/sysbo/entry/shell/entry-command-forms', {");
    expect(tabsNav).toContain('for (let tabIndex = 0; tabIndex < tabs.length; tabIndex += 1)');
    expect(actionsFooter).toContain("include('save-split-action', { saveAction, actionClass })");
    expect(commandForms).toContain('metadata-command-<%= actionKey %>');

    // Renderer decomposition must remain generic: entity names belong in metadata,
    // never in reusable entry-shell presentation components.
    const reusableRendererSource = `${tabsNav}\n${tabContent}\n${actionsFooter}\n${commandForms}`;
    expect(reusableRendererSource).not.toMatch(
      /SysUsers|SysPrincipals|SysExtAuthProviders|SysLicenses/,
    );
  });
});
