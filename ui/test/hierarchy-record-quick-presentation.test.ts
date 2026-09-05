import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { sourceWithoutWhitespace } from './source-contract.js';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const uiSource = (relativePath: string) =>
  readFile(resolve(testDirectory, '..', relativePath), 'utf8');
const sharedSource = (relativePath: string) =>
  readFile(resolve(testDirectory, '..', '..', 'shared', relativePath), 'utf8');

describe('owner-managed hierarchy recordQuick presentation', () => {
  it('keeps recordQuick entity-driven, compact and validity/dirtiness aware', async () => {
    const contract = await sharedSource('src/metadata/ui/types.ts');
    const metadata = await sharedSource('src/metadata/ui/business.ts');
    const quick = await uiSource('views/components/sysbo/hierarchy/record-quick.ejs');
    const workspace = await uiSource('public/js/sysbo/hierarchy/hierarchy-workspace.js');
    const hierarchyPage = await uiSource(
      'views/components/sysbo/hierarchy/hierarchy-workspace.ejs',
    );
    const tabContent = await uiSource('views/components/sysbo/entry/shell/entry-tab-content.ejs');
    const tree = await uiSource('public/js/sysbo/hierarchy/hierarchy-tree.js');
    const fieldComponentRuntime = await uiSource('public/js/sysbo/entry/field-runtime.js');
    const css = await uiSource('public/css/ui.css');

    expect(contract).toContain(
      'fieldOverrides?: Readonly<Record<string, SysBOUIFieldOverrideMetadata>>',
    );
    expect(metadata).toContain('recordQuick: {');
    expect(metadata).toContain('enabled: { createDefaultValue: true }');
    expect(metadata).toContain("principalType: { createDefaultValue: 'Person' }");
    expect(metadata).toContain("icon: { mode: 'composed', entityScale: 0.72, typeScale: 1.15");
    expect(hierarchyPage).toContain('entryRepresentation: entryRepresentationRuntime');
    expect(metadata).not.toContain("entityIcon: 'people-fill'");
    expect(hierarchyPage).toContain(
      "entityIcon: String(definition.icon || '').replace(/^bi-/, '')",
    );
    expect(tabContent).toContain(
      "entityIcon: component.options?.entityIcon || String(definition.icon || '').replace(/^bi-/, '')",
    );
    expect(quick).toContain('metadata-record-quick-title');
    expect(quick).toContain('Create ${quickEntityName.charAt(0).toLowerCase()}');
    expect(quick).toContain('data-record-quick-commit disabled');
    expect(workspace).toContain('quickIsComplete');
    expect(workspace).toContain('quickIsDirty');
    expect(workspace).toContain('Complete required fields');
    expect(workspace).toContain('component.dataset.hierarchyEditingId = id');
    expect(workspace).toContain(
      "replaceEntries([...entries().map((entry) => ({ ...entry })), row], 'begin-quick')",
    );
    expect(workspace).toContain('delete component.dataset.hierarchyEditingId');
    expect(workspace).toContain("'cancel-quick'");
    expect(workspace).toContain('requestAnimationFrame(positionQuick)');
    expect(workspace).toContain('(New ${targetLabel} sibling)');
    expect(workspace).toContain('(New ${targetLabel} child)');
    expect(workspace).toContain('(New ${targetLabel} parent)');
    expect(workspace).toContain('refreshProvisionalLabel');
    expect(workspace).not.toContain(
      "quick.addEventListener('input', () => { refreshQuickState(); if (draft) positionQuick(); })",
    );
    expect(workspace).toContain("String(entry?.[idField] ?? '') === String(id)");
    expect(workspace).toContain('completeDraftRecord');
    expect(workspace).toContain('withCalculatedHierarchy');
    expect(workspace).toContain('[rootField]: rootFor(row)');
    expect(workspace).toContain('refreshWorkspaceSummary');
    expect(workspace).toContain('workspaceDirty');
    expect(workspace).toContain(
      'hierarchyCommit.disabled = !state.complete || !dirty || Boolean(draft)',
    );
    expect(workspace).toContain('manatos:hierarchy-draft:');
    expect(workspace).toContain('restoreWorkspaceDraft');
    expect(workspace).toContain('Unsaved changes since draft');
    expect(workspace).toContain("draftSupported = hierarchyMode === 'create'");
    expect(workspace).toContain('clearCreateWorkspaceDrafts');
    expect(sourceWithoutWhitespace(workspace)).toContain(
      sourceWithoutWhitespace('window.location.assign(workspace.dataset.hierarchyCloseHref'),
    );
    expect(workspace).not.toContain(
      '`/bo/${encodeURIComponent(entityKey)}/${encodeURIComponent(rootId)}/hierarchy`',
    );
    expect(workspace).toContain("hierarchyEditExit.textContent = dirty ? 'Cancel' : 'Close'");
    expect(hierarchyPage).toContain("hierarchyMode === 'create'");
    expect(hierarchyPage).toContain('data-hierarchy-edit-exit');
    expect(tree).toContain('metadata-hierarchy-node-informational');
    expect(tree).not.toContain(
      'href="/bo/${encodeURIComponent(entityKey)}/${encodeURIComponent(id)}"',
    );
    expect(tree).toContain('is already a child of');
    expect(workspace).toContain('is already a sibling of');
    expect(workspace).toContain('const workingById = new Map(entries()');
    expect(workspace).toContain('return working ? { ...row, ...working } : row;');
    expect(workspace).toContain('is already the parent of');
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
    expect(hierarchyPage).toContain('data-commit-tab="summary"');
    expect(hierarchyPage).toContain('data-commit-tab="details"');
    expect(workspace).toContain('Existing entries unchanged');
    expect(workspace).toContain(
      'Universal ManatOS popup rule: backdrop clicks never dismiss a popup.',
    );
    expect(workspace).not.toContain('if (event.target === backdrop) cancel()');
    expect(workspace).toContain('modified-after-draft');
    expect(workspace).toContain('confirmCommitWorkspace');
    expect(workspace).toContain('aggregateOperationSummary');
    expect(workspace).toContain('commitWorkspace');
    expect(workspace).toContain('/hierarchy/commit');
    expect(hierarchyPage).toContain('data-hierarchy-close');
    expect(hierarchyPage).toContain('>Close</button>');
    expect(hierarchyPage).toContain('data-hierarchy-commit');
    expect(hierarchyPage).toContain('>Commit</button>');
    expect(workspace).toContain("active.command === 'add-parent'");
    expect(workspace).toContain('fields.focusedMemberId.value');
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
    expect(workspace).toContain("'move-member'");
    expect(workspace).toContain("'clear-parent'");
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
    expect(hierarchyWorkspaceScript).toContain(
      'const draftStorageKey = `${draftStoragePrefix}${userId}:${entityKey}:${draftIdentity}`',
    );
    expect(hierarchyWorkspaceScript).not.toContain(
      '`${draftStoragePrefix}${bootId}:${userId}:${entityKey}:${hierarchyRootIdentity}`',
    );
    expect(hierarchyWorkspaceScript).toContain('compatibleDraftPayload');
    expect(hierarchyWorkspaceScript).toContain('storedDraftCandidates');
  });

  it('reuses the generic record selector for hierarchy existing-entry placement without component fetches', async () => {
    const hierarchyTreeScript = await uiSource('public/js/sysbo/hierarchy/hierarchy-tree.js');
    const hierarchyWorkspaceScript = await uiSource(
      'public/js/sysbo/hierarchy/hierarchy-workspace.js',
    );
    const recordSelectorScript = await uiSource('public/js/popups/record-selector.js');
    const hierarchyPage = await uiSource(
      'views/components/sysbo/hierarchy/hierarchy-workspace.ejs',
    );
    const recordSelector = await uiSource('views/popups/selectors/record-selector.ejs');
    const listFilters = await uiSource('views/components/sysbo/list/list-filters.ejs');
    const listPaging = await uiSource('views/components/sysbo/list/list-paging.ejs');

    expect(hierarchyTreeScript).toContain('data-hierarchy-add-menu');
    expect(hierarchyTreeScript).toContain('Add existing node');
    expect(hierarchyTreeScript).toContain('Add existing entry…');
    expect(hierarchyTreeScript).toContain('data-hierarchy-add-relation="parent"');
    expect(hierarchyTreeScript).toContain('data-hierarchy-existing-node-menu');

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

    expect(hierarchyWorkspaceScript).toContain('relationCandidateEligibility');
    expect(hierarchyWorkspaceScript).toContain('relationListExceptions');
    expect(hierarchyWorkspaceScript).toContain('window.ManatOSRecordSelector');
    expect(hierarchyWorkspaceScript).toContain("purpose: 'hierarchy-add-existing'");
    expect(hierarchyWorkspaceScript).toContain('queryPredicate: listExceptions');
    expect(hierarchyWorkspaceScript).toContain('factsForCandidate: (candidate) =>');
    expect(hierarchyWorkspaceScript).toContain('alreadyInContext: Boolean');
    expect(hierarchyWorkspaceScript).toContain('relation,');
    expect(hierarchyWorkspaceScript).toContain('addDatabaseEntryForRelation');
    expect(hierarchyWorkspaceScript).toContain('relateExistingNode(`use-existing-${relation}`');
    expect(hierarchyWorkspaceScript).not.toContain('const displayCellHtml =');
    expect(hierarchyWorkspaceScript).not.toContain('fetch(`/api/v1/');

    expect(recordSelector).toContain('data-selector-ctx');
    expect(recordSelector).toContain('data-selector-select disabled');
    expect(recordSelectorScript).toContain("kind: 'record-selector'");
    expect(recordSelectorScript).not.toContain('const displayCellHtml =');
    expect(recordSelectorScript).toContain('callingParams: { ...resolvedCallingParams }');
    expect(recordSelectorScript).toContain('entriesOriginal: source.map');
    expect(recordSelectorScript).toContain('popupRuntime?.toggleInspection?.({');
    expect(recordSelectorScript).toContain('popupRuntime?.clearInspection?.(selectorCtxButton)');
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
