import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const source = (relativePath: string) =>
  readFile(resolve(testDirectory, '..', '..', relativePath), 'utf8');

describe('canonical semantic report presentation boundary', () => {
  it('owns the only report resource-authority adapters above the neutral renderer', async () => {
    const presentation = await source('src/runtime/semantic-report-presentation.ts');
    const renderer = await source('src/runtime/hierarchical-report.ts');

    expect(presentation).toContain('const live = (ownerPath: string | null)');
    expect(presentation).toContain('const recovered = (surfaces: any[])');
    expect(presentation).toContain('uiRuntimeResourceForPath');
    expect(presentation).not.toContain('pictureFieldRuntime?.resolvePendingScalarPicture');
    expect(presentation).toContain('/^recovery-surface:(\\d+)$/.exec');
    expect(presentation).toContain('semanticChangePresentation?.presentReportModel');
    expect(presentation).toContain('hierarchicalReport?.render');
    expect(renderer).not.toContain('uiRuntimeResourceForPath');
    expect(renderer).not.toContain('pictureFieldRuntime?.resolvePendingScalarPicture');
    expect(renderer).not.toContain('descriptor.ownerPath');
  });

  it('routes Entry/Organization Unsaved, Commit and both Recovery reports through the boundary', async () => {
    const entry = await source('public/js/sysbo/entry/state.js');
    const hierarchy = await source('public/js/sysbo/hierarchy/hierarchy-workspace.js');
    const recovery = await source('src/runtime/workspace-recovery.ts');

    expect(entry).toContain('semanticReportPresentation?.live?.(entryPagePath)');
    expect(hierarchy).toContain('semanticReportPresentation?.live?.(pagePath)');
    expect(hierarchy).toContain('semanticReportPresentation?.render?.(');
    expect(hierarchy).not.toContain('enrichCommitReport');
    expect(recovery.match(/semanticReportPresentation\?\.render\?\.\(/g)?.length).toBe(2);
    expect(recovery.match(/semanticReportPresentation\?\.recovered\?\.\(surfaces\)/g)?.length).toBe(
      2,
    );
    expect(recovery).not.toContain(
      'semanticChangePresentation?.presentReportModel?.(report, null)',
    );
    expect(recovery).not.toContain('hierarchicalReport?.render?.(');
  });

  it('keeps picture value presentation canonical and independent from report resource ownership', async () => {
    const semantic = await source('src/runtime/semantic-change-presentation.ts');
    const picture = await source('src/runtime/picture-value-presentation.ts');
    const scalarField = await source('views/components/sysbo/entry/fields/picture-field.ejs');
    const collectionField = await source('views/components/sysbo/entry/fields/pictures-field.ejs');
    const fieldRepresentation = await source(
      'views/components/sysbo/entry/fields/field-representation.ejs',
    );
    expect(semantic).toContain("kind: 'system-identifier'");
    expect(semantic).toContain('resolveMetadataText');
    expect(semantic).toContain('translated(metadata?.label');
    expect(semantic).toContain('const scalarIdentity =');
    expect(semantic).toContain('const selectedIdentity = scalarIdentity(value)');
    expect(semantic).toContain("return { label: '…' }");
    expect(semantic).not.toContain("startsWith('draft:')");
    expect(semantic).toContain('pictureValuePresentation?.scalarDescriptor');
    expect(semantic).toContain('pictureValuePresentation?.collectionDescriptor');
    expect(semantic).not.toContain('/picture/${encodeURIComponent');
    expect(picture).toContain('persistedScalarPictureSource');
    expect(picture).toContain('persistedCollectionPictureSource');
    expect(scalarField).toContain('persistedScalarPictureSource');
    expect(collectionField).toContain('persistedCollectionPictureSource');
    expect(fieldRepresentation).toContain('persistedScalarPictureSource');
    expect(scalarField).not.toContain('`/bo/${definition.key}');
    expect(collectionField).not.toContain('`/bo/${definition.key}');
    expect(picture).toContain('imageResourceKey: resourceKey');
  });
});
