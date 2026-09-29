import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const source = (path: string) => readFile(resolve(here, '..', '..', path), 'utf8');

describe('Stage 21 Organization hierarchy ownership', () => {
  it('routes aggregate CTX ownership through the typed Organization surface', async () => {
    const browserEntry = await source('src/browser/runtime-entry.ts');
    const workspace = await source('public/js/sysbo/hierarchy/hierarchy-workspace.js');
    const surface = await source('src/runtime/v2/organization-hierarchy-surface.ts');
    const recovery = await source('src/runtime/v2/organization-recovery.ts');
    expect(browserEntry).toContain('organizationHierarchySurface');
    expect(workspace).toContain('organizationSurface.replaceEntries');
    expect(workspace).toContain('organizationSurface.replaceOriginalEntries');
    expect(workspace).toContain('organizationSurface.setWorkspaceValue');
    expect(workspace).toContain('organizationSurface.setStateValue');
    expect(workspace).not.toContain('runtime.replace(entriesPath');
    expect(workspace).not.toContain("source: 'hierarchy-workspace', action, triggerPath: path");
    expect(surface).toContain('new UiDirtyRuntime(level.context');
    expect(surface).toContain('this.dirtyRuntime.refresh');
    expect(surface).toContain('sameRows(');
    expect(surface).toContain('return semanticEqual(normalized(left), normalized(right))');
    expect(workspace).toContain('organizationRecoveryAdapter?.(pagePath)');
    expect(recovery).toContain('surface.sameRows(surface.entries, changes.entries)');
    expect(recovery).toContain('surface.sameTransactionSnapshot(');
    const workspaceModel = await source('public/js/sysbo/hierarchy/hierarchy-workspace-model.js');
    expect(workspaceModel).not.toContain('const sameRows =');
    expect(workspaceModel).not.toContain('const normalizedRows =');
    expect(workspace).toContain('runtime?.get?.(`${pagePath}.state.dirty`) === true');
    expect(workspace).not.toContain('organizationSurface.dirty');
    expect(workspace).not.toContain("'hierarchy-dirty'");
    expect(workspace).toContain('`${pagePath}.state.userInputReady`');
    expect(workspace).toContain(
      "hierarchyStateText.textContent = dirty ? 'Unsaved changes' : 'No changes'",
    );
    const hierarchyView = await source('views/components/sysbo/hierarchy/hierarchy-workspace.ejs');
    expect(hierarchyView).toContain('data-hierarchy-state-indicator');
    expect(hierarchyView).toContain('data-hierarchy-state-indicator');
    expect(hierarchyView).toContain('data-v2-layout-status="hierarchy-dirty"');
    expect(workspace).toContain(
      "hierarchyStateIndicator.addEventListener('click', reviewWorkspaceChanges)",
    );
    expect(hierarchyView).toContain('data-hierarchy-state-text>No changes</span>');
    expect(workspace).toContain("discardLabel: 'Discard'");
    expect(workspace).toContain("saveLabel: 'Commit'");
    expect(workspace).toContain('hierarchyEditExit.dataset.surfaceClosePath = pagePath');
    expect(workspace).toContain('hierarchyEditExit.dataset.surfaceCloseHref');
    expect(workspace).toContain('plan = commitPlanForWorkspace()');
    expect(workspace).toContain("return (await commitWorkspace(plan, 'lifecycle')) === true");
  });

  it('projects hierarchy member inspection through canonical #layout renderer identities', async () => {
    const surface = await source('src/runtime/v2/organization-hierarchy-surface.ts');
    const layout = await source('src/runtime/v2/hierarchy-layout.ts');
    const tree = await source('public/js/sysbo/hierarchy/hierarchy-tree.js');
    expect(surface).toContain('projectHierarchyMembersIntoLayout');
    expect(surface).toContain('this.#refreshInspectionLayout(action)');
    expect(layout).toContain('component-instance:hierarchy-member-${rendererToken}');
    expect(layout).toContain('const memberKey = `member-${++memberSequence}`');
    expect(layout).not.toContain('component-instance:${base}-card');
    expect(layout).not.toContain('component-instance:${base}-controls');
    expect(layout).not.toContain("{ key: 'members', kind: 'content' }");
    expect(layout).not.toContain("{ key: 'children', kind: 'content' }");
    expect(tree).toContain('data-v2-layout-component-instance="${esc(layoutBase)}"');
    expect(tree).not.toContain('data-v2-layout-component-instance="${esc(layoutBase)}-card"');
    expect(tree).not.toContain('data-v2-layout-component-instance="${esc(layoutBase)}-controls"');
    expect(tree).toContain('resolveSource(component, recycleSource)');
    expect(tree).toContain("command: 'restore-recycled'");
  });

  it('routes hierarchy relationship decisions through the typed V2 owner', async () => {
    const relationshipRuntime = await source(
      'public/js/sysbo/hierarchy/hierarchy-relationship-runtime.js',
    );
    const hierarchyTree = await source('public/js/sysbo/hierarchy/hierarchy-tree.js');
    expect(relationshipRuntime).toContain('organizationSurface.relationshipEligibility');
    expect(relationshipRuntime).toContain('organizationSurface.reparentMember');
    expect(relationshipRuntime).toContain('organizationSurface.removeMember');
    expect(hierarchyTree).toContain('originalMemberSource');
    expect(hierarchyTree).toContain('original Organization member cannot be removed');
    expect(relationshipRuntime).toContain('organizationSurface.restoreRecycledMember');
    expect(relationshipRuntime).not.toContain('recycleBin.push');
    expect(relationshipRuntime).toContain('organizationSurface.addExistingMemberForRelation');
    expect(relationshipRuntime).toContain('organizationSurface.hydrateOriginalSnapshots');
    expect(relationshipRuntime).toContain('organizationSurface.relationshipTypeOption');
    expect(relationshipRuntime).not.toContain(
      'const relationCandidateEligibility = (member, candidate, relation) => {',
    );
    expect(relationshipRuntime).not.toContain('const visited = new Set();');
    expect(relationshipRuntime).not.toContain('const ensureOriginalSnapshot =');
    expect(relationshipRuntime).not.toContain('const removeOriginalSnapshot =');
    expect(hierarchyTree).toContain('hierarchyRelationshipEligibility');
    expect(hierarchyTree).not.toContain('const isAncestorOf =');
    expect(hierarchyTree).not.toContain('const visited = new Set();');
  });
});
