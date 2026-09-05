import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('generic related-collection presentation', () => {
  it('resolves canonical row entry presentation at the component/rendering boundary', () => {
    const view = readFileSync(new URL('../views/components/sysbo/entry/content/related-collections.ejs', import.meta.url), 'utf8');
    const entryIcons = readFileSync(new URL('../views/components/sysbo/entry/shell/entry-icons.ejs', import.meta.url), 'utf8');
    const loader = readFileSync(new URL('../src/routes/sysbo/related-collections.ts', import.meta.url), 'utf8');
    const renderPage = readFileSync(new URL('../src/presentation/render-page.ts', import.meta.url), 'utf8');
    const identity = readFileSync(new URL('../../shared/src/metadata/ui/identity.ts', import.meta.url), 'utf8');
    const business = readFileSync(new URL('../../shared/src/metadata/ui/business.ts', import.meta.url), 'utf8');
    const common = readFileSync(new URL('../../shared/src/metadata/ui/common.ts', import.meta.url), 'utf8');

    // Routes load domain rows and relationship/reference data only. They must not
    // manufacture presentation properties that metadata + the renderer can derive.
    expect(loader).not.toContain('resolveEntryRepresentation(');
    expect(loader).not.toContain('__entryName');
    expect(loader).not.toContain('__entryIcons');

    // The rendering boundary combines the canonical row, object metadata and UI
    // entry metadata without any entity-specific route branch.
    expect(renderPage).toContain('const entryRepresentationFor = (');
    expect(renderPage).toContain('resolveEntryRepresentation(');
    expect(renderPage).toContain('allSysBOUIMetadata[entityKey as keyof typeof allSysBOUIMetadata]');

    // The common related-collection component owns row-entry icon placement.
    expect(view).toContain('entryRepresentationFor(collection.entityKey, row, relatedRowIcon)');
    expect(view).toContain("include('../shell/entry-icons'");
    expect(entryIcons).toContain('entryRepresentation?.icons');
    expect(entryIcons).toContain('metadata-entry-icon-<%= iconIndex %>');
    expect(view).toContain('metadata-related-primary-value');
    expect(view).toContain('metadata-related-primary-cell');
    expect(view).toContain('optionItemForField(canonicalField, renderedValue.raw)');
    expect(view).not.toContain("definition.key === 'sys-users'");
    expect(view).not.toContain("collectionField.format === 'auth-provider'");

    // Current consumers all declare their related collections in metadata.
    expect(identity).toContain('externalIdentities: {');
    expect(business).toContain("licenses: relatedLicensesCollection('principalId')");
    expect(business).toContain("licenses: relatedLicensesCollection('applicationId')");
    expect(business).toContain("entityKey: 'sys-principal-email-addresses'");
    expect(business).toContain("entityKey: 'sys-principal-telephone-numbers'");
    expect(business).toContain("entityKey: 'sys-principal-addresses'");

    // Explicit rowIcon remains a legitimate metadata-level presentation override.
    expect(identity).toContain("rowIcon: 'person-badge'");
    expect(common).toContain("rowIcon: 'key'");
  });
});
