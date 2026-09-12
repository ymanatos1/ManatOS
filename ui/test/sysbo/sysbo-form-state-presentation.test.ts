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
    expect(source).not.toContain("Symbol.for('ManatOS.SysBO.EntryFormState')");
    expect(source).toContain("form.addEventListener('manatos:form-contributor-register'");
    expect(source).not.toContain('window.manatosSysBOFormState');
    expect(source).not.toContain('window.manatosRetry');
    expect(source).not.toContain('window.manatosAllowDirtyPageExit');
    expect(source).toContain("window.addEventListener('manatos:retry-request'");
    expect(source).not.toContain("state.setContributor('posted-private-controls'");
    expect(source).toContain('contributorState,');
    expect(source).toContain('calculateEntryContributorAggregate(states)');
    expect(source).toContain('isContributorDirty: () => contributorState().dirty');
    expect(source).toContain('isDirty: () => state.isFieldDirty() || state.isContributorDirty()');
    expect(source).not.toContain('data-provider-pending-credential-save');
    expect(source).not.toContain('pendingCredentialSave');
    expect(source).toContain('isFieldValid: fieldValid');
    expect(sourceWithoutWhitespace(source)).toContain(
      sourceWithoutWhitespace(
        "const hasPendingWork = () => document.documentElement.dataset.manatosSystemUnavailable !== 'true' && (state.isDirty() || state.contributorState().blocked)",
      ),
    );
    expect(source).not.toContain('manatosUserDirty');
    expect(source).not.toContain('latchUserDirty');
    expect(source).not.toContain('const contributorSnapshot = () =>');
    expect(source).not.toContain('[data-form-state-contributor="true"][name]');
    expect(source).toContain('isFieldDirty: fieldDirty');
    expect(source).toContain('isContributorDirty: () =>');
    expect(sourceWithoutWhitespace(source)).toContain(
      sourceWithoutWhitespace('const fieldValid = typeof sharedState.isFieldValid'),
    );
    expect(source).toContain('const fieldDirty =');
    expect(source).toContain('const aggregateContributorState =');
    expect(source).toContain('const contributorDirty = aggregateContributorState.dirty === true');
    expect(source).toContain('const contributorValid = aggregateContributorState.valid !== false');
    expect(source).toContain('const aggregatePolicy = calculateEntryAggregatePolicy({');
    expect(source).toContain('fieldDirty,');
    expect(source).toContain('fieldValid,');
    expect(source).toContain('contributorDirty,');
    expect(source).toContain('contributorValid,');
    expect(source).toContain('blocked,');
    expect(source).toContain('const changed = aggregatePolicy.dirty');
    expect(source).toContain('const valid = aggregatePolicy.valid');
    expect(source.indexOf('const changed = aggregatePolicy.dirty')).toBeLessThan(
      source.indexOf('closeCancelLabel.textContent = changed || blocked'),
    );
    expect(source).not.toContain('credentialStateAllowsSave');
    expect(source).toContain('const saveDisabled = initializing || !aggregatePolicy.saveReady');
    expect(source).toContain("? 'Entry initialization is still completing.'");
    expect(source).toContain('saveButtons.forEach((button) =>');
    expect(source).toContain('button.disabled = saveDisabled');
    expect(source).not.toContain(`[data-entry-child-editor][data-child-editor-active="true"]`);
    expect(source).not.toContain('state.internalEditing');
    expect(source).not.toContain('state.internalEditorCount');
    expect(source).not.toContain('const internalEditing');
    expect(source).not.toContain('const internalEditorCount');
    expect(source).not.toContain('manatos:child-editor-state');
    expect(source).toContain("form.dispatchEvent(new Event('manatos:form-state-ready'");
    expect(source).toContain(
      "form.addEventListener('manatos:form-contributor-state', scheduleUpdate)",
    );
    expect(source).not.toContain('Local draft restored');
    expect(source).toContain("indicatorText.textContent = 'Unsaved changes · incomplete'");
    expect(source).toContain("indicatorText.textContent = 'Unsaved changes'");
    expect(source).toContain("form.addEventListener('input', scheduleUpdate)");
    expect(source).toContain("form.addEventListener('change', scheduleUpdate)");
    expect(source).toContain('const owningEntryPagePath = (() => {');
    expect(source).toContain('const entryPagePath = (() => {');
    expect(source).toContain('const pagePath = entryPagePath;');
    expect(source).not.toContain('const leafPagePath = () =>');
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
    expect(source).toContain('window.ManatOS?.busy?.show');
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
    expect(debuggingPanelSource).not.toContain('data-debug-calculation-ast');
    expect(debuggingPanelSource).toContain('data-debug-expression');
    expect(expressionFormatSource).toContain('window.ManatOS.debug.expression');
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
    expect(debuggingModelSource).toContain(
      'scope.map((currentScope) => dynamicUIValue(child, currentScope, caller))',
    );
    expect(runtimeSource).toContain("kind: 'debug-value'");
    expect(runtimeSource).toContain("querySelector('[data-debug-expression]')");
    expect(runtimeSource).toContain('const ast = await loadAstForSource(source)');
    expect(runtimeSource).toContain('dependencyPaths: expressionDependencyPaths(ast)');
    expect(runtimeSource).not.toContain("cell.getAttribute('data-debug-calculation-ast')");
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

  it('preserves the active entity tab across reactive CTX refreshes', async () => {
    const entryPolicySource = await readFile(
      resolve(testDirectory, '../../public/js/runtime/entry-policy-runtime.js'),
      'utf8',
    );
    expect(entryPolicySource).toContain('if (current && !restoreRequested) return;');
    expect(entryPolicySource).toContain('await refreshTabVisibility({ restoreRequested: true })');
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

  it('keeps related presentation debugging free of synthetic row scopes while runtime expressions use canonical CTX rows', async () => {
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
    expect(metadataSource).not.toContain('relatedExpressionScope');
    expect(debuggingModelSource).not.toContain('expressionScopes');
    expect(debuggingModelSource).not.toContain('relatedExpressionScope');
    expect(entryPolicySource).toContain(
      'const rowPath = `${path}.resources.collections[${JSON.stringify(sourceKey)}].current[${rowIndex}]`;',
    );
    expect(entryPolicySource).toContain('await expressions.evaluateAstOwnedAt(valueAst, rowPath)');
    expect(entryPolicySource).not.toContain('evaluateAstOwnedWithScope');
    expect(entryPolicySource).not.toContain('const scopeKeys = parseDataJson');
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

  it('uses Close for a clean entry and Cancel whenever the shared page transaction is dirty or blocked', async () => {
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
      "closeCancelLabel.textContent = changed || blocked ? 'Cancel' : 'Close'",
    );
    expect(forms).toContain("changed || blocked ? 'Cancel editing' : 'Close entry'");
    expect(forms).toContain('let node = runtime?.value?.ui?.level');
    expect(forms).toContain("path += '.level'");
    expect(forms).toContain('const entryPagePath = (() => {');
    expect(forms).toContain('const pagePath = entryPagePath');
    expect(forms).toContain('`${pagePath}.control.state.blocked`');
    expect(forms).not.toContain('state.internalEditing');
    expect(forms).not.toContain('state.internalEditorCount');
    expect(forms).not.toContain('const internalEditing');
    expect(forms).not.toContain('const internalEditorCount');
  });

  it('captures the initial dirty baseline after component initialization scripts settle', async () => {
    const source = await readFile(
      resolve(testDirectory, '../../public/js/sysbo/entry/state.js'),
      'utf8',
    );
    const initialization = await readFile(
      resolve(testDirectory, '../../public/js/runtime/entry-initialization-runtime.js'),
      'utf8',
    );
    const renderer = await readFile(
      resolve(testDirectory, '../../views/components/runtime/entity-entry.ejs'),
      'utf8',
    );
    const pages = await readFile(resolve(testDirectory, '../../public/css/pages.css'), 'utf8');
    expect(source).toContain("form.dataset.metadataFormInitialized === 'true'");
    expect(source).toContain("'manatos:form-initialized'");
    expect(source).toContain("'manatos:form-initialization-settled'");
    expect(source).toContain("'manatos:form-baseline-captured'");
    expect(source).toContain("source: 'entry-initialization-baseline'");
    expect(source).toContain("'load'");
    expect(source).toContain('captureWhenInitialized');
    expect(source).toContain('indicator.hidden = true');
    expect(initialization).not.toContain('${entryPath}.initialization');
    expect(initialization).not.toContain('ctx.replace(');
    expect(initialization).toContain("const owners = new Set(['entry-bootstrap'])");
    expect(initialization).toContain("phase: pendingOwners.length ? 'initializing' : 'settled'");
    expect(initialization).toContain('requestAnimationFrame(() =>');
    expect(initialization).toContain('remoteObserved');
    expect(initialization).toContain('remote:${String(owner)}');
    expect(initialization).toContain('beginRemote');
    expect(initialization).toContain("'Initializing new entry…'");
    expect(initialization).toContain("'Please wait while the new entry UI is being prepared.'");
    expect(initialization).toContain('window.ManatOS?.busy?.show?.');
    expect(initialization).toContain('window.ManatOS?.busy?.hide?.');
    expect(initialization).toContain('manatos-entry-initializing');
    expect(renderer).toContain('class="metadata-driven-record-form manatos-entry-initializing"');
    expect(renderer).toContain('class="manatos-entry-opening-status"');
    expect(renderer).toContain('Opening page…');
    expect(renderer).toContain('data-initialization-visibility="pending"');
    expect(pages).toContain('visibility: hidden');
    expect(initialization).toContain(
      "form.dataset.initializationVisibility = pendingOwners.length ? 'pending' : 'ready'",
    );
    expect(initialization).toContain("type: 'manatos:entry-popup-ready'");
    expect(initialization).not.toContain('entry: { current }');
    expect(initialization).not.toContain('syncCurrentField');
    expect(initialization).not.toContain('syncCurrent,');
  });

  it('keeps spinner presentation tied only to real remote initialization work', async () => {
    const initialization = await readFile(
      resolve(testDirectory, '../../public/js/runtime/entry-initialization-runtime.js'),
      'utf8',
    );
    const routes = await readFile(
      resolve(testDirectory, '../../src/routes/sysbo/index.ts'),
      'utf8',
    );

    expect(initialization).toContain('beginRemote');
    expect(initialization).toContain('window.ManatOS?.busy?.show?.');
    expect(initialization).toContain('window.ManatOS?.busy?.hide?.');
    expect(initialization).toContain('let busyPaintPending = false');
    expect(initialization).toContain('const remoteEndsAwaitingPaint = new Set()');
    expect(initialization).toContain('const minimumRemoteBusyVisibleMs = 160');
    expect(initialization).toContain('const busyShownAt = performance.now()');
    expect(initialization).toContain('requestAnimationFrame(() => {');
    expect(initialization).toContain('window.setTimeout(releaseAfterMinimumDwell, remaining)');
    expect(initialization).toContain('remoteEndsAwaitingPaint.add(ownerKey)');
    expect(initialization).not.toContain('__DebugInitializationSpinnerProbe');
    expect(initialization).not.toContain('1500');
    expect(routes).not.toContain('__DebugInitializationSpinnerProbe');
    expect(routes).not.toContain('setTimeout(resolve, 1500)');
  });

  it('keeps entry mirrors read-only without restoring an initialization working-record authority', async () => {
    const contextRuntime = await readFile(
      resolve(testDirectory, '../../public/js/runtime/context-runtime.js'),
      'utf8',
    );
    expect(contextRuntime).not.toContain('const initializationEntryCurrent =');
    expect(contextRuntime).not.toContain("tokens[initializationIndex + 1] === 'entry'");
    expect(contextRuntime).not.toContain("tokens[initializationIndex + 2] === 'current'");
    expect(contextRuntime).toContain("kind === 'entry-current'");
    expect(contextRuntime).toContain("kind === 'entry-original'");
    expect(contextRuntime).toContain("attributes.add('readonly')");
    expect(contextRuntime).toContain("attributes.add('mirror')");
  });
  it('resolves aggregate state dynamically so late contributor registration updates Save and dirty CTX state', async () => {
    const state = await readFile(
      resolve(testDirectory, '../../public/js/sysbo/entry/state.js'),
      'utf8',
    );
    expect(state).toContain(
      'const currentSharedState = () => entryFormStates.get(form) || fallbackState',
    );
    expect(state).toContain('const sharedState = currentSharedState()');
    expect(state).toContain("typeof sharedState.isFieldDirty === 'function'");
    expect(state).not.toContain('const sharedState = entryFormStates.get(form) ||');
  });
});
