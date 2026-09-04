import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (path: string) =>
  readFileSync(new URL(path, import.meta.url), 'utf8');

describe('generic discrete-value option presentation', () => {
  it('supports presentation-only optionItems without turning open string fields into enums', () => {
    const contracts = source('../../shared/src/metadata/bo/types.ts');
    const metadata = source('../../shared/src/metadata/bo/identity.ts');
    const commonMetadata = source('../../shared/src/metadata/bo/common.ts');

    expect(contracts).toContain('optionItems?: readonly SysBOEnumItemMetadata[]');
    expect(commonMetadata).toContain('export const externalAuthProviderOptionItems = [');
    expect(metadata).toContain('optionItems: externalAuthProviderOptionItems');
    expect(metadata).toContain("type: 'string'");
  });

  it('renders option labels/icons generically in lists, related collections and entry display names', () => {
    const list = source('../views/pages/sysbo/list.ejs');
    const related = source('../views/components/sysbo/collections/related-collections.ejs');
    const entry = source('../views/pages/sysbo/entry.ejs');
    const supplemental = source('../src/routes/sysbo/entry-supplemental-data.ts');

    expect(list).toContain('const optionItem = metadataOptionItemForField;');
    expect(list).toContain('primaryOptionItem');
    expect(related).toContain('optionItemForField(canonicalField, renderedValue.raw)');
    expect(related).not.toContain("collectionField.format === 'auth-provider'");
    expect(entry).toContain('const optionItemForField = metadataOptionItemForField;');
    expect(supplemental).toContain('primaryField?.optionItems || []');
    expect(supplemental).not.toContain('providerDefinition?.label ?? displayValue');
  });

  it('uses canonical option metadata instead of domain-specific value formatters', () => {
    const contracts = source('../../shared/src/metadata/ui/types.ts');
    const canonical = source('../../shared/src/metadata/bo/identity.ts');
    const uiMetadata = source('../../shared/src/bo-ui-metadata.ts');
    const entry = source('../views/pages/sysbo/entry.ejs');
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
