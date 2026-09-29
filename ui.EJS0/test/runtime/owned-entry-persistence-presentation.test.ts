import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const renderer = readFileSync(
  new URL('../../src/routes/sysbo/entry/renderer.ts', import.meta.url),
  'utf8',
);
const routes = readFileSync(new URL('../../src/routes/sysbo/index.ts', import.meta.url), 'utf8');
const entryTemplate = readFileSync(
  new URL('../../views/components/runtime/entity-entry.ejs', import.meta.url),
  'utf8',
);
const host = readFileSync(
  new URL('../../public/js/runtime/ui-host-runtime.js', import.meta.url),
  'utf8',
);
const ownerManagedEntry = readFileSync(
  new URL('../../src/routes/sysbo/entry/owner-managed-entry.ts', import.meta.url),
  'utf8',
);
const hierarchyWorkspace = readFileSync(
  new URL('../../public/js/sysbo/hierarchy/hierarchy-workspace.js', import.meta.url),
  'utf8',
);
const pictureFields = readFileSync(
  new URL('../../public/js/sysbo/entry/fields/picture-fields.js', import.meta.url),
  'utf8',
);
const pictureTemplate = readFileSync(
  new URL('../../views/components/sysbo/entry/fields/picture-field.ejs', import.meta.url),
  'utf8',
);
const entrySave = readFileSync(
  new URL('../../public/js/sysbo/entry/save.js', import.meta.url),
  'utf8',
);
const shell = readFileSync(new URL('../../public/js/shell/shell.js', import.meta.url), 'utf8');
const hierarchyRenderer = readFileSync(
  new URL('../../src/routes/sysbo/hierarchy/renderer.ts', import.meta.url),
  'utf8',
);

