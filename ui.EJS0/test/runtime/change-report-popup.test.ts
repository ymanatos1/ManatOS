import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const source = (path: string) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

describe('semantic changes popup', () => {
  it('uses the shared hierarchical report renderer and popup runtime', async () => {
    const popup = await source('src/runtime/change-report-popup.ts');
    expect(popup).toContain('ManatOS?.semanticReportPresentation?.render');
    expect(popup).toContain('registerBootstrapModal');
    expect(popup).not.toContain('workspaceTransaction');
    expect(popup).not.toContain('entriesOriginal');
    expect(popup).not.toContain('runtimeResourceResolver');
  });

  it('projects Organization unsaved changes semantically while Commit confirmation remains plan-owned', async () => {
    const workspace = await source('public/js/sysbo/hierarchy/hierarchy-workspace.js');
    expect(workspace).toContain('const reviewWorkspaceChanges = () =>');
    expect(workspace).toContain('window.ManatOS?.semanticChangeReport?.hierarchy');
    expect(workspace).toContain('workspaceTransaction: organizationSurface.transactionSnapshot()');
    expect(workspace).toContain('ownerPath: pagePath');
    expect(workspace).not.toContain('reportPlan(commitPlanForWorkspace(), {');
    expect(workspace).toContain('changeReportPopup?.show?.(reportModel');
  });
});
