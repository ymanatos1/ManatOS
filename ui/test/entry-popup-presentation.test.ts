import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const source = (relativePath: string) =>
  readFile(resolve(testDirectory, '..', relativePath), 'utf8');

describe('generic hosted metadata entry popup', () => {
  it('reuses the canonical entry route and caller override resolver for related creation', async () => {
    const field = await source('public/js/sysbo/entry/field-runtime.js');
    const reference = await source('views/components/sysbo/entry/fields/reference-select.ejs');
    const renderer = await source('src/routes/sysbo/record-renderer.ts');
    const invocation = await source('src/routes/sysbo/entry-invocation.ts');

    expect(reference).toContain("action: 'add-entry'");
    expect(reference).toContain('field.referenceSelection?.createRelated');
    expect(reference).toContain("...(referenceTargetMetadata ? [{ action: 'add-entry'");
    expect(field).toContain('createRelated = createRelated || {}');
    expect(field).toContain("case 'add-entry'");
    expect(field).toContain("purpose: 'reference-field-add-entry'");
    expect(field).toContain('_entryDefaults: JSON.stringify(defaults)');
    expect(field).toContain('_entryOverrides: JSON.stringify(overrides)');
    expect(renderer).toContain('effectiveEntryUIMetadata(canonicalMetadataUI, invocation)');
    expect(invocation).toContain('fieldOverrides:');
  });

  it('returns canonical save results and lets hierarchy nodes host the same entry in view mode', async () => {
    const popup = await source('public/js/popups/entry-popup.js');
    const write = await source('src/routes/sysbo/entry-write.ts');
    const tree = await source('public/js/sysbo/hierarchy/hierarchy-tree.js');

    expect(popup).toContain("kind: 'entry-popup'");
    expect(popup).toContain("'manatos:entry-popup-saved'");
    expect(popup).toContain("'manatos:entry-popup-cancel'");
    expect(popup).not.toContain("'manatos:entry-popup-size'");
    expect(popup).not.toContain('ResizeObserver');
    expect(popup).toContain('data-entry-popup-ctx');
    expect(tree).toContain("document.body.classList.contains('entry-popup-host')");
    expect(write).toContain("type: 'manatos:entry-popup-saved'");
    expect(write).toContain('resolveEntryRepresentation');
    expect(tree).toContain("purpose: 'hierarchy-view-entry'");
    expect(tree).toContain("_entryMode: 'view'");

    const pages = await source('public/css/pages.css');
    expect(pages).toContain('width: min(1120px, calc(100vw - 3rem))');
    expect(pages).toContain('height: min(820px, calc(100vh - 3rem))');
  });
});