describe('owner-managed full entry runtime contract', () => {
  it('binds the SSR entry form to the actual nested entry UiLevel', () => {
    expect(renderer).toContain('record.parentOwnerContext');
    expect(renderer).toContain("? 'ctx.ui.level.level.level'");
  });

  it('returns Close/Cancel to the owning aggregate without abandoning its working snapshot', () => {
    expect(entryTemplate).toContain('formaction="/bo/<%= definition.key %>/owned/return"');
    expect(routes).toContain("router.post('/:key/owned/return'");
    expect(routes).toContain('parentOwnerContext.entriesOriginal');
    expect(routes).toContain('renderMetadataDrivenHierarchyWorkspace');
  });

  it('publishes persistence ownership before Save and keeps the owner recoverable', () => {
    expect(host).toContain("kind: 'return-to-caller'");
    expect(host).toContain("ownerUiLevelPath: 'ctx.ui.level.level'");
    expect(host).toContain('ultimateBoundary:');
    expect(host).toContain("persistence: { kind: 'aggregate' }");
    expect(host).toContain('supportsUserChanges: true');
  });

  it('saves a full-page owned Entry into owner state before optional Close', () => {
    expect(entrySave).not.toContain(
      "if (!popupHost && persistence?.kind === 'return-to-caller') return;",
    );
    expect(entrySave).toContain('if (ownerState) updateOwnerState(ownerState);');
    expect(entrySave).toContain("typedResult?.persistenceKind === 'return-to-caller'");
    expect(entrySave).toContain('window.ManatOS.saveEntrySurfaceForPath(');
    expect(entrySave).toContain('returnToOwner(payload.data?.ownerReturnUrl)');
    expect(entrySave).not.toContain(
      'Owned Entry remained dirty after its owner accepted the Save result.',
    );
    expect(entrySave).toContain("continuation.dataset.allowDirtyPageExit = 'true';");
    expect(entrySave).toContain('continuation.requestSubmit()');
    expect(routes).toContain("req.get('X-Requested-With') === 'ManatOS-InPlace-Save'");
    expect(routes).toContain('ownerState: invocation.popup');
    expect(routes).toContain('workspaceTransaction: ownerUpdate.workspaceTransaction');
    expect(routes).toContain("close: req.body._saveMode === 'close'");
    expect(shell).not.toContain('Stage 21.9g removes this final transport exception');
  });

  it('carries the complete recursive workspace transaction through the full-page owned entry continuation', () => {
    expect(hierarchyWorkspace).toContain(
      '_ownerWorkspaceTransaction: JSON.stringify(organizationSurface.transactionSnapshot())',
    );
    expect(entryTemplate).toContain('name="_ownerWorkspaceTransaction"');
    expect(hierarchyWorkspace).toContain(
      '_ownerRecycleBin: JSON.stringify(organizationSurface.recycleBin)',
    );
    expect(entryTemplate).toContain('name="_ownerRecycleBin"');
    expect(renderer).toContain(
      'originalEntries: Array.isArray(record.parentOwnerContext.entriesOriginal)',
    );
    expect(renderer).toContain(
      'workspaceTransaction: record.parentOwnerContext.workspaceTransaction',
    );
    expect(renderer).toContain('recycleBin: Array.isArray(record.parentOwnerContext.recycleBin)');
    expect(ownerManagedEntry).toMatch(
      /workspaceTransaction:\s*normalizeWorkspaceTransaction\(\s*parseObject/,
    );
    expect(routes).toContain('workspaceTransaction: parentOwnerContext.workspaceTransaction');
    expect(routes).toContain('recycleBin: parentOwnerContext.recycleBin');
    expect(routes).toContain('recycleBin: ownerUpdate.recycleBin');
    expect(ownerManagedEntry).toContain('recycleBin: parseRows(req.body._ownerRecycleBin)');
    expect(hierarchyRenderer).toContain('workspaceOverride?.workspaceTransaction');
    expect(hierarchyRenderer).toContain('(workspaceOverride?.recycleBin ?? []).map');
  });
  it('keeps live popup owner communication on the runtime provider only', () => {
    expect(hierarchyWorkspace).toContain(
      'organizationSurface.ownerProvider?.provideEntryIfPresent',
    );
    expect(hierarchyWorkspace).not.toContain('_ownerEntryTransfer');
    expect(entryTemplate).not.toContain('ownerContext.ownedInvocation');
  });

  it('keeps pending picture bytes private and owned by the Entry UiLevel', () => {
    expect(pictureFields).not.toContain('organizationOwnerSurfaceFor');
    expect(pictureFields).toContain('uiRuntimeResourceForPath');
    expect(pictureFields).toContain('capturePendingResources');
    expect(pictureFields).not.toContain('manatos.pending-picture.v1:');
    expect(pictureFields).not.toContain('sessionStorage.setItem');
    expect(pictureTemplate).toContain(
      'persistedScalarPictureSource(definition.key, pictureId, key, picture)',
    );
  });

  it('returns scalar picture semantics to the owner without changing repository picture persistence', () => {
    expect(ownerManagedEntry).toContain("!['picture', 'pictures'].includes(field.type)");
    expect(ownerManagedEntry).toContain(
      "edited[field.key] = field.type === 'pictures' ? [] : null",
    );
    expect(ownerManagedEntry).toContain('JSON.parse(raw)');
    expect(ownerManagedEntry).toContain('complete semantic current');
    expect(ownerManagedEntry).toContain('Binary bytes remain private browser resources');
  });

  it('reopens owner-managed collections from the staged transaction rather than stale repository rows', () => {
    expect(renderer).toContain('ownerWorkspaceMutation');
    expect(renderer).toContain('ownerWorkspaceMutation?.collections?.[key]');
    expect(renderer).toContain('{ original: staged.original, current: staged.current }');
  });

  it('stages owned-entry fields, collections and relationship references into the owner transaction', () => {
    expect(entryTemplate).toContain('name="_ownerCollectionsOriginal"');
    expect(ownerManagedEntry).toContain("key.startsWith('relatedChanges.')");
    expect(ownerManagedEntry).toContain('current: structuredClone(parsed.current)');
    expect(ownerManagedEntry).toContain('!semanticEqual(collection.original, collection.current)');
    expect(ownerManagedEntry).toContain('changedFieldKeys(baseline, current)');
    expect(ownerManagedEntry).toContain('formPayloadForMetadata(req.body');
    expect(ownerManagedEntry).toMatch(
      /normalizeMetadataFieldValues\(\s*metadata,\s*formPayloadForMetadata\(/,
    );
    expect(ownerManagedEntry).toContain('relationshipForField(metadata, fieldKey)');
    expect(ownerManagedEntry).toContain('upsertWorkspaceMutation(');
    expect(ownerManagedEntry).toContain('parentMutationIdFor(');
  });
});
