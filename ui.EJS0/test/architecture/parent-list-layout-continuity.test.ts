import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFile(resolve(process.cwd(), path), 'utf8');

describe('parent List #layout continuity across child page navigation', () => {
  it('has one canonical list presentation definition reused by list and parent reconstruction', async () => {
    const [presentation, listRenderer, parentList] = await Promise.all([
      source('src/routes/sysbo/list/presentation.ts'),
      source('src/routes/sysbo/list/renderer.ts'),
      source('src/routes/sysbo/list/parent-list.ts'),
    ]);

    expect(presentation).toContain('export function listPresentationDefinition');
    expect(presentation).toContain("rendererRef: 'list-part:count'");
    expect(presentation).toContain("rendererRef: 'title:surface'");
    expect(listRenderer).toContain(
      'presentationDefinition: listPresentationDefinition(listMetadata)',
    );
    expect(parentList).toContain('presentationDefinition: listPresentationDefinition(');
  });

  it('carries the exact parent list presentation through Entry and Hierarchy bootstrap reconstruction', async () => {
    const [entryRenderer, hierarchyRenderer, host] = await Promise.all([
      source('src/routes/sysbo/entry/renderer.ts'),
      source('src/routes/sysbo/hierarchy/renderer.ts'),
      source('public/js/runtime/ui-host-runtime.js'),
    ]);

    expect(entryRenderer).toContain(
      'parentPresentationDefinition: parentListContext.presentationDefinition',
    );
    expect(hierarchyRenderer).toContain(
      'parentPresentationDefinition: parentListContext.presentationDefinition',
    );
    expect(
      host.match(/presentationDefinition: bootstrap\.parentPresentationDefinition/g),
    ).toHaveLength(2);
  });
});
