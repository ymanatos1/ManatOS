import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { sourceWithoutWhitespace } from '../support/source-contract.js';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const uiSource = (relativePath: string) =>
  readFile(resolve(testDirectory, '..', '..', relativePath), 'utf8');
const sharedSource = (relativePath: string) =>
  readFile(resolve(testDirectory, '..', '..', '..', 'shared', relativePath), 'utf8');

describe('owner-managed hierarchy quick ui-view presentation', () => {
  it('keeps the quick ui-view entity-driven, compact and validity/dirtiness aware', async () => {
    const contract = await sharedSource('src/metadata/ui/types.ts');
    const metadata = await sharedSource('src/metadata/ui/manatos/principals/ui-principals.ts');
    const workspace = await uiSource('public/js/sysbo/hierarchy/hierarchy-workspace.js');
    const workspaceModel = await uiSource('public/js/sysbo/hierarchy/hierarchy-workspace-model.js');
    const draftStore = await uiSource('public/js/sysbo/hierarchy/hierarchy-draft-store.js');
    const relationships = await uiSource(
      'public/js/sysbo/hierarchy/hierarchy-relationship-runtime.js',
    );
    const relationshipPolicy = await uiSource('src/runtime/v2/hierarchy-relationship.ts');
    const hierarchyPage = await uiSource(
      'views/components/sysbo/hierarchy/hierarchy-workspace.ejs',
    );
    const hierarchyRenderer = await uiSource('src/routes/sysbo/hierarchy/renderer.ts');
    const tabContent = await uiSource('views/components/sysbo/entry/shell/entry-tab-content.ejs');
    const tree = await uiSource('public/js/sysbo/hierarchy/hierarchy-tree.js');
    const fieldComponentRuntime = await uiSource('public/js/sysbo/entry/field-runtime.js');
    const css = await uiSource('public/css/ui.css');

    expect(contract).toContain(
      'fieldOverrides?: Readonly<Record<string, SysBOUIFieldOverrideMetadata>>',
    );
    expect(metadata).toContain('quick: {');
    expect(metadata).toContain("viewType: 'quick'");
    const canonical = await sharedSource('src/metadata/bo/manatos/principals/bo-principals.ts');
    const commonCanonical = await sharedSource('src/metadata/bo/common.ts');
    expect(commonCanonical).toContain('createDefaultValue: true');
    expect(canonical).toContain("createDefaultValue: 'Person'");
    expect(metadata).toContain("icon: { mode: 'composed', entityScale: 0.72, typeScale: 1.15");
    expect(hierarchyPage).toContain('entryRepresentation: entryRepresentationRuntime');
    expect(metadata).not.toContain("entityIcon: 'people-fill'");
    expect(hierarchyPage).toContain(
      "entityIcon: String(definition.icon || '').replace(/^bi-/, '')",
    );
    expect(tabContent).toContain(
      "entityIcon: component.options?.entityIcon || String(definition.icon || '').replace(/^bi-/, '')",
    );
    const popup = await uiSource('public/js/popups/entry-popup.js');
    const entry = await uiSource('views/components/runtime/entity-entry.ejs');
    const pagesCss = await uiSource('public/css/pages.css');
    const routes = await uiSource('src/routes/sysbo/index.ts');

    expect(contract).toContain('tabNavigationVisible?: boolean');
    expect(metadata).toContain('tabNavigationVisible: false');
    expect(metadata).toContain("tab('quick', 'Quick', 10, {");
    expect(workspace).toContain("purpose: 'hierarchy-quick-entry'");
    expect(workspace).toContain("uiViewKey: 'quick'");
    expect(workspace).toContain('behavior: { recoverable: false }');
    expect(workspace).not.toContain("_entryUIView: 'quick'");
    expect(workspace).toContain("method: 'POST'");
    expect(workspace).toContain('onSaved: (result) => {');
    expect(workspace).toContain('acceptQuickRecord(result?.record)');
    expect(workspace).toContain("entryDensity: 'compact'");
    const entryOpening = await uiSource('public/js/runtime/entry-opening.js');
    expect(entryOpening).toContain("opening.presentation.entryDensity === 'compact'");
    expect(entryOpening).toContain("_entryDensity: 'compact'");
    expect(workspace).toContain('autoCloseOnBackdrop: true');
    expect(workspace).toContain('anchorToTrigger: true');
    expect(workspace).toContain('beginQuick(command, memberId)');
    expect(workspace).not.toContain('quickScopePath');
    expect(workspace).not.toContain('refreshQuickPolicy');
    expect(workspace).not.toContain('publishQuickScope');
    expect(popup).toContain("const requestMethod = String(request?.method || 'GET').toUpperCase()");
    expect(popup).toContain("if (requestMethod === 'POST')");
    expect(popup).toContain("resolvedInvocation.presentation?.entryDensity === 'compact'");
    expect(popup).toContain("popupCard.classList.toggle('is-compact-entry', compactEntry)");
    expect(popup).toContain('resolvedInvocation.presentation?.autoCloseOnBackdrop === true');
    expect(entry).toContain("data-owner-editing=\"<%= ownerEditing ? 'true' : 'false' %>\"");
    expect(entry).toContain('data-ui-view-type=');
    expect(pagesCss).toContain("[data-ui-view-type='quick'] .authentication-identity-row");
    expect(pagesCss).not.toContain(
      "[data-ui-view-type='quick'] .authentication-identity-row {\n  grid-template-columns: minmax(0, 1fr);",
    );
    expect(entry).toContain('name="_ownerEntries"');
    expect(entry).toContain('showTabNavigation = projectedTabs.length > 0');
    expect(entry).toContain('<% if (showTabNavigation) { %>');
    expect(entry).not.toContain('data-v2-tab-navigation-hidden');
    expect(routes).toContain("req.body._ownerEntryMode === 'create'");
    expect(routes).toContain("type: 'manatos:entry-popup-saved'");
    expect(workspace).toContain('component.dataset.hierarchyEditingId = id');
    expect(workspace).not.toContain(
      "replaceEntries([...entries().map((entry) => ({ ...entry })), row], 'begin-quick')",
    );
    expect(workspace).toContain('remains untouched until explicit Save');
    expect(workspace).toContain('delete component.dataset.hierarchyEditingId');
    expect(workspace).toContain('const cancelQuick = () => {');
    expect(workspace).toContain('finishQuickUi();');
    expect(workspace).toContain("active.command === 'add-parent'");
    expect(workspace).toContain("String(entry?.[idField] ?? '') === String(id)");
    expect(workspace).toContain('completeDraftRecord');
    expect(workspace).toContain('withCalculatedHierarchy');
    expect(workspace).toContain('hierarchyModel.withCalculatedHierarchy(rows)');
    expect(workspaceModel).toContain('[rootField]: rootFor(row)');
    expect(workspace).toContain('refreshWorkspaceSummary');
    expect(workspace).toContain('workspaceDirty');
    expect(workspace).toContain(
      'const commitDisabled = !state.complete || !dirty || Boolean(draft)',
    );
    expect(workspace).toContain('hierarchyCommit.disabled = commitDisabled');
    expect(draftStore).toContain("const prefix = 'manatos:hierarchy-draft:'");
    expect(workspace).toContain('createHierarchyDraftStore');
    expect(workspace).toContain('restoreWorkspaceDraft');
    expect(workspace).toContain('Unsaved changes since draft');
    expect(draftStore).toContain("const supported = hierarchyMode === 'create'");
    expect(workspace).toContain('const draftSupported = hierarchyDraftStore.supported');
    expect(workspace).toContain('createHierarchyRelationshipRuntime');
    expect(workspace).toContain('hierarchyRelationships.removeNode(memberId)');
    expect(workspace).toContain('hierarchyRelationships.openExistingEntrySelector');
    expect(workspace).toContain('clearCreateWorkspaceDrafts');
    expect(sourceWithoutWhitespace(workspace)).toContain(
      sourceWithoutWhitespace('window.location.assign(workspace.dataset.hierarchyCloseHref'),
    );
    expect(workspace).not.toContain(
      '`/bo/${encodeURIComponent(entityKey)}/${encodeURIComponent(rootId)}/hierarchy`',
    );
    expect(workspace).toContain("hierarchyEditExit.textContent = dirty ? 'Cancel' : 'Close'");
    expect(workspace).toContain('if (workspaceDirty() && !saveWorkspaceDraft()) return;');
    expect(workspace).toContain('const exitEditWorkspace = () =>');
    expect(workspace).toContain('leaveHierarchyWorkspace();');
    expect(hierarchyPage).toContain("hierarchyMode === 'create'");
    expect(hierarchyPage).toContain('data-hierarchy-close');
    expect(hierarchyPage).toContain('data-hierarchy-edit-exit');
    expect(hierarchyPage).toContain('data-cancel-operation');
    expect(hierarchyPage).toContain('data-hierarchy-edit-exit');
    expect(hierarchyPage).toContain('data-hierarchy-draft-help');
    expect(hierarchyPage).toContain(
      'You can leave this draft and continue later. Use Clear all to discard it.',
    );
    expect(hierarchyPage).toContain('data-hierarchy-draft-help hidden');
    expect(workspace).toContain(
      "hierarchyDraftHelp.hidden = hierarchyMode !== 'create' || rows.length === 0",
    );
    expect(tree).toContain('metadata-hierarchy-node-informational');
    expect(tree).not.toContain(
      'href="/bo/${encodeURIComponent(entityKey)}/${encodeURIComponent(id)}"',
    );
    expect(relationshipPolicy).toContain('is already a child of');
    expect(relationshipPolicy).toContain('is already a sibling of');
    expect(relationships).toContain('const workingById = new Map(entries()');
    expect(relationships).toContain('return working ? { ...row, ...working } : row;');
    expect(relationshipPolicy).toContain('is already the parent of');
    expect(workspace).not.toContain('Draft saved${savedDraftAt');
    expect(workspace).toContain('data-hierarchy-save-draft');
    expect(hierarchyPage).toContain('data-hierarchy-clear-all');
    expect(hierarchyPage).toContain('data-hierarchy-clear-all-confirm-template');
    expect(hierarchyPage).toContain('data-clear-all-tab="summary"');
    expect(hierarchyPage).toContain('data-clear-all-tab="details"');
    expect(workspace).toContain('confirmClearAllWorkspace');
    expect(workspace).toContain('clearAllWorkspace');
    expect(workspace).toContain("replaceOriginalEntries([], 'clear-all-originals')");
    expect(workspace).toContain("replaceEntries([], 'clear-all')");
    expect(workspace).toContain(
      'Persisted entries remain unchanged in application storage/database.',
    );
    expect(hierarchyPage).toContain('data-commit-report');
    expect(hierarchyPage).toContain('data-commit-operation-count');
    expect(hierarchyPage).toContain('data-commit-simulate-failure');
    expect(hierarchyPage).toContain('Simulate transaction failure (developer)');
    expect(hierarchyPage).toContain('Review the exact immutable transaction plan below');
    expect(workspace).toContain('window.ManatOS?.workspaceCommit?.reportModel?.(plan)');
    expect(workspace).toContain('pendingCommitPlan = plan');
    expect(workspace).toContain('const acceptedPlan = pendingCommitPlan');
    expect(workspace).toContain(
      'commitWorkspace(acceptedPlan, pendingCommitMode, simulateTransactionFailure)',
    );
    expect(hierarchyPage).toContain('Commit changes');
    expect(hierarchyRenderer).toContain(
      'const hierarchyReferenceData = await references(req, definition, { ctx });',
    );
    expect(hierarchyRenderer).toContain('referenceData: hierarchyReferenceData');
    expect(css).toContain('width: min(78rem, calc(100vw - 3rem));');
    expect(css).toContain('.metadata-hierarchy-commit-confirm-modal .modal-dialog');
    expect(hierarchyPage).toContain('metadata-hierarchy-commit-confirm-modal');
    expect(hierarchyPage).toContain('class="modal fade metadata-hierarchy-clear-confirm"');
    expect(workspace).toContain('popupRuntime?.registerBootstrapModal?.(modal);');
    expect(workspace).toContain('window.bootstrap?.Modal?.getOrCreateInstance(modal)');
    expect(workspace).not.toContain("backdrop.dataset.hierarchyClearAllConfirm = '';");
    expect(workspace).not.toContain('if (event.target === backdrop) cancel()');
    expect(hierarchyPage).toContain('class="modal fade metadata-hierarchy-commit-confirm-modal"');
    expect(hierarchyPage).toContain('data-popup-purpose="hierarchy-commit"');
    expect(hierarchyPage).toContain('id="hierarchyCommitConfirmModal"');
    expect(workspace).not.toContain("registerRecoveryRestorer?.(\n    'hierarchy-commit'");
    expect(workspace).toContain('data: { commitMode: pendingCommitMode }');
    expect(workspace).toContain('behavior: { recoverable: false }');
    expect(hierarchyPage).toContain('data-v2-layout-component-instance="report"');
    expect(hierarchyPage).toContain('data-v2-layout-action="commit"');
    expect(workspace).toContain("organizationSurface.acceptCommittedBaseline('commit-success')");
    expect(workspace).toContain(
      "fragment.querySelector('.metadata-hierarchy-commit-confirm-modal')",
    );
    expect(workspace).not.toContain("backdrop.dataset.hierarchyCommitConfirm = '';");
    expect(workspace).not.toContain(
      "backdrop.className = 'manatos-popup-backdrop metadata-hierarchy-entry-selector-backdrop';",
    );
    expect(hierarchyPage).not.toContain('data-commit-confirm-ctx');
    expect(workspace).toContain('modified-after-draft');
    expect(workspace).toContain('confirmCommitWorkspace');
    expect(workspace).toContain('commitPlanForWorkspace');
    expect(workspace).toContain('workspaceTransaction: organizationSurface.transactionSnapshot()');
    expect(workspace).toContain('_csrf: csrf,');
    expect(workspace).toContain('commitPlan,');
    expect(workspace).toContain('debug: simulateTransactionFailure');
    expect(workspace).toContain('resources: (() => {');
    expect(workspace).toContain('organizationSurface.runtimeResourceSnapshot()');
    expect(workspace).toContain('commitWorkspace');
    expect(workspace).toContain('/hierarchy/commit');
    expect(hierarchyPage).toContain('data-hierarchy-close');
    expect(hierarchyPage).toContain('>Close</button>');
    expect(hierarchyPage).not.toContain('>Cancel</a>');
    expect(hierarchyPage).toContain('data-hierarchy-commit');
    expect(hierarchyPage).toContain('data-hierarchy-commit-mode="close"');
    expect(hierarchyPage).toContain('>Commit</button>');
    expect(hierarchyPage).toContain('data-hierarchy-commit-option="close"');
    expect(hierarchyPage).toContain('>Commit</button>');
    expect(hierarchyPage).toContain('Commit and Stay');
    expect(hierarchyPage.indexOf('data-hierarchy-commit-option="close"')).toBeLessThan(
      hierarchyPage.indexOf('Commit and Stay'),
    );
    expect(workspace).toContain("commitWorkspace(plan, 'lifecycle')");
    expect(workspace).toContain(
      "hierarchyCommit?.addEventListener('click', () => confirmCommitWorkspace('close'))",
    );
    expect(workspace).toContain("active.command === 'add-parent'");
    expect(workspace).toContain("workspaceValue('focusedMemberId', '')");
    expect(workspace).toContain('organizationSurface.setWorkspaceValue');
    expect(workspace).not.toContain('data.fields.focusedMemberId.value');
    expect(sourceWithoutWhitespace(relationships)).toContain(
      "`$.${String(pagePath).replace(/^ctx\\.?/,'')}.data.resources.referenceData`",
    );
    expect(hierarchyPage).not.toContain('data-ctx-scope-path');
    expect(workspace).toContain('runtime.leafUiLevelPath?.()');
    expect(workspace).not.toContain('const activeUiLevelPath = () =>');
    expect(workspace).toContain('const resolveCanonical = (path) =>');
    expect(workspace).toContain('const values = resolveCanonical(entriesPath);');
    expect(workspace).toContain('const entries = () => organizationSurface.entries;');
    expect(workspace).toContain(
      'const originalEntries = () => organizationSurface.originalEntries;',
    );
    expect(workspace).toContain('organizationSurface.setStateValue');
    expect(workspace).not.toContain('runtime.resolve(entriesPath)');
    expect(workspace).not.toContain('runtime.resolve(originalEntriesPath)');
    expect(workspace).not.toContain('if (runtime.resolve(path) === value) return;');
    expect(workspace).toContain('component.dataset.ctxScopePath = pagePath');
    expect(workspace).not.toContain('runtime.resolve(pagePath)');
    expect(workspace).not.toContain("runtime.resolve('ctx.page')");
    expect(tree).toContain("component.dataset.hierarchyEditingId || ''");
    expect(sourceWithoutWhitespace(tree)).toMatch(
      /\.filter\(\(row\)=>!editingId\|\|String\(row\?\.\[idField\]\?\?''\)!==editingId,?\)/,
    );
    expect(tree).toContain('showNodeCommands = workspaceMode && hasNodeValue;');
    expect(tree).toContain('roots.map(renderNode)');
    expect(tree).toContain('data-hierarchy-open-member');
    expect(tree).toContain('draggable="true"');
    expect(tree).toContain("detail: { command: 'move', memberId: sourceId, targetId }");
    // Node-add affordances must honor both structural state and the canonical
    // enum traits that define whether this member may have a parent / children.
    // Normalize whitespace so formatting changes do not weaken this behavioral contract.
    expect(sourceWithoutWhitespace(tree)).toContain(
      sourceWithoutWhitespace(
        'canAddParent = showNodeCommands && !hasParent && (!canHaveParentTrait || typeItem?.[canHaveParentTrait] === true)',
      ),
    );
    expect(sourceWithoutWhitespace(tree)).toContain(
      sourceWithoutWhitespace(
        'canAddChild = showNodeCommands && (!containerTrait || typeItem?.[containerTrait] === true)',
      ),
    );
    expect(tree).toContain('data-hierarchy-remove-menu');
    expect(tree).toContain('data-hierarchy-command="clear-parent"');
    expect(tree).toContain(`hasParent ? '' : ' disabled aria-disabled="true"'`);
    expect(tree).toContain('metadata-hierarchy-node-delete btn btn-danger btn-sm');
    expect(tree).toContain('data-hierarchy-member-id');
    expect(tree).toContain('data-hierarchy-portal');
    expect(tree).toContain('data-drop-hint');
    expect(tree).toContain('Make child of ${targetLabel}');
    expect(tree).toContain('Cannot make child of ${targetLabel}');
    expect(tree).toContain('const validateDrop = (sourceId, targetId) =>');
    expect(tree).toContain("event.dataTransfer.dropEffect = 'none'");
    expect(tree).toContain("node?.classList.add('is-drop-invalid')");
    expect(tree).toContain('!validateDrop(sourceId, targetId).valid');
    expect(css).toContain('var(--entry-type-scale, 1.15)');
    expect(css).toContain('var(--entry-entity-scale, 0.72)');
    expect(css).toContain('background: var(--bs-tertiary-bg, #f1f3f5);');
    expect(sourceWithoutWhitespace(css)).toContain(
      sourceWithoutWhitespace(
        ".metadata-hierarchy-node-remove-menu .dropdown-item:not(:disabled):not([aria-disabled='true']):hover",
      ),
    );
    expect(css).toContain('width: 1.15rem;');
    expect(css).toContain('.metadata-hierarchy-node-command:not(.metadata-hierarchy-node-delete)');
    expect(css).toContain(".metadata-hierarchy-node-delete[aria-expanded='true']");
    expect(css).toContain('background: var(--bs-body-bg);');
    expect(css).toContain('.metadata-hierarchy-node.is-drop-invalid');
    expect(relationships).toContain("'move-member'");
    expect(relationships).toContain("'clear-parent'");
    expect(workspace).toContain('canHaveParentTrait');
    expect(workspace).toContain('containerTrait');
    expect(workspace).not.toContain(
      "window.alert('This target member type cannot contain child members.')",
    );
    expect(workspace).not.toContain("window.alert('This member type cannot have a parent.')");
    expect(workspace).not.toContain(
      "window.alert('A member cannot be moved below one of its descendants.')",
    );
    expect(tree).not.toContain('data-hierarchy-open-draft');
    expect(fieldComponentRuntime).toContain("root?.querySelector('select[data-enum-items]')");
  });
});

