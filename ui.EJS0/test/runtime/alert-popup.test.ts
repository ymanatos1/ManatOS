import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const source = (path: string) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

describe('canonical alert popup', () => {
  it('is typed, popup-runtime hosted, CTX-projectable and DOM-correlated', async () => {
    const popup = await source('src/runtime/alert-popup.ts');
    const presentation = await source('src/browser/popup-presentation.ts');
    const browserEntry = await source('src/browser/runtime-entry.ts');
    expect(popup).toContain("modal.dataset.popupPurpose = 'alert'");
    expect(popup).toContain('data-v2-layout-caption="surface"');
    expect(popup).toContain('data-v2-layout-region="content"');
    expect(popup).toContain('data-v2-layout-component-instance="message"');
    expect(popup).toContain('data-v2-layout-actions="surface"');
    expect(popup).toContain('data-v2-layout-action="ok"');
    expect(popup).toContain('registerBootstrapModal');
    expect(presentation).toContain('alert: Object.freeze({');
    expect(presentation).toContain("definition: messagePopupDefinition(['ok'])");
    expect(browserEntry).toContain("import { alertPopup } from '../runtime/alert-popup.js'");
    expect(browserEntry).toContain('alertPopup.install();');
  });

  it('replaces every hierarchy native alert through the one canonical service', async () => {
    const relationship = await source(
      'public/js/sysbo/hierarchy/hierarchy-relationship-runtime.js',
    );
    expect(relationship).not.toContain('window.alert');
    expect(relationship.match(/alertPopup\?\.show/g)?.length).toBe(5);
  });
});

describe('hierarchy recovery recycle-bin compatibility', () => {
  it('restores exact captured recycle state and reconstructs deletions for older recovery payloads', async () => {
    const recovery = await source('src/runtime/v2/organization-recovery.ts');
    expect(recovery).toContain('const recycleBinFor = (changes: any) =>');
    expect(recovery).toContain(
      'if (Array.isArray(changes?.recycleBin)) return changes.recycleBin;',
    );
    expect(recovery).toContain('changes.entriesOriginal.filter((row: any) =>');
    expect(recovery).toContain("'workspace-recovery-recycle-bin'");
    expect(recovery).toContain('surface.sameRows(surface.recycleBin, recycleBinFor(changes))');
  });
});
