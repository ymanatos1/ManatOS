import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (path: string) =>
  readFileSync(new URL(path, import.meta.url), 'utf8');

describe('generic discrete-value option presentation', () => {
  it('supports presentation-only optionItems without turning open string fields into enums', () => {
    const contracts = source('../../shared/src/bo-metadata-types.ts');
    const metadata = source('../../shared/src/bo-metadata.ts');

    expect(contracts).toContain('optionItems?: readonly SysBOEnumItemMetadata[]');
    expect(metadata).toContain('const externalAuthProviderOptionItems = [');
    expect(metadata).toContain('optionItems: externalAuthProviderOptionItems');
    expect(metadata).toContain("type: 'string'");
  });

  it('renders option labels/icons generically in lists, related collections and entry display names', () => {
    const list = source('../views/pages/metadata-driven/bo-list-metadata.ejs');
    const related = source('../views/pages/metadata-driven/ui-components/related-collections.ejs');
    const entry = source('../views/pages/metadata-driven/bo-entry-metadata.ejs');
    const routes = source('../src/routes/sysbo-routes.ts');

    expect(list).toContain('const optionItem = metadataOptionItemForField;');
    expect(list).toContain('primaryOptionItem');
    expect(related).toContain('optionItemForField(canonicalField, renderedValue.raw)');
    expect(related).not.toContain("collectionField.format === 'auth-provider'");
    expect(entry).toContain('const optionItemForField = metadataOptionItemForField;');
    expect(routes).toContain('primaryField?.optionItems || []');
    expect(routes).not.toContain('providerDefinition?.label ?? displayValue');
  });

  it('uses canonical option metadata instead of domain-specific value formatters', () => {
    const contracts = source('../../shared/src/bo-ui-metadata-types.ts');
    const canonical = source('../../shared/src/bo-metadata.ts');
    const uiMetadata = source('../../shared/src/bo-ui-metadata.ts');
    const entry = source('../views/pages/metadata-driven/bo-entry-metadata.ejs');
    const presentation = source('../src/presentation/metadata-value-presentation.ts');

    expect(canonical).toContain("{ value: 'internal', label: 'ManatOS', icon: 'shield-check' }");
    expect(canonical).toContain('...externalAuthProviderOptionItems');
    expect(uiMetadata).not.toContain("format: 'verification-source'");
    expect(contracts).not.toContain("'verification-source'");
    expect(contracts).not.toContain("'auth-provider'");
    expect(entry).not.toContain("presentation.format === 'verification-source'");
    expect(presentation).not.toContain('verification-source');
  });

});
