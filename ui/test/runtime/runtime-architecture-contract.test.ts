import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const ui = (path: string) => readFile(resolve(here, '..', '..', path), 'utf8');
const repo = (path: string) => readFile(resolve(here, '..', '..', '..', path), 'utf8');

describe('V2 post-cutover architecture audit', () => {
  it('keeps developer guidance aligned with process-local expression AST ownership', async () => {
    const gettingStarted = await repo('docs/development/Getting-Started.md');
    const developerTools = await repo('docs/development/Developer-Tools.md');
    const systemArchitecture = await repo('docs/architecture/System-Architecture.md');
    const shell = await ui('views/layout/shell.ejs');

    expect(gettingStarted).toContain('the API process and UI process each compile lazily');
    expect(gettingStarted).toContain('browser never parses grammar itself');
    expect(gettingStarted).toContain('through the UI compile boundary');
    expect(gettingStarted).not.toContain('server-side context construction compiles them to ASTs');
    expect(gettingStarted).not.toContain('browser consumes the compiled representation');
    expect(gettingStarted).not.toContain('consume server-compiled ASTs');
    expect(developerTools).not.toContain('same canonical compiled-expression AST');
    expect(systemArchitecture).toContain('compiled AST is process-local runtime infrastructure');
    expect(shell).not.toContain('expression-compiler-runtime.js');
  });

  it('keeps rich entry field state out of evaluator lexical scope', async () => {
    const binding = await ui('src/runtime/resolvers/expression-binding.ts');
    const browser = await ui('public/js/sysbo/entry/expression-runtime.js');

    expect(binding).toContain('fields: fieldNodes');
    expect(binding).not.toContain('...fieldNodes');
    expect(binding).toContain('...currentValues');
    expect(binding).toContain('`#level.fields.<field>` explicitly');
    expect(browser).toContain('Normal entry expressions resolve against the real CTX');
  });

  it('reconciles in-place saves through the active entry field and baseline authorities', async () => {
    const save = await ui('public/js/sysbo/entry/save.js');

    expect(save).toContain("let path = 'ctx.ui.level'");
    expect(save).not.toContain('runtime.replace(currentPath');
    expect(save).toContain('runtime.replace(fieldPath, value');
    expect(save).toContain('`${pagePath}.fields.${key}.originalValue`');
    expect(save).toContain('runtime.replace(baselinePath, value');
    expect(save).toContain('const persistedValues = Object.fromEntries(');
    expect(save).not.toContain('isV2Surface');
  });

  it('routes browser field mutations through one canonical CTX field owner', async () => {
    const ctxRuntime = await ui('public/js/runtime/context-runtime.js');
    const formRuntime = await ui('public/js/sysbo/entry/form-runtime.js');
    const save = await ui('public/js/sysbo/entry/save.js');
    const policy = await ui('public/js/runtime/entry-policy-runtime.js');

    expect(ctxRuntime).toContain(
      'if (match) return updateField(match[1], match[2], value, undefined, cause);',
    );
    expect(ctxRuntime).toContain('if (baselineMatch) return updateBaseline(');
    expect(ctxRuntime).not.toContain('isV2Surface');
    expect(ctxRuntime).not.toContain('page.entry[key] = value');
    expect(formRuntime).not.toContain('syncCurrentValue');
    expect(formRuntime).toContain('runtime.updateField(entryPagePath, key, value, option, cause);');
    expect(save).not.toContain('runtime.updateField?.');
    expect(save).not.toContain('runtime.updateBaseline?.');
    expect(policy).toContain('ctx.updateField(path, key, value, option, cause);');
    expect(policy).toContain('ctx.get(`${path}.fields.${key}.options`)');
    expect(policy).not.toContain('getFieldOptions?.(control)');
    expect(policy).not.toContain('getFieldOption?.(control)');
    expect(policy).not.toContain('ctx.replace?.(fieldPath, value');
    expect(formRuntime).not.toContain('runtime.replace(path, value, cause);');
    expect(formRuntime).not.toContain('new CustomEvent(CHANGE_EVENT');
    expect(policy).not.toContain('manatos-entry-policy-unresolved');
  });

  it('shares host-neutral entry field policy instead of duplicating browser and TypeScript decisions', async () => {
    const semantic = await ui('src/runtime/state/entity-entry-runtime.ts');
    const resolver = await ui('src/runtime/resolvers/effective-ui-metadata-resolver.ts');
    const browser = await ui('public/js/runtime/entry-policy-runtime.js');
    const renderer = await ui('src/routes/sysbo/entry/renderer.ts');

    expect(semantic).toContain('allowedInvocationOptionValues(metadata, override)');
    expect(semantic).toContain('reconcileRestrictedOptionValue(field.value, allowed)');
    expect(resolver).toContain('staticEntryFieldUx(');
    expect(browser).toContain("import('/shared-runtime/policies/entry-field-policy.js')");
    expect(browser).toContain('fieldPolicy.allowedInvocationOptionValues(field, restriction)');
    expect(browser).toContain('fieldPolicy.staticEntryFieldUx(');
    expect(browser).toContain('if (!dynamicVisible) container.hidden = !visible;');
    expect(renderer).toContain('allowedInvocationOptionValues(field, override)');
    expect(browser).not.toContain('restriction.allowedValues.map(String)');
  });

  it('shares one contributor reduction between host-neutral and browser entry adapters', async () => {
    const semantic = await ui('src/runtime/state/entry-aggregate-state-runtime.ts');
    const browser = await ui('public/js/sysbo/entry/state.js');
    const shared = await repo('shared/src/policies/entry-aggregate-policy.ts');

    expect(shared).toContain('export function calculateEntryContributorAggregate(');
    expect(semantic).toContain(
      'calculateEntryContributorAggregate([...this.#contributors.values()])',
    );
    expect(browser).toContain("import('/shared-runtime/policies/entry-aggregate-policy.js')");
    expect(browser).toContain('calculateEntryContributorAggregate(states)');
    expect(browser).not.toContain('states.some((value) => value.dirty === true)');
    expect(browser).not.toContain('states.every((value) => value.valid !== false)');
  });

  it('keeps shared browser services under one ManatOS runtime namespace', async () => {
    const connectivity = await ui('public/js/shell/system-connectivity.js');
    const busy = await ui('public/js/shell/busy.js');
    const fields = await ui('public/js/sysbo/entry/field-runtime.js');
    const debuggerExpression = await ui('public/js/debugger/expression-format.js');
    const debuggerHost = await ui('public/js/debugger/detached-tools.js');
    const debuggerTraffic = await ui('public/js/debugger/api-traffic.js');
    const debuggerTargets = await ui('public/js/debugger/ctx-target-views.js');
    const gettingStarted = await repo('docs/development/Getting-Started.md');

    expect(connectivity).toContain('window.ManatOS.connectivity = Object.freeze');
    expect(busy).toContain('window.ManatOS.busy = Object.freeze');
    expect(fields).toContain('window.ManatOS.fieldComponents = Object.freeze');
    expect(fields).toContain('window.ManatOS?.pictureFieldRuntime?.install?.({ publish })');
    expect(debuggerExpression).toContain('window.ManatOS.debug.expression = Object.freeze');
    expect(debuggerHost).toContain('window.ManatOS.debug.developerToolsHost = Object.freeze');
    expect(debuggerTraffic).toContain('window.ManatOS.debug.apiTraffic = Object.freeze');
    expect(debuggerTargets).toContain('window.ManatOS.debug.ctxTargetViews = Object.freeze');

    for (const source of [
      connectivity,
      busy,
      fields,
      debuggerExpression,
      debuggerHost,
      debuggerTraffic,
      debuggerTargets,
    ]) {
      expect(source).not.toContain('window.ManatOSConnectivity');
      expect(source).not.toContain('window.manatosBusy');
      expect(source).not.toContain('window.ManatOSFieldComponents');
      expect(source).not.toContain('window.ManatOSDebugExpression');
      expect(source).not.toContain('window.ManatOSDeveloperToolsHost');
      expect(source).not.toContain('window.__manatosApiTrafficRuntime');
      expect(source).not.toContain('window.ManatOSCtxTargetViews');
    }

    expect(gettingStarted).toContain('single `window.ManatOS` namespace');
    expect(gettingStarted).toContain('do not use the namespace as a semantic state bag');
    expect(gettingStarted).toContain(
      'Private runtime state is retained only when it owns lifecycle',
    );
  });

  it('uses one private activity service with separate request and expression channels', async () => {
    const busy = await ui('public/js/shell/busy.js');
    const expressionRuntime = await ui('public/js/sysbo/entry/expression-runtime.js');
    const traffic = await ui('public/js/debugger/api-traffic.js');

    expect(busy).toContain("const beginActivity = (channel = 'request'");
    expect(busy).toContain('REQUEST_SHOW_DELAY_MS = 180');
    expect(busy).toContain('REQUEST_TIMEOUT_MS = 45_000');
    expect(busy).toContain('window.fetch = requestFetch');
    expect(busy).toContain('window.ManatOS.activity = Object.freeze');
    expect(busy).toContain('finally');
    expect(busy).toContain('endActivity()');
    expect(expressionRuntime).toContain("activity?.begin?.('expression')");
    expect(expressionRuntime).toContain('manatosBusy: false');
    expect(traffic).toContain('manatosBusy: false');
    expect(busy).not.toContain('ctx.');
  });

  it('keeps entry reference selectors on the canonical field option domain', async () => {
    const fieldRuntime = await ui('public/js/sysbo/entry/field-runtime.js');

    expect(fieldRuntime).toContain('`${pagePath}.fields.${fieldKey}`');
    expect(fieldRuntime).toContain('const source = Array.isArray(fieldContext?.options)');
    expect(fieldRuntime).not.toContain('`${pagePath}.resources.referenceData`');
    const hostRuntime = await ui('public/js/runtime/ui-host-runtime.js');
    expect(hostRuntime).toContain('bootstrap.resources?.referenceData');
    expect(hostRuntime).toContain("field.type === 'reference'");
    expect(hostRuntime).toContain('...(Array.isArray(options) ? { option, options } : {})');
  });

  it('keeps V2 hierarchy relationship candidates inside V2 resources', async () => {
    const renderer = await ui('src/routes/sysbo/hierarchy/renderer.ts');
    const workspace = await ui('public/js/sysbo/hierarchy/hierarchy-workspace.js');
    const workspaceModel = await ui('public/js/sysbo/hierarchy/hierarchy-workspace-model.js');
    const draftStore = await ui('public/js/sysbo/hierarchy/hierarchy-draft-store.js');
    const relationships = await ui('public/js/sysbo/hierarchy/hierarchy-relationship-runtime.js');
    expect(workspace).toContain('`${pagePath}.control.state.blocked`');
    expect(workspace).toContain('createHierarchyWorkspaceModel');
    expect(workspace).toContain('createHierarchyDraftStore');
    expect(workspace).toContain('createHierarchyRelationshipRuntime');
    expect(workspace).not.toContain('localStorage.');
    expect(workspaceModel).toContain('const withCalculatedHierarchy = (rows) =>');
    expect(workspaceModel).toContain('const completion = (rows) =>');
    expect(draftStore).toContain("const prefix = 'manatos:hierarchy-draft:'");
    expect(draftStore).toContain('localStorage.getItem(storageKey)');
    expect(workspace).not.toContain('state.internalEditing');
    expect(workspace).not.toContain('state.internalEditorCount');

    expect(renderer).toContain('referenceData:');
    expect(renderer).toContain('parentListContext.referenceData');
    expect(relationships).toContain('`${pagePath}.resources.referenceData`');
    expect(workspace).toContain("let path = 'ctx.ui.level'");
    expect(workspace).toContain('`${pagePath}.resources.workspace`');
    expect(workspace).not.toContain("runtime.resolve('ctx.page')");
  });

  it('keeps authored source at presentation boundaries and resolves ASTs from the canonical expression registry', async () => {
    const renderer = await ui('src/presentation/page/render-page.ts');
    const entry = await ui('views/components/runtime/entity-entry.ejs');
    const field = await ui('views/components/sysbo/entry/fields/form-field.ejs');
    const component = await ui('views/components/sysbo/entry/shell/metadata-component.ejs');
    const summary = await ui('views/components/sysbo/entry/content/summary.ejs');
    const related = await ui('views/components/sysbo/entry/content/related-collections.ejs');
    const selector = await ui('views/popups/selectors/record-selector.ejs');
    const shell = await ui('views/layout/shell.ejs');
    const expressionRuntime = await ui('public/js/sysbo/entry/expression-runtime.js');
    const contextRuntime = await ui('src/context/manatos-context.ts');

    expect(renderer).not.toContain('preparedExpression');
    expect(entry).not.toContain('data-field-calculation-ast');
    expect(field).not.toContain('data-ui-visible-ast');
    expect(component).not.toContain('data-metadata-component-binding-asts');
    expect(summary).not.toContain('data-v2-summary-tone-ast');
    expect(related).not.toContain('data-v2-related-value-ast');
    expect(contextRuntime).not.toContain('projected.ast');
    expect(expressionRuntime).toContain("fetch('/bo/expression/compile'");
    expect(selector).not.toContain('preparedExpression');
    expect(selector).toContain('const recordSelectorUIRules = {');
    expect(expressionRuntime).toContain('astForSource');
    expect(expressionRuntime).not.toContain('expressionCompiler');
    expect(shell).not.toContain('expression-compiler-runtime.js');

    const expressionArchitecture = await readFile(
      resolve(here, '..', '..', '..', 'docs', 'architecture', 'Expression-Architecture.md'),
      'utf8',
    );
    const ctxCatalog = await readFile(
      resolve(here, '..', '..', '..', 'docs', 'reference', 'CTX-Catalog.md'),
      'utf8',
    );
    const componentsDoc = await readFile(
      resolve(here, '..', '..', '..', 'docs', 'design', 'Components.md'),
      'utf8',
    );
    const uiFlowsDoc = await readFile(
      resolve(here, '..', '..', '..', 'docs', 'design', 'UI-Flows.md'),
      'utf8',
    );
    const workingWithEntitiesDoc = await readFile(
      resolve(here, '..', '..', '..', 'docs', 'usage', 'Working-with-Entities.md'),
      'utf8',
    );
    expect(expressionArchitecture).toContain('ASTs are never CTX state');
    expect(expressionArchitecture).toContain('/bo/expression/compile');
    expect(expressionArchitecture).not.toContain('publishes prepared\n              AST');
    expect(ctxCatalog).not.toContain('`.expression` / `.ast`');
    for (const doc of [componentsDoc, uiFlowsDoc, workingWithEntitiesDoc]) {
      expect(doc).not.toContain('callingParams');
      expect(doc).not.toContain('precompiled expression');
      expect(doc).not.toContain('browser evaluates the supplied AST');
    }
    expect(componentsDoc).toContain('SurfaceInvocation');
    expect(uiFlowsDoc).toContain('caller-side continuation');
    expect(workingWithEntitiesDoc).toContain('caller-side continuation');
  });

  it('does not expose detached or shared mutable browser evaluator scopes after Stage B CTX migration', async () => {
    const formRuntime = await ui('public/js/sysbo/entry/form-runtime.js');
    const expressionRuntime = await ui('public/js/sysbo/entry/expression-runtime.js');
    const evaluatorSources = `${formRuntime}\n${expressionRuntime}`;

    expect(evaluatorSources).not.toContain('evaluateAstWithScope');
    expect(evaluatorSources).not.toContain('evaluateAstOwnedWithScope');
    expect(evaluatorSources).not.toContain('explicitEvaluationScopeValue');
    expect(evaluatorSources).not.toContain('explicitEvaluationScopePath');
    expect(evaluatorSources).not.toContain('scopedValue');
    expect(expressionRuntime).toContain(
      'const evaluate = (node, evaluationScopePath = null, invocation = null) =>',
    );
    expect(expressionRuntime).toContain(
      'return resolveVariable(node, evaluationScopePath, invocation);',
    );
    expect(formRuntime).toContain(
      'evaluateAstAt: (ast, scopePath) => evaluate(ast, scopePath || null)',
    );
    expect(formRuntime).toContain('evaluateAstOwnedAt: (ast, scopePath)');
  });

  it('keeps hierarchy CTX invalidation on the shared reactive path-overlap policy', async () => {
    const tree = await ui('public/js/sysbo/hierarchy/hierarchy-tree.js');

    expect(tree).toContain("await import('/shared-runtime/policies/reactive-runtime-policy.js')");
    expect(tree).toContain('const pathsOverlap = reactivePolicy.reactivePathsOverlap;');
    expect(tree).not.toContain('const pathsOverlap = (left, right) =>');
  });

  it('evaluates browser entry representation against observable CTX row owners', async () => {
    const representation = await ui('public/js/sysbo/entry/entry-representation.js');
    const workspace = await ui('public/js/sysbo/hierarchy/hierarchy-workspace.js');
    const tree = await ui('public/js/sysbo/hierarchy/hierarchy-tree.js');

    expect(representation).toContain('evaluator.astForSource?.(source.expression)');
    expect(representation).toContain('evaluator.evaluateAstAt(ast, ownerPath)');
    expect(representation).toContain('loadAstForSource(source)');
    expect(representation).not.toContain('source.ast');
    expect(representation).not.toContain('evaluateAstWithScope');
    expect(representation).not.toContain('scopeFor');
    expect(workspace).toContain('await entryResolver?.prepare?.(entryRepresentation)');
    expect(tree).toContain(
      'entryRepresentationResolver.prepare(optionsFor(component).entryRepresentation || {})',
    );
    expect(workspace).toContain('ownerPath: entryOwnerPath(row)');
    expect(tree).toContain('ownerPath: entryOwnerPath(row)');
  });

  it('keeps post-cutover browser entry state and selector catalogues CTX-owned', async () => {
    const expressionRuntime = await ui('public/js/sysbo/entry/expression-runtime.js');
    const fieldRuntime = await ui('public/js/sysbo/entry/field-runtime.js');

    expect(expressionRuntime).not.toContain('resolveLocalFieldVariable');
    expect(expressionRuntime).not.toContain('Early-boot compatibility only');
    expect(expressionRuntime).toContain("firstMember === 'value'");
    expect(fieldRuntime).not.toContain('const renderedSource = [...control.options]');
    expect(fieldRuntime).toContain(
      'fields.<field>.options is the canonical effective option domain',
    );
  });

  it('keeps hosted iframe entry semantics single-owned instead of mirroring them into outer popup CTX', async () => {
    const popup = await ui('public/js/popups/entry-popup.js');

    expect(popup).not.toContain('cloneCtxValue');
    expect(popup).not.toContain('deepestEntryLevel');
    expect(popup).not.toContain("action: 'mirror-hosted-entry-state'");
    expect(popup).not.toContain("hostedWindow.addEventListener('manatos:ctx-change'");
    expect(popup).not.toContain("hostedWindow.addEventListener('manatos:ctx-ready'");
    expect(popup).toContain('presentation: { ...currentPresentation, title: canonicalTitle }');
    expect(popup).toContain('state: { popup: { ...popupPlacement } }');
  });

  it('reads hosted-entry invocation value rules from the owning CTX surface, not hidden form transport', async () => {
    const formRuntime = await ui('public/js/sysbo/entry/form-runtime.js');

    expect(formRuntime).toContain('`${entryPagePath}.control.invocation.rules.values`');
    expect(formRuntime).not.toContain('form.querySelector(\'input[name="_entryDefaults"]\')');
  });

  it('uses the canonical host-neutral invocation contract for page and popup surfaces', async () => {
    const hostRuntime = await ui('public/js/runtime/ui-host-runtime.js');
    const entryPolicy = await ui('public/js/runtime/entry-policy-runtime.js');

    expect(hostRuntime).toContain("purpose: 'view'");
    expect(hostRuntime).toContain("purpose: mode === 'create' ? 'create' : 'view'");
    expect(hostRuntime).toContain('caller: callerReference(parent)');
    expect(hostRuntime).toContain('canonicalEntryRules(bootstrap.defaults, bootstrap.uiOverrides)');
    expect(hostRuntime).not.toContain("purpose: 'show-page'");
    expect(hostRuntime).not.toContain("purpose: 'browse-entity-list'");
    expect(hostRuntime).not.toContain("purpose: 'manage-entity-hierarchy'");
    expect(hostRuntime).not.toContain("invocation: { purpose: 'manage-entity-hierarchy' }");
    expect(entryPolicy).toContain('surface.control.invocation?.rules?.fields');
    expect(entryPolicy).not.toContain('surface.control.invocation?.uiOverrides');
  });

  it('keeps transient evaluator operands invocation-local instead of shared mutable state', async () => {
    const formRuntime = await ui('public/js/sysbo/entry/form-runtime.js');
    const expressionRuntime = await ui('public/js/sysbo/entry/expression-runtime.js');

    expect(expressionRuntime).toContain(
      'const evaluate = (node, evaluationScopePath = null, invocation = null)',
    );
    expect(formRuntime).toContain('operands: Object.freeze({ value: previous })');
    expect(expressionRuntime).toContain(
      "Object.prototype.hasOwnProperty.call(invocation.operands, 'value')",
    );
    expect(`${formRuntime}\n${expressionRuntime}`).not.toContain('normalizationValueActive');
    expect(`${formRuntime}\n${expressionRuntime}`).not.toContain('let normalizationValue');
  });

  it('keeps async capability de-duplication local to one reactive evaluation pass', async () => {
    const formRuntime = await ui('public/js/sysbo/entry/form-runtime.js');
    const expressionRuntime = await ui('public/js/sysbo/entry/expression-runtime.js');

    expect(expressionRuntime).toContain('action({ capabilityPromises: new Map() })');
    expect(expressionRuntime).toContain(
      'const evaluateOwned = async (node, ownedScopePath = null, evaluationPass = null)',
    );
    expect(expressionRuntime).toContain(
      'const capabilityPromises = evaluationPass?.capabilityPromises',
    );
    expect(formRuntime).toContain('await entry.run(currentChange, evaluationPass)');
    expect(formRuntime).toContain('await entry.run(undefined, evaluationPass)');
    expect(`${formRuntime}\n${expressionRuntime}`).not.toContain('ownedCapabilityPassCache');
  });

  it('keeps entry initialization as lifecycle state, not a second working-record authority', async () => {
    const initialization = await ui('public/js/runtime/entry-initialization-runtime.js');
    const policy = await ui('public/js/runtime/entry-policy-runtime.js');
    const formRuntime = await ui('public/js/sysbo/entry/form-runtime.js');
    const debuggerSource = await ui('public/js/debugger/ctx-debug.js');

    expect(initialization).not.toContain('entry: { current }');
    expect(initialization).not.toContain('syncCurrentField');
    expect(initialization).not.toContain('syncCurrent,');
    expect(initialization).not.toContain('${entryPath}.initialization');
    expect(initialization).not.toContain('ctx.replace(');
    expect(policy).toContain('expressions.evaluateAstOwnedAt(ast, path)');
    expect(policy).not.toContain('entryInitialization?.path ?? path');
    expect(formRuntime).not.toContain('entryInitialization?.syncCurrent?.()');
    expect(initialization).toContain('window.ManatOS.entryInitialization = Object.freeze({');
    expect(initialization).not.toContain('window.ManatOSEntryInitialization');
    expect(policy).toContain('window.ManatOS?.entryInitialization');
    expect(formRuntime).toContain('window.ManatOS?.entryInitialization');
    expect(debuggerSource).toContain("[entryCurrentPath, ['$entry-current']]");
    expect(debuggerSource).not.toContain('initializationCurrentPath');
  });

  it('owns metadata-default evaluation at the canonical CTX field value path', async () => {
    const entryRuntime = await ui('src/runtime/state/entity-entry-runtime.ts');

    expect(entryRuntime).toContain('`${this.surface.path}.fields.${fieldKey}.value`');
    expect(entryRuntime).not.toContain('initialization.entry.current');
  });
  it('routes retry through the popup action contract instead of a mutable window callback', async () => {
    const popupRuntime = await ui('public/js/popups/popup-runtime.js');
    const popupAction = await ui('views/popups/shared/popup-action.ejs');
    const messageModals = await ui('views/popups/messages/message-modals.ejs');
    const entryState = await ui('public/js/sysbo/entry/state.js');

    expect(popupAction).toContain('data-popup-action="<%= popupAction.action %>"');
    expect(messageModals).toContain("action: 'retry'");
    expect(messageModals).not.toContain('window.manatosRetry');
    expect(popupRuntime).toContain("action.dataset.popupAction !== 'retry'");
    expect(popupRuntime).toContain("new CustomEvent('manatos:retry-request'");
    expect(popupRuntime).toContain('if (action.dispatchEvent(retryRequest)) history.go(0);');
    expect(entryState).toContain("window.addEventListener('manatos:retry-request'");
    expect(entryState).not.toContain('window.manatosRetry');
    expect(entryState).not.toContain('window.manatosAllowDirtyPageExit');
  });

  it('reads entry entity identity from the canonical control plane after the level.control migration', async () => {
    const policy = await ui('public/js/runtime/entry-policy-runtime.js');
    const formRuntime = await ui('public/js/sysbo/entry/form-runtime.js');
    expect(policy).toContain('surface.control?.entityKey');
    expect(policy).not.toContain('surface.entityKey');
    expect(formRuntime).toContain('entrySurface?.control?.entityKey');
    expect(formRuntime).not.toContain('entrySurface?.entityKey');
  });
});
