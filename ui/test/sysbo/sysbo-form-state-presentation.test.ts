import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { sourceWithoutWhitespace } from '../support/source-contract.js';

const testDirectory = dirname(fileURLToPath(import.meta.url));

describe('generic SysBO form state presentation', () => {
  it('loads focused form runtimes instead of the former forms.js monolith', async () => {
    const shell = await readFile(resolve(testDirectory, '../../views/layout/shell.ejs'), 'utf8');
    const expected = [
      '/js/auth/auth-form.js',
      '/js/sysbo/entry/state.js',
      '/js/sysbo/entry/field-state.js',
      '/js/sysbo/entry/save.js',
      '/js/sysbo/entry/focus.js',
      '/js/configuration/form.js',
      '/js/popups/popup-runtime.js',
    ];

    for (const runtime of expected) expect(shell).toContain(runtime);
    expect(shell).not.toContain('/js/forms.js');

    const entryState = await readFile(
      resolve(testDirectory, '../../public/js/sysbo/entry/state.js'),
      'utf8',
    );
    const entryFieldState = await readFile(
      resolve(testDirectory, '../../public/js/sysbo/entry/field-state.js'),
      'utf8',
    );
    const entrySave = await readFile(
      resolve(testDirectory, '../../public/js/sysbo/entry/save.js'),
      'utf8',
    );
    const entryFocus = await readFile(
      resolve(testDirectory, '../../public/js/sysbo/entry/focus.js'),
      'utf8',
    );

    expect(entryState).toContain(
      'Canonical SysBO form-state baseline + dirty navigation protection',
    );
    expect(entryState).toContain('Generic SysBO Save-button state');
    expect(entryFieldState).toContain('Metadata-driven per-field change highlighting');
    expect(entrySave).toContain('Metadata-driven in-place Save');
    expect(entryFocus).toContain('Metadata-driven entry initial focus');
  });

  it('starts the shared Save button disabled and marks it for generic state management', async () => {
    const metadataSource = await readFile(
      resolve(testDirectory, '../../views/components/runtime/entity-entry.ejs'),
      'utf8',
    );
    const saveActionSource = await readFile(
      resolve(testDirectory, '../../views/components/sysbo/entry/shell/save-split-action.ejs'),
      'utf8',
    );
    expect(metadataSource).toContain("include('../sysbo/entry/shell/save-split-action'");
    expect(saveActionSource).toContain('data-form-save');
    expect(saveActionSource).toContain('data-form-save-menu-toggle');
    expect(saveActionSource).toContain('data-form-save-option');
    expect(saveActionSource).toContain('disabled');
    // The dirty-guard attribute must be emitted as actual markup, not through
    // EJS escaped interpolation. Escaped quotes become part of the attribute
    // value ("true"), so entry-state runtime cannot match [data-dirty-guard="true"].
    expect(metadataSource).toContain('<% if (!isViewMode) { %>data-dirty-guard="true"<% } %>');
    expect(metadataSource).not.toContain(`<%= isViewMode ? '' : 'data-dirty-guard="true"' %>`);
    expect(metadataSource).toContain('data-record-mode="<%= recordMode %>"');
    expect(metadataSource).toContain('data-form-state-indicator');
    expect(metadataSource).toContain('data-form-state-text');
  });

  it('uses reversible dirty state and requires current form validity before enabling Save', async () => {
    const source = await readFile(
      resolve(testDirectory, '../../public/js/sysbo/entry/state.js'),
      'utf8',
    );
    expect(source).toContain('window.manatosSysBOFormState = state');
    expect(source).toContain('isDirty: () =>');
    expect(source).toContain('isValid: () => form.checkValidity()');
    expect(source).toContain('const dirty = () => state.isDirty()');
    expect(source).not.toContain('manatosUserDirty');
    expect(source).not.toContain('latchUserDirty');
    expect(source).toContain('const formDataChanged = sharedState.baseline !== null');
    expect(sourceWithoutWhitespace(source)).toContain(
      sourceWithoutWhitespace('const valid = typeof sharedState.isValid'),
    );
    expect(source).toContain('const aggregatePolicy = calculateEntryAggregatePolicy({');
    expect(source).toContain('fieldDirty: changed');
    expect(source).toContain('fieldValid: valid && credentialStateAllowsSave');
    expect(source).toContain('blocked: internalEditing');
    expect(source).toContain('const saveDisabled = !aggregatePolicy.saveReady');
    expect(source).toContain('saveButtons.forEach((button) =>');
    expect(source).toContain('button.disabled = saveDisabled');
    expect(source).toContain(`[data-entry-child-editor][data-child-editor-active="true"]`);
    expect(source).toContain('state.internalEditing');
    expect(source).toContain('state.internalEditorCount');
    expect(source).toContain('manatos:child-editor-state');
    expect(source).toContain("indicatorText.textContent = 'Unsaved changes · incomplete'");
    expect(source).toContain("indicatorText.textContent = 'Unsaved changes'");
    expect(source).toContain("form.addEventListener('input', scheduleUpdate)");
    expect(source).toContain("form.addEventListener('change', scheduleUpdate)");
  });

  it('keeps provider credential tools screen-local and carries an ephemeral proof into Save', async () => {
    const source = await readFile(
      resolve(testDirectory, '../../public/js/auth/external-provider.js'),
      'utf8',
    );
    expect(source).toContain("credentialState.value = 'required'");
    expect(source).toContain('data-provider-test-credentials');
    expect(source).toContain('dataset.providerTestUrl');
    expect(source).toContain("body.set('clientId', clientId.value.trim())");
    expect(source).toContain("body.set('clientSecret', clientSecret.value)");
    expect(source).toContain("credentialAction.value = 'replace'");
    expect(source).toContain("credentialAction.value = 'remove'");
    // Verify communicates with the provider but never persists or reloads the entry.
    expect(sourceWithoutWhitespace(source)).toContain(
      sourceWithoutWhitespace("window.open('', 'manatos-provider-credential-test'"),
    );
    expect(source).toContain("result.type !== 'manatos:provider-credential-test-result'");
    expect(source).toContain('payload.statusUrl');
    expect(source).toContain('const pollStatus = async () =>');
    expect(source).toContain('POPUP_CLOSE_SETTLEMENT_MS = 5000');
    expect(source).toContain('popupClosedAt ??= Date.now()');
    expect(source).toContain('CREDENTIAL_TEST_SETTLE_POLL_MS');
    expect(source).toContain("window.addEventListener('message', providerReturnHandler)");
    expect(source).toContain('window.manatosBusy?.show');
    expect(source).toContain('verificationProof.value = statusPayload.verificationProofId');
    expect(source).not.toContain("url.searchParams.set('credentialsTest'");
    expect(source).not.toContain('window.manatosAllowDirtyPageExit?.()');
    expect(source).toContain('const noReturnMessage = () =>');
    // Provider failure guidance is intentionally generic here. Provider-specific
    // wording belongs in provider definitions, never in the compound runtime.
    expect(source).toContain(
      'confirm the provider application is active and available to this account',
    );
    expect(source).not.toContain('If it shows “App not active”');
    expect(source).not.toContain('activate the Meta app or use an account that has an app role');
  });

  it('marks every tab with no editable fields as an informational read-only pane', async () => {
    const tabContentSource = await readFile(
      resolve(testDirectory, '../../views/components/sysbo/entry/shell/entry-tab-content.ejs'),
      'utf8',
    );
    expect(tabContentSource).toContain("const readOnlyTab = tab.layout === 'summary'");
    expect(tabContentSource).toContain('entity-readonly-tab');
    expect(tabContentSource).toContain('data-readonly-tab="true"');
    expect(tabContentSource).toContain('fieldEditable(field)');
    expect(tabContentSource).not.toContain('isNew && !tabHasEditableFields');
  });

  it('shows generated System details in create mode so the read-only tab remains visible', async () => {
    const apiMetadata = await readFile(
      resolve(testDirectory, '../../../shared/src/metadata/ui/common.ts'),
      'utf8',
    );
    const systemTabStart = apiMetadata.indexOf('const systemTab');
    const systemTabEnd = apiMetadata.indexOf('const systemFieldOverrides', systemTabStart);
    const systemTabSource = apiMetadata.slice(systemTabStart, systemTabEnd);
    expect(systemTabSource).toContain("'System details'");
    expect(systemTabSource).toContain("layout: 'summary'");
    expect(systemTabSource).not.toContain("mode !== 'create'");
  });

  it('adds a development-only read-only Debugging tab with live formula values', async () => {
    const metadataSource = await readFile(
      resolve(testDirectory, '../../views/components/runtime/entity-entry.ejs'),
      'utf8',
    );
    const commonUiMetadataSource = await readFile(
      resolve(testDirectory, '../../../shared/src/metadata/ui/common.ts'),
      'utf8',
    );
    const debuggingModelSource = await readFile(
      resolve(testDirectory, '../../src/presentation/metadata/debugging-model.ts'),
      'utf8',
    );
    const debuggingPanelSource = await readFile(
      resolve(testDirectory, '../../views/components/debugging/debugging-panel.ejs'),
      'utf8',
    );
    const runtimeSource = await readFile(
      resolve(testDirectory, '../../public/js/sysbo/entry/form-runtime.js'),
      'utf8',
    );
    const entryPolicyRuntimeSource = await readFile(
      resolve(testDirectory, '../../public/js/runtime/entry-policy-runtime.js'),
      'utf8',
    );
    const expressionFormatSource = await readFile(
      resolve(testDirectory, '../../public/js/debugger/expression-format.js'),
      'utf8',
    );

    // Canonical metadata declares the Debugging component, while the UI server
    // capability-gates only an inert template and the browser composes the live tab.
    expect(commonUiMetadataSource).toContain("tab('debugging', 'Debugging'");
    expect(commonUiMetadataSource).toContain("layout: 'debug-calculations'");
    expect(metadataSource).toContain('Boolean(app?.ui?.debugTools)');
    expect(metadataSource).toContain('data-v2-developer-debugging-tab-template');
    expect(metadataSource).not.toContain("visibleTabs.some((tab) => tab.id === 'debugging')");
    expect(entryPolicyRuntimeSource).toContain('installDeveloperDebuggingTab');
    expect(entryPolicyRuntimeSource).toContain('[data-v2-developer-debugging-tab-template]');
    expect(debuggingPanelSource).toContain('Element name');
    expect(debuggingPanelSource).toContain('Calculation formula');
    expect(debuggingPanelSource).toContain('Current value');
    // The reusable TypeScript builder owns Debugging inventory semantics; the
    // entry renderer only recognizes the already-injected effective metadata tab
    // and renders the resulting model.
    expect(metadataSource).toContain('buildMetadataDebuggingModel({');
    expect(debuggingModelSource).toContain("'ENTITY'");
    expect(debuggingModelSource).toContain("'ENTITY FIELDS'");
    expect(debuggingModelSource).toContain("'FIELD CALCULATIONS'");
    expect(debuggingModelSource).toContain("'DECLARED FIELDS'");
    expect(debuggingModelSource).toContain("'INHERITED FIELDS'");
    // Renderable calculated fields are canonical fieldDefinition entries;
    // the normalized model has no parallel UI-defined field catalogue.
    expect(debuggingModelSource).not.toContain("'UI-DEFINED FIELDS'");
    expect(debuggingModelSource).toContain("'FIELD OTHER'");
    expect(debuggingModelSource).toContain("'RELATED ENTITY'");
    expect(debuggingModelSource).toContain("'UI'");
    expect(debuggingModelSource).toContain("'TABS'");
    expect(debuggingModelSource).toContain("'RELATED'");
    expect(debuggingModelSource).toContain("'ACTIONS'");
    expect(debuggingModelSource).not.toContain("'UI · related'");

    // Repeated metadata path prefixes are grouped dynamically rather than by
    // SysUser-specific names. Single-child prefixes remain collapsed.
    expect(debuggingModelSource).toContain('const commonPrefixLength');
    expect(debuggingModelSource).toContain('appendDebugNameTree');
    expect(debuggingModelSource).toContain("row.name.split('.').filter(Boolean)");
    expect(debuggingPanelSource).toContain('debugging-calculation-path-category');
    expect(debuggingPanelSource).toContain('debugging-calculation-detail-category');

    expect(debuggingModelSource.indexOf("'TABS'")).toBeLessThan(
      debuggingModelSource.indexOf("'FIELDS',"),
    );
    expect(debuggingPanelSource).toContain('data-debug-calculation-ast');
    expect(debuggingPanelSource).toContain('data-debug-expression');
    expect(expressionFormatSource).toContain('window.ManatOSDebugExpression');
    expect(expressionFormatSource).toContain('const systemRoots = new Set');
    expect(expressionFormatSource).toContain("emit(identifier, 'path')");
    expect(expressionFormatSource).toContain("systemRoots.has(identifier) ? 'system' : 'field'");
    expect(expressionFormatSource).toContain('debug-expression-${tokenClass}');
    expect(debuggingModelSource).toContain(
      "`[ ${value.map((entry) => debugValueText(entry)).join(', ')} ]`",
    );
    expect(runtimeSource).toContain("`[ ${value.map(debugValueText).join(', ')} ]`");
    expect(metadataSource).toContain('debugElementNameParts');
    expect(debuggingPanelSource).toContain('debugging-element-prefix');
    expect(debuggingPanelSource).toContain('debugging-element-leaf');
    expect(debuggingModelSource).toContain("if (value === null) return 'null'");
    expect(runtimeSource).toContain("if (value === null) return 'null'");
    expect(debuggingModelSource).toContain(`if (value === '') return "''"`);
    expect(runtimeSource).toContain(`if (value === '') return "''"`);
    expect(debuggingModelSource).toContain("typeof value === 'string'");
    expect(runtimeSource).toContain("typeof value === 'string'");
    expect(debuggingModelSource).toContain("return `'${value.replaceAll");
    expect(runtimeSource).toContain("return `'${value.replaceAll");
    expect(debuggingModelSource).toContain('Array.isArray(scope)');
    expect(debuggingModelSource).toContain('rows,');
    expect(debuggingModelSource).toContain('Array.isArray(scope) ? null');
    expect(runtimeSource).toContain("kind: 'debug-value'");
    expect(runtimeSource).toContain("cell.getAttribute('data-debug-calculation-ast')");
    expect(runtimeSource).toContain('rawAst ? JSON.parse(rawAst) : null');
    expect(runtimeSource).toContain('dependencyPaths: expressionDependencyPaths(ast)');
  });

  it('keeps read-only and formula syntax colors in the Preferences theme surface', async () => {
    const themeSource = await readFile(
      resolve(testDirectory, '../../public/css/theme.css'),
      'utf8',
    );
    const uiSource = await readFile(resolve(testDirectory, '../../public/css/ui.css'), 'utf8');

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

  it('focuses only inside the already-active tab and never overrides navigation', async () => {
    const formsSource = await readFile(
      resolve(testDirectory, '../../public/js/sysbo/entry/focus.js'),
      'utf8',
    );
    expect(formsSource).toContain('focusInitialEditableField');
    expect(formsSource).toContain('.entity-tab-content > .tab-pane.active');
    expect(formsSource).toContain('editableControlIn(activePane)');
    expect(formsSource).not.toContain('bootstrap.Tab.getOrCreateInstance');
    expect(formsSource).toContain('targetControl.focus({ preventScroll: true })');
  });

  it('normalizes absent optional related fields before related expression evaluation', async () => {
    const metadataSource = await readFile(
      resolve(testDirectory, '../../views/components/runtime/entity-entry.ejs'),
      'utf8',
    );
    const debuggingModelSource = await readFile(
      resolve(testDirectory, '../../src/presentation/metadata/debugging-model.ts'),
      'utf8',
    );
    const entryPolicySource = await readFile(
      resolve(testDirectory, '../../public/js/runtime/entry-policy-runtime.js'),
      'utf8',
    );
    expect(metadataSource).toContain('const relatedExpressionScope = (row, relatedMetadata) =>');
    expect(metadataSource).toContain('Object.fromEntries(missingKeys.map((key) => [key, null]))');
    expect(debuggingModelSource).toContain(
      'const expressionScopes = rows.map((row) => relatedExpressionScope(row, relatedMetadata));',
    );
    expect(entryPolicySource).toContain(
      '(Array.isArray(scopeKeys) ? scopeKeys : []).map((key) => [String(key), null])',
    );
    expect(entryPolicySource).toContain(
      "Object.assign(scope, row && typeof row === 'object' ? row : {});",
    );
  });

  it('keeps rich enum backing selects out of initial focus and separates date-only from datetime browser controls', async () => {
    const forms = await readFile(
      resolve(testDirectory, '../../public/js/sysbo/entry/focus.js'),
      'utf8',
    );
    const entry = await readFile(
      resolve(testDirectory, '../../views/components/runtime/entity-entry.ejs'),
      'utf8',
    );
    const dateField = await readFile(
      resolve(testDirectory, '../../views/components/sysbo/entry/fields/date-field.ejs'),
      'utf8',
    );
    const datetimeField = await readFile(
      resolve(testDirectory, '../../views/components/sysbo/entry/fields/datetime-field.ejs'),
      'utf8',
    );

    expect(forms).toContain(
      'select:not([disabled]):not(.visually-hidden):not([aria-hidden="true"])',
    );
    expect(forms).toContain('[data-metadata-enum-toggle]:not([disabled])');
    expect(entry).toContain('const dateOnlyValue = (value) =>');
    expect(entry).toContain('const datetimeLocalValue = (value) =>');
    expect(dateField).toContain('dateOnlyValue(value)');
    expect(dateField).toContain('type="date"');
    expect(datetimeField).toContain('datetimeLocalValue(value)');
    expect(datetimeField).toContain('type="datetime-local"');
  });

  it('uses Close for a clean entry and Cancel whenever the shared page transaction is dirty or internally editing', async () => {
    const renderer = await readFile(
      resolve(testDirectory, '../../views/components/runtime/entity-entry.ejs'),
      'utf8',
    );
    const forms = await readFile(
      resolve(testDirectory, '../../public/js/sysbo/entry/state.js'),
      'utf8',
    );

    expect(renderer).toContain('data-form-close-cancel');
    expect(renderer).toContain('data-form-close-cancel-label');
    expect(forms).toContain(
      "closeCancelLabel.textContent = changed || internalEditing ? 'Cancel' : 'Close'",
    );
    expect(forms).toContain("changed || internalEditing ? 'Cancel editing' : 'Close entry'");
    expect(forms).toContain('let node = runtime?.value?.ui?.level');
    expect(forms).toContain("path += '.level'");
    expect(forms).toContain("pagePath === 'ctx.ui.level'");
    expect(forms).toContain('state.blocked');
  });

  it('captures the initial dirty baseline after component initialization scripts settle', async () => {
    const source = await readFile(
      resolve(testDirectory, '../../public/js/sysbo/entry/state.js'),
      'utf8',
    );
    expect(source).toContain("form.dataset.metadataFormInitialized === 'true'");
    expect(source).toContain("'manatos:form-initialized'");
    expect(source).toContain("'load'");
    expect(source).toContain('captureWhenInitialized');
  });
});
