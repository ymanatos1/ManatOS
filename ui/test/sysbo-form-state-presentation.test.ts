import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const testDirectory = dirname(fileURLToPath(import.meta.url));

describe('generic SysBO form state presentation', () => {
  it('starts the shared Save button disabled and marks it for generic state management', async () => {
    const legacySource = await readFile(resolve(testDirectory, '../views/pages/bo-edit.ejs'), 'utf8');
    const metadataSource = await readFile(resolve(testDirectory, '../views/pages/metadata-driven/bo-entry-metadata.ejs'), 'utf8');
    expect(legacySource).toContain('data-form-save disabled');
    expect(metadataSource).toContain('data-form-save');
    expect(metadataSource).toContain('disabled');
    // The dirty-guard attribute must be emitted as actual markup, not through
    // EJS escaped interpolation. Escaped quotes become part of the attribute
    // value (\"true\"), so forms.js cannot match [data-dirty-guard=\"true\"].
    expect(metadataSource).toContain('<% if (!isViewMode) { %>data-dirty-guard=\"true\"<% } %>');
    expect(metadataSource).not.toContain(`<%= isViewMode ? '' : 'data-dirty-guard=\"true\"' %>`);
    expect(metadataSource).toContain('data-record-mode="<%= recordMode %>"');
    expect(metadataSource).toContain('data-form-state-indicator');
    expect(metadataSource).toContain('data-form-state-text');
  });

  it('uses reversible dirty state and requires current form validity before enabling Save', async () => {
    const source = await readFile(resolve(testDirectory, '../public/js/forms.js'), 'utf8');
    expect(source).toContain('window.manatosSysBOFormState = state');
    expect(source).toContain('isDirty: () =>');
    expect(source).toContain('isValid: () => form.checkValidity()');
    expect(source).toContain('const dirty = () => state.isDirty()');
    expect(source).not.toContain('manatosUserDirty');
    expect(source).not.toContain('latchUserDirty');
    expect(source).toContain('const formDataChanged = sharedState.baseline !== null');
    expect(source).toContain('const valid = typeof sharedState.isValid');
    expect(source).toContain('save.disabled = !(changed && valid && credentialStateAllowsSave)');
    expect(source).toContain("indicatorText.textContent = 'Unsaved changes · incomplete'");
    expect(source).toContain("indicatorText.textContent = 'Unsaved changes'");
    expect(source).toContain("form.addEventListener('input', scheduleUpdate)");
    expect(source).toContain("form.addEventListener('change', scheduleUpdate)");
  });

  it('allows a complete external-provider credential pair to be stored before verification and supports later testing', async () => {
    const source = await readFile(resolve(testDirectory, '../public/js/forms.js'), 'utf8');
    expect(source).toContain("credentialState.value = 'required'");
    expect(source).toContain('data-provider-test-credentials');
    expect(source).toContain('dataset.providerTestUrl');
    expect(source).toContain('body.set(\'clientId\', clientId.value.trim())');
    expect(source).toContain('body.set(\'clientSecret\', clientSecret.value)');
    expect(source).toContain('providerEnabled || anyCredentialValue');
    expect(source).toContain('Credential verification is deliberately not a prerequisite for');
    expect(source).toContain("testCredentials.dataset.providerTestStored === 'true'");
    expect(source).toContain("window.open('', 'manatos-provider-credential-test'");
    expect(source).toContain("result.type !== 'manatos:provider-credential-test-result'");
    expect(source).toContain('payload.statusUrl');
    expect(source).toContain('const pollStatus = async () =>');
    expect(source).toContain('window.manatosBusy?.show');
    expect(source).toContain("url.searchParams.set('tab', 'secrets')");
    expect(source).toContain('window.manatosAllowDirtyPageExit?.()');
    expect(source).toContain('const noReturnMessage = () =>');
    expect(source).toContain('If it shows “App not active”');
    expect(source).toContain('activate the Meta app or use an account that has an app role');
  });

  it('marks every tab with no editable fields as an informational read-only pane', async () => {
    const metadataSource = await readFile(resolve(testDirectory, '../views/pages/metadata-driven/bo-entry-metadata.ejs'), 'utf8');
    expect(metadataSource).toContain("const readOnlyTab = tab.layout === 'summary'");
    expect(metadataSource).toContain("entity-readonly-tab");
    expect(metadataSource).toContain("data-readonly-tab=\"true\"");
    expect(metadataSource).toContain("fieldEditable(field)");
    expect(metadataSource).not.toContain("isNew && !tabHasEditableFields");
  });


  it('shows generated System details in create mode so the read-only tab remains visible', async () => {
    const apiMetadata = await readFile(resolve(testDirectory, '../../api/src/metadata/sysbo-ui-definitions.ts'), 'utf8');
    const systemTabStart = apiMetadata.indexOf('const systemTab');
    const systemTabEnd = apiMetadata.indexOf('const systemFieldOverrides', systemTabStart);
    const systemTabSource = apiMetadata.slice(systemTabStart, systemTabEnd);
    expect(systemTabSource).toContain("'System details'");
    expect(systemTabSource).toContain("layout: 'summary'");
    expect(systemTabSource).not.toContain("mode !== 'create'");
  });


  it('adds a development-only read-only Debugging tab with live formula values', async () => {
    const metadataSource = await readFile(resolve(testDirectory, '../views/pages/metadata-driven/bo-entry-metadata.ejs'), 'utf8');
    const formsSource = await readFile(resolve(testDirectory, '../public/js/forms.js'), 'utf8');
    const expressionFormatSource = await readFile(resolve(testDirectory, '../public/js/debugger/expression-format.js'), 'utf8');

    expect(metadataSource).toContain("const debuggingTabEnabled = Boolean(app?.ui?.debugTools)");
    expect(metadataSource).toContain("label: 'Debugging'");
    expect(metadataSource).toContain("layout: 'debug-calculations'");
    expect(metadataSource).toContain('Element name');
    expect(metadataSource).toContain('Calculation formula');
    expect(metadataSource).toContain('Current value');
    expect(metadataSource).toContain("'ENTITY'");
    expect(metadataSource).toContain("'ENTITY FIELDS'");
    expect(metadataSource).toContain("'FIELD VALUES'");
    expect(metadataSource).toContain("'DECLARED FIELDS'");
    expect(metadataSource).toContain("'INHERITED FIELDS'");
    expect(metadataSource).toContain("'UI-DEFINED FIELDS'");
    expect(metadataSource).toContain("'FIELD OTHER'");
    expect(metadataSource).toContain("'RELATED ENTITY'");
    expect(metadataSource).toContain("'UI'");
    expect(metadataSource).toContain("'TABS'");
    expect(metadataSource).toContain("'RELATED'");
    expect(metadataSource).toContain("'ACTIONS'");
    expect(metadataSource).not.toContain("'UI · related'");

    // Repeated metadata path prefixes are grouped dynamically rather than by
    // SysUser-specific names. Single-child prefixes remain collapsed.
    expect(metadataSource).toContain('const commonPrefixLength');
    expect(metadataSource).toContain('appendDebugNameTree');
    expect(metadataSource).toContain("row.name.split('.').filter(Boolean)");
    expect(metadataSource).toContain('debugging-calculation-path-category');
    expect(metadataSource).toContain('debugging-calculation-detail-category');

    expect(metadataSource.indexOf("'TABS'")).toBeLessThan(metadataSource.indexOf("'FIELDS',"));
    expect(metadataSource).toContain('data-debug-calculation-ast');
    expect(metadataSource).toContain('data-debug-expression');
    expect(expressionFormatSource).toContain('window.ManatOSDebugExpression');
    expect(expressionFormatSource).toContain('const systemRoots = new Set');
    expect(expressionFormatSource).toContain("emit(identifier, 'path')");
    expect(expressionFormatSource).toContain("systemRoots.has(identifier) ? 'system' : 'field'");
    expect(expressionFormatSource).toContain('debug-expression-${tokenClass}');
    expect(metadataSource).toContain("`[ ${value.map((entry) => debugValueText(entry)).join(', ')} ]`");
    expect(formsSource).toContain("`[ ${value.map(debugValueText).join(', ')} ]`");
    expect(metadataSource).toContain('debugElementNameParts');
    expect(metadataSource).toContain('debugging-element-prefix');
    expect(metadataSource).toContain('debugging-element-leaf');
    expect(metadataSource).toContain("typeof value === 'string'");
    expect(formsSource).toContain("typeof value === 'string'");
    expect(metadataSource).toContain("return `'${value.replaceAll");
    expect(formsSource).toContain("return `'${value.replaceAll");
    expect(metadataSource).toContain('Array.isArray(scope)');
    expect(metadataSource).toContain('rows,');
    expect(metadataSource).toContain('Array.isArray(scope) ? null');
    expect(formsSource).toContain("kind: 'debug-value'");
    expect(formsSource).toContain("parseAst(cell, 'data-debug-calculation-ast')");
    expect(formsSource).toContain('dependencyPaths: expressionDependencyPaths(ast)');
  });


  it('keeps read-only and formula syntax colors in the Preferences theme surface', async () => {
    const themeSource = await readFile(resolve(testDirectory, '../public/css/theme.css'), 'utf8');
    const uiSource = await readFile(resolve(testDirectory, '../public/css/ui.css'), 'utf8');

    expect(themeSource).toContain('--manatos-readonly-field-bg');
    expect(themeSource).toContain('--manatos-readonly-tab-bg');
    expect(themeSource).toContain('--manatos-debug-field');
    expect(themeSource).toContain('--manatos-debug-system: #4ec9b0');
    expect(themeSource).toContain('--manatos-debug-field: #569cd6');
    expect(themeSource).toContain('--manatos-debug-path: #7f7f7f');
    expect(themeSource).toContain('--manatos-debug-string');
    expect(themeSource).toContain("body[data-ui-theme='lighter']");
    expect(uiSource).toContain('background: var(--manatos-readonly-tab-bg)');
    expect(uiSource).toContain('background-color: var(--manatos-readonly-field-bg)');
    expect(uiSource).toContain('.debugging-formula .debug-expression-field');
    expect(uiSource).toContain('.debugging-formula .debug-expression-system');
    expect(uiSource).toContain('.debugging-formula .debug-expression-path');
    expect(uiSource).toContain('.debugging-element-name');
    expect(uiSource).toContain('.debugging-element-prefix');
    expect(uiSource).toContain('.debugging-element-leaf');
    expect(uiSource).toContain('font-weight: 700');
    expect(uiSource).toContain('color: var(--bs-body-color) !important');
    expect(uiSource).toContain('.entity-tab-content > .tab-pane.active');
    expect(uiSource).toContain('border: 1px solid var(--manatos-border)');
  });

  it('focuses the first editable field and skips informational tabs when necessary', async () => {
    const formsSource = await readFile(resolve(testDirectory, '../public/js/forms.js'), 'utf8');
    expect(formsSource).toContain('focusInitialEditableField');
    expect(formsSource).toContain('editableControlIn(firstPane)');
    expect(formsSource).toContain('for (const pane of panes.slice(1))');
    expect(formsSource).toContain('bootstrap.Tab.getOrCreateInstance(tabButton).show()');
    expect(formsSource).toContain('targetControl.focus({ preventScroll: true })');
  });

  it('normalizes absent optional related fields before related expression evaluation', async () => {
    const metadataSource = await readFile(resolve(testDirectory, '../views/pages/metadata-driven/bo-entry-metadata.ejs'), 'utf8');
    expect(metadataSource).toContain('const relatedExpressionScope = (row, relatedMetadata) =>');
    expect(metadataSource).toContain('for (const key of missingKeys) row[key] = null;');
    expect(metadataSource).toContain('const expressionScope = relatedExpressionScope(row, relatedMetadata);');
    expect(metadataSource).toContain('const expressionScopes = rows.map((row) => relatedExpressionScope(row, relatedMetadata));');
  });

});
