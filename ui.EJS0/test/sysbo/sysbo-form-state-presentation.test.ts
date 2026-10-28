import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { sourceWithoutWhitespace } from '../support/source-contract.js';

const testDirectory = dirname(fileURLToPath(import.meta.url));

describe('generic SysBO form state presentation', () => {
  it('loads focused form runtimes instead of the former forms.js monolith', async () => {
    const shell = await readFile(resolve(testDirectory, '../../views/layout/shell.ejs'), 'utf8');
    expect(shell).toContain('/js/sysbo/entry/state.js');
    expect(shell).toContain('/js/sysbo/entry/field-state.js');
    expect(shell).toContain('/js/sysbo/entry/save.js');
    expect(shell).not.toContain('/js/forms.js');
    const state = await readFile(
      resolve(testDirectory, '../../public/js/sysbo/entry/state.js'),
      'utf8',
    );
    expect(state).toContain("surfaces.register('entry-form-state', install)");
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
    expect(source).toContain('field?.dirty === true');
    expect(source).toContain('calculateEntryContributorAggregate(states)');
    expect(source).toContain('const aggregatePolicy = calculateEntryAggregatePolicy({');
    expect(source).toContain('const saveDisabled = initializing || !aggregatePolicy.saveReady');
    expect(source).toContain(
      "form.addEventListener('manatos:entry-view-disposing', () => abort.abort()",
    );
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

    const summarySource = await readFile(
      resolve(testDirectory, '../../views/components/sysbo/entry/content/summary.ejs'),
      'utf8',
    );
    expect(summarySource).toContain("} else if (field.type === 'reference')");
    expect(summarySource).toContain('editable: fieldEditable(field)');
    expect(summarySource).not.toContain("field.type === 'reference' && fieldEditable(field)");
  });

  it('shows generated System details in create mode so the read-only tab remains visible', async () => {
    const apiMetadata = await readFile(
      resolve(testDirectory, '../../../shared/src/metadata/ui/common.ts'),
      'utf8',
    );
    const systemTabStart = apiMetadata.indexOf('const systemTab');
    const systemTabEnd = apiMetadata.indexOf('const systemFieldOverrides', systemTabStart);
    const systemTabSource = apiMetadata.slice(systemTabStart, systemTabEnd);
    expect(systemTabSource).toContain("'@CM.SystemDetails'");
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
      resolve(testDirectory, '../../public/js/sysbo/entry/entry-policy-runtime.js'),
      'utf8',
    );
    const expressionFormatSource = await readFile(
      resolve(testDirectory, '../../public/js/debugger/expression-format.js'),
      'utf8',
    );

    // Canonical metadata declares the Debugging component, while the UI server
    // capability-gates only an inert template and the browser composes the live tab.
    expect(commonUiMetadataSource).toContain("tab('debugging', '@CM.Debugging'");
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
    // Foreign related-entity canonical calculations are not part of the host
    // entry Debugging inventory; only UI expressions explicitly owned by the
    // related-collection presentation are inventoried under UI / RELATED.
    expect(debuggingModelSource).not.toContain("'RELATED ENTITY'");
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
      resolve(testDirectory, '../../public/js/sysbo/entry/entry-policy-runtime.js'),
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
      resolve(testDirectory, '../../public/js/sysbo/entry/entry-policy-runtime.js'),
      'utf8',
    );
    expect(metadataSource).not.toContain('relatedExpressionScope');
    expect(debuggingModelSource).not.toContain('expressionScopes');
    expect(debuggingModelSource).not.toContain('relatedExpressionScope');
    expect(entryPolicySource).toContain(
      'const rowPath = `${path}.data.collections[${JSON.stringify(sourceKey)}].current[${rowIndex}]`;',
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
    const forms = await readFile(
      resolve(testDirectory, '../../public/js/sysbo/entry/state.js'),
      'utf8',
    );
    expect(sourceWithoutWhitespace(forms)).toContain(
      sourceWithoutWhitespace(
        "closeCancelLabel.textContent = changed || blocked ? localized('cancel', 'Cancel') : localized('close', 'Close')",
      ),
    );
    expect(sourceWithoutWhitespace(forms)).toContain(
      sourceWithoutWhitespace(
        "changed || blocked ? localized('cancelEditing', 'Cancel editing') : localized('closeEntry', 'Close entry')",
      ),
    );
    const template = await readFile(
      resolve(testDirectory, '../../views/components/runtime/entity-entry.ejs'),
      'utf8',
    );
    for (const [name, key] of [
      ['cancel', '@CM.Cancel'],
      ['close', '@CM.Close'],
      ['cancelEditing', '@CM.CancelEditing'],
      ['closeEntry', '@CM.CloseEntry'],
    ]) {
      expect(template).toContain(`${name}: metadataText('${key}')`);
    }
    expect(forms).toContain('const pagePath = entryPagePath');
  });

  it('captures the initial dirty baseline once per entry UI level across uiView switches', async () => {
    const source = await readFile(
      resolve(testDirectory, '../../public/js/sysbo/entry/state.js'),
      'utf8',
    );
    expect(source).toContain('const baselineCapturedLevels = new WeakSet()');
    expect(source).toContain("form.dataset.metadataFormInitialized === 'true'");
    expect(source).toContain("'manatos:form-initialized'");
    expect(source).toContain("source: 'entry-initialization-baseline'");
    expect(source).toContain('baselineCapturedLevels.add(page)');
  });

  it('keeps spinner presentation tied only to real remote initialization work', async () => {
    const initialization = await readFile(
      resolve(testDirectory, '../../public/js/sysbo/entry/entry-initialization-runtime.js'),
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
  it('reinstalls aggregate state for every rematerialized uiView while retaining canonical CTX dirtiness', async () => {
    const state = await readFile(
      resolve(testDirectory, '../../public/js/sysbo/entry/state.js'),
      'utf8',
    );
    expect(state).toContain("surfaces.register('entry-form-state', install)");
    expect(state).toContain("form.addEventListener('manatos:form-contributor-register'");
    expect(state).toContain(
      "form.addEventListener('manatos:entry-view-disposing', () => abort.abort()",
    );
    expect(state).toContain('field?.dirty === true');
  });

  it('routes editable entry surface dismissal through the canonical Close/Cancel transaction', async () => {
    const source = await readFile(
      resolve(testDirectory, '../../public/js/sysbo/entry/state.js'),
      'utf8',
    );
    expect(source).toContain('runtime?.registerDismissHandler?.(');
    expect(source).toContain('{ path: entryPagePath }');
    expect(source).toContain('surfaceClosure?.requestTrigger?.(closeCancel, entryPagePath)');
    expect(source).not.toContain('closeCancel.click();');
    expect(source).not.toContain('closeSurface?.(entryPagePath');
  });
});
