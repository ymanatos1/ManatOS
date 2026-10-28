import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Owner identities and popup teardown must be enforced, not weakened at the root guard. */
describe('NG1 Entry/List Surface lifecycle contract', () => {
  const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
  it('reuses the same Entry despite presentation/permission refreshes', () => {
    const context = source('src/components/sys-bo/entry/EntryContext.ts');
    expect(context).toContain('tree.get(this.runtime.levelPath) === this.runtime.level');
    expect(context).not.toContain('this.permissionSignature === signature');
    expect(context).toContain('this.surfaces.closeDescendants(runtime.levelPath)');
  });
  it('does not destroy edited Surfaces on browser-tab visibility changes in either UI', () => {
    const angular = source('../ui.NG1/src/app/app.component.ts');
    const ejs = source('../ui.EJS1/src/browser.ts');
    expect(angular).not.toContain("@HostListener('document:visibilitychange')");
    expect(ejs).not.toContain("addEventListener('visibilitychange'");
    expect(angular).toContain('private async restoreSession()');
    expect(ejs).toContain('accountSession.restore()');
  });
  it('guards List state and reference viewing capabilities', () => {
    const header = source('src/components/sys-bo/list/header/ListHeader.html');
    const reference = source('src/components/sys-bo/fields/types/ReferenceField.html');
    const presentation = source('../shared.UI/src/components/entry/EntryMetadata.ts');
    const context = source('src/components/sys-bo/entry/EntryContext.ts');
    expect(header).toContain('context.level()?.state?.list?.selectionMode');
    expect(header).not.toContain('context.level()?.state.list.selectionMode');
    expect(presentation).toContain('readonly canViewRelated?: boolean;');
    expect(context).toContain('canViewRelated: this.surfaces?.canReadEntity');
    expect(reference).toContain('field().canViewRelated !== true');
  });
  it('removes popup descendants before replacing a List or Entry root', () => {
    const manager = source('src/runtime/surfaces/uiSurfaceManager.ts');
    const list = source('src/components/sys-bo/list/ListContext.ts');
    expect(manager).toContain('closeDescendants(parentLevelPath: string)');
    expect(manager).toContain("this.closeEntry(entry, 'host')");
    expect(list).toContain('this.surfaces.closeDescendants(runtime.levelPath)');
  });
});
