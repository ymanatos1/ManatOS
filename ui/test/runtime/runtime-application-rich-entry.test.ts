import { readFileSync } from 'node:fs';
import {
  resolveSysBOUIView,
  sysBOApplicationsMetadata,
  sysBOApplicationsUIMetadata,
} from '@manatos/shared';
import { describe, expect, it } from 'vitest';

const source = (relativePath: string) =>
  readFileSync(new URL(relativePath, import.meta.url), 'utf8');

describe('V2 Application rich-entry acceptance', () => {
  it('keeps Application-specific composition declarative while generic V2 infrastructure owns state', () => {
    const renderer = source('../../src/routes/sysbo/entry/renderer.ts');
    const collectionProjection = source(
      '../../src/runtime/state/collection-resource-projection.ts',
    );

    const applicationUIView = resolveSysBOUIView(sysBOApplicationsUIMetadata).metadata;

    expect(sysBOApplicationsMetadata.fieldDefinition.version?.createDefaultValue).toBe('0.0.1');
    expect(applicationUIView.record.relatedCollections?.licenses).toMatchObject({
      entityKey: 'sys-licenses',
      source: { kind: 'entity-query', filterField: 'applicationId', currentField: 'id' },
    });
    expect(sysBOApplicationsUIMetadata.list?.rowActions?.quickView).toMatchObject({
      kind: 'open-entry',
      uiView: 'quickView',
      mode: 'view',
    });
    const quickView = resolveSysBOUIView(sysBOApplicationsUIMetadata, 'quickView').metadata;
    expect(quickView.record.readOnly).toBe(true);
    expect(quickView.record.tabs.map((tab) => tab.id)).toEqual(['general', 'licenses', 'system']);
    expect(quickView.record.tabs.find((tab) => tab.id === 'licenses')?.content).toEqual([
      { kind: 'column', content: [{ kind: 'collection', collection: 'licenses' }] },
    ]);
    expect(sysBOApplicationsUIMetadata.list?.rowActions?.play).toMatchObject({
      href: '/bo/sys-applications/{id}/play',
    });

    expect(renderer).toContain('projectCollectionResources(');
    expect(renderer).not.toContain("definition.key === 'sys-applications'");
    expect(collectionProjection).not.toContain('sys-applications');
    expect(collectionProjection).not.toContain('applicationId');
  });
});
