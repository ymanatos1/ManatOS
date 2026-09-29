import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const source = (relativePath: string) =>
  readFile(resolve(testDirectory, '..', '..', relativePath), 'utf8');

describe('universal hierarchical report presentation', () => {
  it('owns generic nested disclosure and expansion without domain knowledge', async () => {
    const report = await source('src/runtime/hierarchical-report.ts');
    expect(report).toContain('export class HierarchicalReportRenderer');
    expect(report).toContain(
      'browserWindow.ManatOS.hierarchicalReport = Object.freeze({ render })',
    );
    expect(report).toContain('data-hierarchical-report-node');
    expect(report).toContain('data-hierarchical-report-expand');
    expect(report).toContain('data-hierarchical-report-collapse');
    expect(report).toContain('node?.entryDescriptor');
    expect(report).toContain(
      "descriptor.ownerWorkspaceState === true ? ' class=\"fst-italic\"' : ''",
    );
    expect(report).toContain('Array.isArray(node?.statuses)');
    expect(report).toContain('detail?.from !== undefined || detail?.to !== undefined');
    expect(report).toContain(
      "descriptorHtml(detail.from, '∅', resourceResolver, '', resourceScope)",
    );
    expect(report).not.toContain('uiRuntimeResourceForPath');
    expect(report).not.toContain('pictureFieldRuntime?.resolvePendingScalarPicture');
    expect(report).toContain('options?.runtimeResourceResolver');
    expect(report).toContain('resourceScope');
    expect(report).toContain(
      'resourceResolver?.(resourceScope, descriptor.imageResourceKey, descriptor)',
    );
    expect(report).toContain("const prefix = descriptor.prefix ? html(descriptor.prefix) : '';");
    expect(report).toContain(
      "descriptor.ownerWorkspaceState === true ? ' class=\"fst-italic\"' : ''",
    );
    expect(report).toContain("className = ''");
    expect(report).toContain("`text-truncate${node?.emphasis ? ' fw-bold' : ''}`,");
    expect(report).not.toContain('organizationHierarchySurface?.(');
    expect(report).toContain('max-height:20rem');
    expect(report).not.toContain('Organization');
    expect(report).not.toContain('Principal');
    expect(report).not.toContain('CommitPlan');
  });

  it('is loaded before workspace recovery and recovery adapts semantic state into it', async () => {
    const shell = await source('views/layout/shell.ejs');
    const browserEntry = await source('src/browser/runtime-entry.ts');
    const recovery = await source('src/runtime/workspace-recovery.ts');
    expect(shell).not.toContain('/js/runtime/hierarchical-report.js');
    expect(shell).not.toContain('/js/runtime/workspace-recovery.js');
    expect(browserEntry.indexOf('hierarchicalReportRenderer.install()')).toBeLessThan(
      browserEntry.indexOf('workspaceRecoveryController.install()'),
    );
    expect(recovery).toContain('const recoveryReportModel = (surfaces: any) =>');
    expect(recovery).toContain('entryDescriptor: { ...focusedDescriptor, prefix }');
    expect(recovery).toContain('entryDescriptor: surfacePresentation.entryDescriptor');
    expect(recovery).toContain(
      'surface.entryDescriptor ? { entryDescriptor: surface.entryDescriptor } : {}',
    );
    expect(recovery).toContain('const recoveryHierarchyNode = (surface: any) =>');
    expect(recovery).toContain("['hierarchy-commit-v1', 'hierarchy-commit-v2']");
    expect(recovery).toContain('browserWindow.ManatOS?.semanticChangeReport?.hierarchy?.({');
    expect(recovery).toContain('flattenWorkspaceMutations(surface?.changes?.workspaceTransaction)');
    expect(recovery).toContain('browserWindow.ManatOS?.semanticReportPresentation?.render?.(');
    expect(recovery).toContain('data-workspace-recovery-report');
  });
});
