import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFile(new URL(path, import.meta.url), 'utf8');

describe('Organization hierarchy member state indicators', () => {
  it('uses one canonical entry-state projection for active and recycle-bin members', async () => {
    const [tree, workspace] = await Promise.all([
      read('../../public/js/sysbo/hierarchy/hierarchy-tree.js'),
      read('../../views/components/sysbo/hierarchy/hierarchy-workspace.ejs'),
    ]);
    expect(workspace).toContain("originalSource: 'list.originalEntries'");
    expect(tree).toContain('window.ManatOS?.organizationHierarchyEntryState');
    expect(tree).toContain('const entryStateIndicator = (row) =>');
    expect(tree).toContain('${esc(label)}${entryStateIndicator(row)}');
    expect(tree).toContain("${workspaceMode ? entryStateIndicator(row) : ''}");
    expect(tree.match(/metadata-hierarchy-node-changed/g)?.length).toBe(1);
  });

  it('does not introduce a separate new-state indicator', async () => {
    const tree = await read('../../public/js/sysbo/hierarchy/hierarchy-tree.js');
    expect(tree).not.toContain('metadata-hierarchy-node-new');
  });
});
