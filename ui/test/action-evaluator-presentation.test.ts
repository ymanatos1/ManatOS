import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const source = (relativePath: string) =>
  readFile(resolve(testDirectory, '..', relativePath), 'utf8');

describe('evaluator-backed action presentation', () => {
  it('resolves list Add visible/enabled/reason from metadata against CTX facts', async () => {
    const listRenderer = await source('src/routes/sysbo/list-renderer.ts');
    const list = await source('views/pages/sysbo/list.ejs');

    expect(listRenderer).toContain('const resolvedAddAction = {');
    expect(listRenderer).toContain('sourcePath: `list.addAction.${property}`');
    expect(listRenderer).toContain('addConstraintReached');
    expect(list).toContain('resolvedAddAction.resolvedVisible');
    expect(list).toContain('resolvedAddAction.resolvedEnabled');
    expect(list).not.toContain('permissions.create && metadataUI.list.addAction.visible');
    expect(list).not.toContain('addActionDisabled');
  });

  it('lets entry action metadata own visibility/enabled policy without renderer permission gates', async () => {
    const entry = await source('views/pages/sysbo/entry.ejs');

    expect(entry).toContain('dynamicUIValue(action.visible');
    expect(entry).toContain('dynamicUIValue(action.enabled ?? true');
    expect(entry).toContain('dynamicUIValue(action.disabledReason ?? null');
    expect(entry).not.toContain('permissions.delete && deleteAction');
  });
});
