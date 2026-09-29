import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const source = (relativePath: string) =>
  readFile(resolve(testDirectory, '..', '..', relativePath), 'utf8');

describe('semantic change presentation', () => {
  it('is a domain-neutral canonical metadata adapter for change-report consumers', async () => {
    const semantic = await source('src/runtime/semantic-change-presentation.ts');
    const report = await source('src/runtime/hierarchical-report.ts');
    const picture = await source('src/runtime/picture-value-presentation.ts');
    expect(semantic).toContain('metadata?.fieldDefinition?.[fieldKey]');
    expect(semantic).toContain('metadata?.pluralLabel || metadata?.label || entityKey');
    expect(semantic).toContain("context?.icon || context?.metadata?.icon || 'box'");
    expect(semantic).toContain('for (const node of model?.nodes || []) presentNode(node);');
    expect(semantic).toContain('node.label = entityLabel(entityKey)');
    expect(semantic).toContain("metadata?.label || fieldKey || 'Field'");
    expect(semantic).toContain('export class SemanticChangePresentation');
    expect(semantic).toContain('browserWindow.ManatOS.semanticChangePresentation = Object.freeze');
    expect(semantic).toContain('changeDetail');
    expect(semantic).toContain('options.ownerWorkspaceState === true');
    expect(semantic).toContain('options.fallbackIdentity');
    expect(semantic).toContain("kind: 'email'");
    expect(report).toContain('metadata-readonly-email');
    expect(semantic).toContain('effectiveFieldOptions(entityKey, fieldKey, ownerPath)');
    expect(semantic).toContain('level?.data?.fields?.[fieldKey]?.options');
    expect(semantic).toContain("fieldType === 'guid'");
    expect(semantic).toContain('metadata?.readOnly === true');
    expect(semantic).not.toContain("startsWith('draft:')");
    expect(semantic).toContain("kind: 'system-identifier'");
    expect(semantic).toContain("kind: 'option-badge'");
    expect(semantic).toContain("fieldType === 'reference'");
    expect(semantic).toContain("fieldType === 'enum' || (metadata?.optionItems?.length ?? 0) > 0");
    expect(semantic.indexOf("fieldType === 'reference'")).toBeLessThan(
      semantic.indexOf("kind: 'option-badge'"),
    );
    expect(report).toContain('metadata-system-identifier');
    expect(report).toContain("descriptor.kind === 'option-badge'");
    expect(report).toContain('badge text-bg-${html(tone)}');
    expect(semantic).toContain('descriptorValue?.ownerWorkspaceState === true');
    expect(semantic).toContain('context?.entryRepresentation');
    expect(semantic).toContain('resolver.resolve(config, row || {}, {');
    expect(semantic).toContain('ownerWorkspaceState: options.ownerWorkspaceState === true');
    expect(semantic).toContain('relationshipForField');
    expect(semantic).toContain('referenceDescriptor');
    expect(semantic).toContain('presentReportModel');
    expect(semantic).toContain("component === 'picture'");
    expect(semantic).toContain('pictureValuePresentation?.scalarDescriptor?.(');
    expect(semantic).toContain('pictureValuePresentation?.collectionDescriptor?.(');
    expect(semantic).toContain("fieldType === 'boolean' || typeof value === 'boolean'");
    expect(semantic).toContain("kind: 'boolean-badge'");
    expect(semantic).toContain('const pictureShaped =');
    expect(semantic).toContain("fieldKey: String(fieldKey || '')");
    expect(semantic).not.toContain('imageResourceKey');
    expect(picture).toContain('imageResourceKey: resourceKey');
    expect(semantic).toContain('rawValue');
    expect(semantic).toContain('data.resources.referenceData.${fieldKey}');
    expect(semantic).toContain('let level = ctx?.value?.ui?.level');
    expect(semantic).toContain('level = level?.level');
    expect(semantic).toContain('candidateLevel?.data?.resources?.referenceData?.[fieldKey]');
    expect(semantic).toContain('return catalogues.flat()');
    expect(semantic).toContain('relationship?.references?.objectKey');
    expect(semantic).toContain('entryRepresentation?.projected?.(option, value)');
    expect(semantic).toContain('ownerWorkspaceState: presentation.ownerWorkspaceState === true');
    expect(report).toContain(
      "descriptor.ownerWorkspaceState === true ? ' class=\"fst-italic\"' : ''",
    );
    expect(semantic).not.toContain('option?.__entryName || option?.label');
    expect(semantic).not.toContain('Principal');
    expect(semantic).not.toContain('Organization');
    expect(semantic).not.toContain('sys-principals');
  });

  it('loads before report/recovery consumers and recovery uses it for both diff forms', async () => {
    const shell = await source('views/layout/shell.ejs');
    const browserEntry = await source('src/browser/runtime-entry.ts');
    const recovery = await source('src/runtime/workspace-recovery.ts');
    expect(shell).not.toContain('/js/runtime/semantic-change-presentation.js');
    expect(shell).not.toContain('/js/runtime/hierarchical-report.js');
    expect(shell).not.toContain('/js/runtime/workspace-recovery.js');
    expect(browserEntry).toContain("from '../runtime/semantic-change-presentation.js'");
    expect(browserEntry).toContain("from '../runtime/hierarchical-report.js'");
    expect(browserEntry).toContain("from '../runtime/workspace-recovery.js'");
    expect(browserEntry.indexOf('semanticChangePresentation.install()')).toBeLessThan(
      browserEntry.indexOf('hierarchicalReportRenderer.install()'),
    );
    expect(browserEntry.indexOf('hierarchicalReportRenderer.install()')).toBeLessThan(
      browserEntry.indexOf('workspaceRecoveryController.install()'),
    );
    expect(recovery).toContain('browserWindow.ManatOS?.semanticChangeReport?.hierarchy?.({');
    expect(recovery).toContain(
      'browserWindow.ManatOS?.semanticChangeReport?.recoveredFieldDelta?.({',
    );
    expect(recovery).toContain('semanticReportPresentation?.render?.(');
    expect(recovery).toContain('semanticReportPresentation?.recovered?.(surfaces)');
    expect(recovery).toContain('level?.userChanges?.runtimeResources');
  });
});
