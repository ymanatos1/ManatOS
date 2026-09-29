import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const header = readFileSync(
  new URL('../../views/components/layout/header.ejs', import.meta.url),
  'utf8',
);
const horizontalNav = readFileSync(
  new URL('../../views/components/navigation/horizontal-nav.ejs', import.meta.url),
  'utf8',
);
const page = readFileSync(
  new URL('../../views/pages/documentation-browser.ejs', import.meta.url),
  'utf8',
);
const shellRuntime = readFileSync(
  new URL('../../public/js/shell/shell.js', import.meta.url),
  'utf8',
);
const browserRuntime = readFileSync(
  new URL('../../public/js/system/documentation-browser.js', import.meta.url),
  'utf8',
);
const routes = readFileSync(new URL('../../src/routes/pages/index.ts', import.meta.url), 'utf8');
const repositoryDocs = readFileSync(
  new URL('../../src/documentation/repository-docs.ts', import.meta.url),
  'utf8',
);

describe('repository documentation browser presentation', () => {
  it('opens from the authenticated global header as a separate system window', () => {
    expect(header).not.toContain('id="headerDocumentationButton"');
    expect(horizontalNav).toContain('id="languageMenuButton"');
    expect(horizontalNav).toContain('id="headerDocumentationButton"');
    expect(horizontalNav).toContain('bi-book');
    expect(horizontalNav.indexOf('id="languageMenuButton"')).toBeLessThan(
      horizontalNav.indexOf('id="headerDocumentationButton"'),
    );
    expect(horizontalNav.indexOf('id="headerDocumentationButton"')).toBeLessThan(
      horizontalNav.indexOf('id="debugMenuButton"'),
    );
    expect(shellRuntime).toContain("window.open(\n      '/documentation'");
    expect(shellRuntime).toContain("'manatosDocumentation'");
  });

  it('renders a standalone explorer/viewer workspace rather than a normal UI surface', () => {
    expect(page).toContain('data-documentation-browser');
    expect(page).toContain('data-doc-explorer');
    expect(page).toContain('data-doc-viewer');
    expect(page).toContain('data-doc-resizer');
    expect(page).not.toContain('layout/shell');
    expect(browserRuntime).toContain("'manatos.documentation.explorerWidth'");
    expect(browserRuntime).toContain('window.history.pushState');
    expect(browserRuntime).toContain('resolveDocumentationLink');
  });

  it('discovers documentation resources from the repository tree through readonly signed-in routes', () => {
    expect(routes).toContain("router.get('/documentation', requireSignedIn");
    expect(routes).toContain("router.get('/documentation/manifest', requireSignedIn");
    expect(routes).toContain("router.get('/documentation/content', requireSignedIn");
    expect(repositoryDocs).toContain("['.md', 'markdown']");
    expect(repositoryDocs).toContain("['.svg', 'svg']");
    expect(repositoryDocs).toContain("['.pdf', 'pdf']");
    expect(repositoryDocs).toContain("['.dot', 'dot']");
    expect(repositoryDocs).toContain('insideDocumentationRoot');
    expect(repositoryDocs).toContain("name: 'README.md'");
    expect(repositoryDocs).toContain("path: 'README.md'");
    expect(repositoryDocs).toContain("resourceType: 'markdown'");
    expect(repositoryDocs).toContain("type: 'folder'");
    expect(repositoryDocs).toContain("name: 'docs'");
    expect(repositoryDocs).toContain("path: 'docs'");
    expect(repositoryDocs).toContain('children: await directoryNode(documentationRoot)');
    expect(repositoryDocs).toContain('readDocumentationResource');
    expect(browserRuntime).toContain("type === 'svg' || type === 'pdf'");
    expect(browserRuntime).toContain("type === 'dot'");
    expect(browserRuntime).toContain('documentation-resource-badge');
    expect(browserRuntime).toContain('node.resourceType.toUpperCase()');
    expect(page).toContain('data-doc-resource-viewer');
    expect(page).toContain('data-doc-resource-base="/documentation/content"');
    expect(routes).toContain("'X-Content-Type-Options', 'nosniff'");
    expect(routes).toContain("resource.resourceType === 'svg'");
  });
});
