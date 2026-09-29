import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('generic related-collection presentation', () => {
  it('resolves canonical row entry presentation at the component/rendering boundary', () => {
    const view = readFileSync(
      new URL(
        '../../views/components/sysbo/entry/content/related-collections.ejs',
        import.meta.url,
      ),
      'utf8',
    );
    const entry = readFileSync(
      new URL('../../views/components/runtime/entity-entry.ejs', import.meta.url),
      'utf8',
    );
    const entryIcons = readFileSync(
      new URL('../../views/components/sysbo/entry/shell/entry-icons.ejs', import.meta.url),
      'utf8',
    );
    const loader = readFileSync(
      new URL('../../src/routes/sysbo/related/collections.ts', import.meta.url),
      'utf8',
    );
    const collectionEditors = readFileSync(
      new URL('../../src/routes/sysbo/related/collection-editor-metadata.ts', import.meta.url),
      'utf8',
    );
    const renderPage = readFileSync(
      new URL('../../src/presentation/page/render-page.ts', import.meta.url),
      'utf8',
    );
    const identity = `${readFileSync(
      new URL('../../../shared/src/metadata/ui/manatos/auth/ui-users.ts', import.meta.url),
      'utf8',
    )}
${readFileSync(
  new URL(
    '../../../shared/src/metadata/ui/manatos/auth/ui-external-identities.ts',
    import.meta.url,
  ),
  'utf8',
)}`;
    const business = `${readFileSync(
      new URL(
        '../../../shared/src/metadata/ui/manatos/principals/ui-principals.ts',
        import.meta.url,
      ),
      'utf8',
    )}
${readFileSync(
  new URL(
    '../../../shared/src/metadata/ui/platforms/protocrm/applications/ui-applications.ts',
    import.meta.url,
  ),
  'utf8',
)}`;
    const common = readFileSync(
      new URL('../../../shared/src/metadata/ui/common.ts', import.meta.url),
      'utf8',
    );
    const pagesCss = readFileSync(new URL('../../public/css/pages.css', import.meta.url), 'utf8');

    // Routes load domain rows and relationship/reference data only. They must not
    // manufacture presentation properties that metadata + the renderer can derive.
    expect(loader).not.toContain('resolveEntryRepresentation(');
    expect(loader).not.toContain('__entryName');
    expect(loader).not.toContain('__entryIcons');
    expect(view).toContain('data-value-object-entry');
    expect(view).toContain('const valueObjectDescriptor = !panelRowHref');
    expect(loader).not.toContain('closeMetadataRecordShape');
    expect(loader).toContain('const completeRelatedRows = [...relatedPage.items]');
    expect(loader).toContain(
      'Caller-supplied factual rows cross the same canonical projection boundary',
    );
    expect(loader).toContain('createCalculatedRecordProjector(relatedMetadata, ctx');
    expect(loader).toContain('sysBOEntityListDataSource(');
    expect(loader).toContain("purpose: 'project calculated related-collection record field'");
    expect(loader).not.toContain('.filter((fieldKey) => row[fieldKey] === undefined)');
    expect(loader).toContain(
      'const presentationEntityKey = collection.relatedEntityKey ?? collection.entityKey',
    );
    expect(loader).toContain('const bridgeReferenceField =');
    expect(loader).toContain('relationshipForField(relatedDefinition.boMetadata, field.key)');
    expect(loader).toContain(
      'collectionResourceData[sourceKey] = { rows: presentationRows, references: {} };',
    );
    expect(loader).not.toContain('relatedData');
    expect(loader).not.toContain('relatedReferenceData');
    expect(loader).toContain(
      'collectionResourceData[sourceKey].references = await references(req, presentationDefinition',
    );
    expect(loader).toContain('const editableCollectionSources = collectionEditorSourceKeys');
    expect(loader).toContain('if (!editableCollectionSources.has(sourceKey)) continue;');

    // A relationship-backed collection is projected to its declared presentation
    // entity before rendering, identically for read-only/full/quick surfaces. Editors
    // consume that same target-shaped resource rather than owning a second hydration path.
    expect(collectionEditors).toContain("component?.key === 'collection-editor'");
    expect(collectionEditors).toContain('descriptors.set(sourceKey');

    // The rendering boundary combines the canonical row, object metadata and UI
    // entry metadata without any entity-specific route branch.
    expect(renderPage).toContain('const entryRepresentationFor = (');
    expect(renderPage).toContain('resolveEntryRepresentation(');
    expect(renderPage).toContain(
      'allSysBOUIMetadata[entityKey as keyof typeof allSysBOUIMetadata]',
    );

    // The common related-collection component owns row-entry icon placement.
    expect(view).toContain(
      'entryRepresentationFor(collection.relatedEntityKey || collection.entityKey, row, relatedRowIcon)',
    );
    expect(view).toContain("include('../shell/entry-icons'");
    expect(entryIcons).toContain('entryRepresentation?.icons');
    expect(entryIcons).toContain('metadata-entry-icon-<%= iconIndex %>');
    expect(view).toContain('metadata-related-primary-value');
    expect(view).toContain('metadata-related-primary-cell');
    expect(view).toContain('--metadata-related-field-count:');
    expect(pagesCss).toContain(
      'grid-template-columns: repeat(var(--metadata-related-field-count, 1), minmax(0, 1fr));',
    );
    expect(view).toContain(
      'const relatedRowActionable = Boolean(panelRowHref || valueObjectDescriptor)',
    );
    expect(view).toContain('const relatedPrimaryField = rowMetadata?.primaryField');
    expect(view).toContain('metadata-related-entry-link');
    expect(view).toContain('data-related-list-view-action');
    expect(view).toContain('data-related-list-view-panel');
    expect(entry).toContain(
      "tab: { content: [{ kind: 'collection', collection: content.collection }] }",
    );
    expect(view).not.toContain("const relatedViewOnly = recordMode === 'view'");
    expect(view).toContain('data-related-entry-view-popup');
    expect(view).toContain('data-related-entry-entity-key');
    expect(view).toContain('_entryMode=view');
    expect(view).toContain('optionItemForField(canonicalField, renderedValue.raw)');
    // Panel-list collections must resolve reference ids through the same canonical
    // reference catalogue as table-list collections instead of exposing junction GUIDs.
    expect(view.match(/canonicalField\?\.type === 'reference'/g)?.length).toBeGreaterThanOrEqual(2);
    expect(view).toMatch(
      /relatedReferenceRepresentation\(\s*collectionSourceKey,\s*collectionFieldKey,\s*renderedValue\.raw\s*\)/,
    );
    expect(entry).toContain(
      'const relatedReferenceRepresentation = (sourceKey, fieldKey, value) =>',
    );
    expect(entry).toContain('projectedReferenceRepresentation(match, value)');
    expect(
      view.match(/entryRepresentation: referenceRepresentation/g)?.length,
    ).toBeGreaterThanOrEqual(2);
    expect(view).not.toContain("definition.key === 'sys-users'");
    expect(view).not.toContain("collectionField.format === 'auth-provider'");
    expect(view).toContain("format: 'date'");
    expect(view).toContain("format: 'datetime-elapsed'");

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
  it('resolves related-row expression ASTs from canonical authored source and evaluates them against CTX', () => {
    const entry = readFileSync(
      new URL('../../views/components/runtime/entity-entry.ejs', import.meta.url),
      'utf8',
    );
    const view = readFileSync(
      new URL(
        '../../views/components/sysbo/entry/content/related-collections.ejs',
        import.meta.url,
      ),
      'utf8',
    );
    const runtime = readFileSync(
      new URL('../../public/js/sysbo/entry/entry-policy-runtime.js', import.meta.url),
      'utf8',
    );
    const formRuntime = readFileSync(
      new URL('../../public/js/sysbo/entry/form-runtime.js', import.meta.url),
      'utf8',
    );
    const expressionRuntime = readFileSync(
      new URL('../../public/js/sysbo/entry/expression-runtime.js', import.meta.url),
      'utf8',
    );
    const contextRuntime = readFileSync(
      new URL('../../public/js/runtime/context-runtime.js', import.meta.url),
      'utf8',
    );

    // Canonical related-entity calculations are materialized once at the record
    // projection boundary. Presentation may evaluate only an expression explicitly
    // authored by the related-collection field itself.
    expect(entry).toContain('resolveProjectedRelatedCollectionValue(row, fieldKey, field)');
    expect(entry).not.toContain('canonicalCalculation');
    expect(entry).not.toContain('relatedMetadata?.fieldDefinition?.[fieldKey]?.calculation');
    expect(entry).not.toContain("purpose: 'resolve V2 related collection value'");
    expect(entry).not.toContain("purpose: 'resolve V2 related collection tone'");
    expect(entry).not.toContain("purpose: 'resolve V2 related collection icon'");
    expect(view).toContain('data-v2-related-value-expression');
    expect(view).toContain('data-v2-related-tone-expression');
    expect(view).toContain('data-v2-related-icon-expression');
    expect(view).not.toContain('compileUIExpression(renderedValue.expression).ast');
    expect(runtime).toContain('refreshRelatedCollectionPresentation');
    expect(runtime).toContain(
      'expressions.loadAstForSource(host.dataset.v2RelatedValueExpression)',
    );
    expect(view).not.toContain('data-v2-related-value-ast');
    expect(view).toContain('data-v2-related-row-index');
    expect(view).not.toContain('data-v2-related-scope-keys');
    expect(runtime).toContain('.collections[${JSON.stringify(sourceKey)}].current[${rowIndex}]');
    expect(runtime).toContain('expressions.evaluateAstOwnedAt(valueAst, rowPath)');
    expect(runtime).toContain('expressions.evaluateAstOwnedAt(toneAst, rowPath)');
    expect(runtime).toContain('expressions.evaluateAstOwnedAt(iconAst, rowPath)');
    expect(runtime).not.toContain('expressions.evaluateAstOwnedWithScope');
    expect(formRuntime).toContain(
      'evaluateAstOwnedAt: (ast, scopePath) => evaluateOwned(ast, scopePath || null)',
    );
    expect(expressionRuntime).toContain(
      'const evaluateOwned = async (node, ownedScopePath = null, evaluationPass = null) =>',
    );
    expect(expressionRuntime).toContain('evaluateAtOwnedPath(node, ownedScopePath)');
    expect(contextRuntime).toContain(
      'if (getExact(candidate) !== undefined) scopes.push(candidate)',
    );
  });
});
