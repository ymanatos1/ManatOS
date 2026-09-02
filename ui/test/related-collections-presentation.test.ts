import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('generic related-collection presentation', () => {
  it('uses one renderer for different related entities and prefixes each real row with an entity icon', () => {
    const view = readFileSync(new URL('../views/pages/metadata-driven/ui-components/related-collections.ejs', import.meta.url), 'utf8');
    const metadata = readFileSync(new URL('../../shared/src/bo-ui-metadata.ts', import.meta.url), 'utf8');
    expect(view).toContain('collection.rowIcon || collection.icon');
    expect(view).toContain('relatedRowIcon');
    expect(view).toContain('metadata-related-primary-value');
    expect(view).toContain('metadata-related-primary-cell');
    expect(view).toContain('optionItemForField(canonicalField, renderedValue.raw)');
    expect(view).not.toContain("collectionField.format === 'auth-provider'");
    expect(metadata).toContain("rowIcon: 'person-badge'");
    expect(metadata).toContain("rowIcon: 'key'");
    expect(view).not.toContain("definition.key === 'sys-users'");
  });
});
