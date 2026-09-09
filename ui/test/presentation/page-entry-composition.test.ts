import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const source = (relativePath: string) =>
  readFile(resolve(testDirectory, '..', '..', relativePath), 'utf8');

describe('page and popup composition boundaries', () => {
  it('keeps breadcrumb navigation in the shell and composes entry pages from reusable page components', async () => {
    const shell = await source('views/layout/shell.ejs');
    const titlebar = await source('views/components/page/titlebar.ejs');
    const entryPage = await source('views/components/page/entry-page.ejs');
    const entryV2 = await source('views/pages/sysbo/entry.ejs');
    const renderer = await source('src/routes/sysbo/record-renderer.ts');

    expect(shell).toContain('class="page-breadcrumb workspace-breadcrumb"');
    expect(titlebar).not.toContain('workspace-breadcrumb');
    expect(entryPage).not.toContain('workspace-breadcrumb');

    expect(shell).toContain("include('../components/page/titlebar')");
    expect(entryPage).toContain("include('./titlebar')");
    expect(entryPage).toContain('include(entryContentPartial)');
    expect(entryPage).toContain('data-entry-page-component');
    expect(entryPage).toContain('data-entry-page-content');

    expect(entryV2).toContain("if (typeof entryPopupHost !== 'undefined' && entryPopupHost)");
    expect(entryV2).toContain("include('../../components/runtime/entity-entry')");
    expect(entryV2).toContain("include('../../components/page/entry-page'");
    expect(renderer).toContain("workspaceFrameOwner: 'content'");
    expect(renderer).not.toContain('engineSelection');
  });

  it('does not render page-navigation chrome inside hosted entry popups', async () => {
    const shell = await source('views/layout/shell.ejs');

    expect(shell).toContain('const isEntryPopupHost');
    expect(shell).toContain('if (!isEntryPopupHost)');
    expect(shell).not.toContain('body.entry-popup-host .workspace-heading-row');
    expect(shell).not.toContain('body.entry-popup-host .workspace-titlebar');
    expect(shell).toContain('if (contentOwnsWorkspaceFrame)');
  });
});
