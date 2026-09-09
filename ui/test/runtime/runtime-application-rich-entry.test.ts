import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (relativePath: string) =>
  readFileSync(new URL(relativePath, import.meta.url), 'utf8');

describe('V2 Application rich-entry acceptance', () => {
  it('keeps Application-specific composition declarative while generic V2 infrastructure owns state', () => {
    const businessUi = source('../../../shared/src/metadata/ui/business.ts');
    const renderer = source('../../src/routes/sysbo/record-renderer.ts');
    const collectionProjection = source(
      '../../src/runtime/state/collection-resource-projection.ts',
    );

    expect(businessUi).toContain("licenses: relatedLicensesCollection('applicationId')");
    expect(businessUi).toContain("version: { createDefaultValue: '0.0.1' }");
    expect(businessUi).toContain("href: '/bo/sys-applications/{id}/play'");

    expect(renderer).toContain('projectCollectionResources(');
    expect(renderer).not.toContain("definition.key === 'sys-applications'");
    expect(collectionProjection).not.toContain('sys-applications');
    expect(collectionProjection).not.toContain('applicationId');
  });
});