describe('hierarchy draft persistence and relation selection', () => {
  it('persists organization drafts by user/entity rather than UI-server boot and restores compatible drafts', async () => {
    const hierarchyWorkspaceScript = await uiSource(
      'public/js/sysbo/hierarchy/hierarchy-workspace.js',
    );
    const hierarchyDraftStore = await uiSource(
      'public/js/sysbo/hierarchy/hierarchy-draft-store.js',
    );
    const organizationRecovery = await uiSource('src/runtime/v2/organization-recovery.ts');
    expect(hierarchyDraftStore).toContain(
      'const storageKey = `${prefix}${userId}:${entityKey}:${identity}`',
    );
    expect(hierarchyDraftStore).not.toContain(
      '`${prefix}${bootId}:${userId}:${entityKey}:${hierarchyRootIdentity}`',
    );
    expect(hierarchyDraftStore).toContain('compatiblePayload');
    expect(hierarchyDraftStore).toContain('const candidates = () =>');
    expect(hierarchyWorkspaceScript).toContain('hierarchyDraftStore.compatiblePayload');
    expect(hierarchyWorkspaceScript).toContain('hierarchyDraftStore.candidates');
    expect(hierarchyDraftStore).toContain('workspaceTransaction');
    expect(hierarchyWorkspaceScript).toContain('organizationSurface.transactionSnapshot()');
    expect(hierarchyWorkspaceScript).toContain('restore-workspace-draft-transaction');
    expect(hierarchyWorkspaceScript).toContain('organizationRecoveryAdapter?.(pagePath)');
    expect(organizationRecovery).toContain("format: 'hierarchy-commit-v2'");
    expect(organizationRecovery).toContain("'workspace-recovery-transaction'");
  });

  it('reuses the generic record selector for hierarchy existing-entry placement without component fetches', async () => {
    const hierarchyTreeScript = await uiSource('public/js/sysbo/hierarchy/hierarchy-tree.js');
    const uiCss = await uiSource('public/css/ui.css');
    const hierarchyWorkspaceScript = await uiSource(
      'public/js/sysbo/hierarchy/hierarchy-workspace.js',
    );
    const hierarchyRelationshipRuntime = await uiSource(
      'public/js/sysbo/hierarchy/hierarchy-relationship-runtime.js',
    );
    const recordSelectorScript = await uiSource('public/js/popups/record-selector.js');
    const hierarchyPage = await uiSource(
      'views/components/sysbo/hierarchy/hierarchy-workspace.ejs',
    );
    const recordSelector = await uiSource('views/popups/selectors/record-selector.ejs');
    const listFilters = await uiSource('views/components/sysbo/list/list-filters.ejs');
    const listPaging = await uiSource('views/components/sysbo/list/list-paging.ejs');

    expect(hierarchyTreeScript).toContain('data-hierarchy-add-menu');
    expect(hierarchyTreeScript).toContain(
      "command: `add-${button.dataset.hierarchyAddRelation || 'sibling'}`",
    );
    expect(hierarchyTreeScript).toContain(
      "button.addEventListener('contextmenu', openExistingMenu)",
    );
    expect(hierarchyTreeScript).toContain('Add existing node');
    expect(hierarchyTreeScript).toContain('Add existing entry…');
    expect(hierarchyTreeScript).toContain('data-hierarchy-add-relation="parent"');
    expect(hierarchyTreeScript).toContain('data-hierarchy-existing-node-menu');
    expect(uiCss).toContain('.metadata-hierarchy-existing-node-menu .dropdown-item[hidden]');

    expect(hierarchyPage).toContain("include('../../../popups/selectors/record-selector'");
    expect(recordSelector).toContain("include('../../components/sysbo/list/list-toolbar'");
    expect(recordSelector).toContain("include('../../components/sysbo/list/list-filters'");
    expect(recordSelector).toContain("include('../../components/sysbo/list/list-table-header'");
    expect(recordSelector).toContain("include('../../components/sysbo/list/list-paging'");
    expect(recordSelector).toContain("include('../../components/sysbo/list/list-row-cells'");
    expect(hierarchyPage).toContain('selectorCandidates: Array.isArray');
    expect(listFilters).toContain('data-selector-filter-clear');
    expect(listFilters).toContain('data-selector-filter-apply');
    expect(listPaging).toContain('data-selector-page-size');
    expect(listPaging).toContain(
      'const showPagingControls = isSelectorPaging || paging.totalPages > 1',
    );

    expect(hierarchyRelationshipRuntime).toContain('relationCandidateEligibility');
    expect(hierarchyWorkspaceScript).not.toContain('relationListExceptions');
    expect(hierarchyRelationshipRuntime).toContain('window.ManatOS?.popup?.recordSelector');
    expect(hierarchyRelationshipRuntime).toContain("purpose: 'select'");
    expect(hierarchyWorkspaceScript).not.toContain('queryPredicate: listExceptions');
    expect(hierarchyRelationshipRuntime).toContain('factsForCandidate: (candidate) =>');
    expect(hierarchyRelationshipRuntime).toContain('alreadyInContext: Boolean');
    expect(hierarchyRelationshipRuntime).toContain(
      'relationCandidateEligibility(member, candidate, relation)',
    );
    expect(hierarchyRelationshipRuntime).toContain('addDatabaseEntryForRelation');
    expect(hierarchyRelationshipRuntime).toContain('relateExistingNode(`use-existing-${relation}`');
    expect(hierarchyWorkspaceScript).not.toContain('const displayCellHtml =');
    expect(hierarchyWorkspaceScript).not.toContain('fetch(`/api/v1/');

    expect(recordSelector).toContain('data-selector-ctx');
    expect(recordSelector).toContain('data-selector-select');
    expect(recordSelector).toMatch(/data-selector-select[^>]*\sdisabled(?:\s|>)/);
    expect(recordSelectorScript).toContain("kind: 'selector'");
    expect(recordSelectorScript).not.toContain('const displayCellHtml =');
    expect(recordSelectorScript).toContain('invocation: { ...resolvedInvocation }');
    expect(recordSelectorScript).toContain('originalEntries: snapshot.originalEntries.map');
    expect(recordSelectorScript).toContain('popupRuntime?.toggleInspection?.({');
    expect(recordSelectorScript).toContain('popupRuntime.clearInspection?.(selectorCtxButton)');
    expect(recordSelectorScript).toContain(
      'Keep the same row DOM node alive so browser dblclick semantics remain',
    );
    expect(recordSelectorScript).toContain("panel.addEventListener('dblclick'");
    expect(recordSelectorScript).toContain('Universal ManatOS popup rule');
    expect(recordSelectorScript).not.toContain('if (event.target === backdrop) close()');

    expect(hierarchyTreeScript).toContain('item.hidden = !legal');
    expect(hierarchyTreeScript).toContain('data-legal-parent');
    expect(hierarchyTreeScript).toContain('data-legal-sibling');
    expect(hierarchyTreeScript).toContain('data-legal-child');
  });

  it('seeds ctx.entities from the complete canonical object registry including internal relationship objects', async () => {
    const pageContext = await uiSource('src/middleware/page-context.ts');
    const metadata = await sharedSource('src/metadata/bo/registry.ts');
    expect(pageContext).toContain('allManatOSObjectMetadata');
    expect(pageContext).toContain('Object.values(allManatOSObjectMetadata)');
    expect(metadata).toContain('[sysBOEmailAddressesMetadata.key]');
    expect(metadata).toContain('[sysBOPrincipalEmailAddressesMetadata.key]');
    expect(metadata).toContain('[sysBOTelephoneNumbersMetadata.key]');
    expect(metadata).toContain('[sysBOPrincipalTelephoneNumbersMetadata.key]');
    expect(metadata).toContain('[sysBOAddressesMetadata.key]');
    expect(metadata).toContain('[sysBOPrincipalAddressesMetadata.key]');
  });
});
