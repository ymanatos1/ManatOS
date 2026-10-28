import {
  BrowserDocumentationSource,
  type DocumentationNode,
  type DocumentationResource,
  type DocumentationSource,
} from './documentation-source.js';

export interface DocumentationLocation {
  readonly path: string;
  readonly anchor: string;
}

export interface DocumentationBrowserHost {
  getLocation(): DocumentationLocation;
  navigate(location: DocumentationLocation): void;
  destroy(): void;
}

export const DOCUMENTATION_DETACHED_WINDOW_LAYOUT_CSS = `
  body { overflow: hidden !important; }
  .is-detached-documentation {
    display: block !important; width: 100%; height: 100dvh; min-width: 0; min-height: 0;
    box-sizing: border-box; padding: 1rem; overflow: hidden;
  }
  .is-detached-documentation .page { height: 100%; min-height: 0; }
  .is-detached-documentation .page-main {
    display: flex; flex-direction: column; height: 100%; min-height: 0;
  }
  .is-detached-documentation manatos-page-content,
  .is-detached-documentation .page-content,
  .is-detached-documentation manatos-page-host,
  .is-detached-documentation .manatos-page-host {
    display: flex; flex: 1 1 auto; flex-direction: column; min-height: 0;
  }
  .is-detached-documentation .documentation-browser {
    flex: 1 1 auto; height: auto; min-height: 0;
  }
`;

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/<[^>]*>/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function safeExternalHref(href: string): boolean {
  return /^(?:https?:|mailto:)/i.test(href) || href.startsWith('//');
}

function inlineMarkdown(source: string): string {
  const codeSpans: string[] = [];

  let text = source.replace(/`([^`]+)`/g, (_match, code: string) => {
    const token = `MANATOSCODETOKEN${codeSpans.length}ENDTOKEN`;

    codeSpans.push(`<code>${escapeHtml(code)}</code>`);

    return token;
  });

  text = escapeHtml(text)
    .replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_match, alt: string, href: string) => {
      return `<img src="${escapeHtml(href)}" alt="${escapeHtml(alt)}" loading="lazy">`;
    })
    .replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_match, label: string, href: string) => {
      const safeHref = safeExternalHref(href) || !/^[a-z][a-z\d+.-]*:/i.test(href) ? href : '#';

      return `<a href="${escapeHtml(safeHref)}">${label}</a>`;
    })
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>');

  return text.replace(/MANATOSCODETOKEN(\d+)ENDTOKEN/g, (_match, index: string) => {
    return codeSpans[Number(index)] ?? '';
  });
}

function renderMarkdown(markdown: string): string {
  const lines = markdown.replaceAll('\r\n', '\n').split('\n');

  const output: string[] = [];

  let index = 0;
  let paragraph: string[] = [];
  let listType: 'ul' | 'ol' | null = null;
  let listItems: string[] = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;

    output.push(`<p>${inlineMarkdown(paragraph.join(' '))}</p>`);

    paragraph = [];
  };

  const flushList = () => {
    if (!listType) return;

    output.push(
      `<${listType}>${listItems
        .map((item) => `<li>${inlineMarkdown(item)}</li>`)
        .join('')}</${listType}>`,
    );

    listType = null;
    listItems = [];
  };

  const flushBlocks = () => {
    flushParagraph();
    flushList();
  };

  while (index < lines.length) {
    const line = lines[index] ?? '';

    if (/^```/.test(line)) {
      flushBlocks();

      const language = line.slice(3).trim();
      const code: string[] = [];

      index += 1;

      while (index < lines.length && !/^```/.test(lines[index] ?? '')) {
        code.push(lines[index] ?? '');
        index += 1;
      }

      output.push(
        `<pre><code${
          language ? ` data-language="${escapeHtml(language)}"` : ''
        }>${escapeHtml(code.join('\n'))}</code></pre>`,
      );

      index += 1;
      continue;
    }

    const heading = /^(#{1,6})\s+(.+)$/.exec(line);

    if (heading) {
      flushBlocks();

      const level = heading[1]?.length ?? 1;
      const text = heading[2] ?? '';

      output.push(`<h${level} id="${escapeHtml(slug(text))}">${inlineMarkdown(text)}</h${level}>`);

      index += 1;
      continue;
    }

    if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
      flushBlocks();
      output.push('<hr>');
      index += 1;
      continue;
    }

    if (
      line.includes('|') &&
      index + 1 < lines.length &&
      /^\s*\|?\s*:?-{3,}/.test(lines[index + 1] ?? '')
    ) {
      flushBlocks();

      const splitRow = (row: string) =>
        row
          .trim()
          .replace(/^\||\|$/g, '')
          .split('|')
          .map((cell) => cell.trim());

      const headers = splitRow(line);
      const rows: string[][] = [];

      index += 2;

      while (
        index < lines.length &&
        (lines[index] ?? '').includes('|') &&
        (lines[index] ?? '').trim()
      ) {
        rows.push(splitRow(lines[index] ?? ''));

        index += 1;
      }

      output.push(
        `<table><thead><tr>${headers
          .map((cell) => `<th>${inlineMarkdown(cell)}</th>`)
          .join('')}</tr></thead><tbody>${rows
          .map(
            (row) => `<tr>${row.map((cell) => `<td>${inlineMarkdown(cell)}</td>`).join('')}</tr>`,
          )
          .join('')}</tbody></table>`,
      );

      continue;
    }

    const unordered = /^\s*[-+*]\s+(.+)$/.exec(line);

    const ordered = /^\s*\d+[.)]\s+(.+)$/.exec(line);

    if (unordered || ordered) {
      flushParagraph();

      const nextType = unordered ? 'ul' : 'ol';

      if (listType && listType !== nextType) {
        flushList();
      }

      listType = nextType;

      listItems.push((unordered ?? ordered)?.[1] ?? '');

      index += 1;
      continue;
    }

    const quote = /^>\s?(.*)$/.exec(line);

    if (quote) {
      flushBlocks();

      const quoteLines = [quote[1] ?? ''];

      index += 1;

      while (index < lines.length) {
        const nextQuote = /^>\s?(.*)$/.exec(lines[index] ?? '');

        if (!nextQuote) break;

        quoteLines.push(nextQuote[1] ?? '');

        index += 1;
      }

      output.push(`<blockquote>${inlineMarkdown(quoteLines.join(' '))}</blockquote>`);

      continue;
    }

    if (!line.trim()) {
      flushBlocks();
      index += 1;
      continue;
    }

    if (listType) {
      flushList();
    }

    paragraph.push(line.trim());
    index += 1;
  }

  flushBlocks();

  return output.join('\n');
}

function fileLabel(name: string): string {
  if (name.toLowerCase() === 'readme.md') {
    return 'Overview';
  }

  return name.replace(/\.(?:md|svg|pdf|dot)$/i, '').replaceAll('-', ' ');
}

function resourceIcon(node: DocumentationNode): string {
  if (node.resourceType === 'svg') {
    return 'bi-filetype-svg';
  }

  if (node.resourceType === 'pdf') {
    return 'bi-filetype-pdf';
  }

  if (node.resourceType === 'dot') {
    return 'bi-diagram-3';
  }

  return 'bi-file-earmark-text';
}

function objectUrl(resource: DocumentationResource): string {
  const bytes = new Uint8Array(resource.content.byteLength);

  bytes.set(resource.content);

  return URL.createObjectURL(
    new Blob([bytes.buffer], {
      type: resource.contentType,
    }),
  );
}

export function mountDocumentationBrowser(
  root: HTMLElement,
  source: DocumentationSource = new BrowserDocumentationSource(),
  initialLocation?: DocumentationLocation,
  locationChanged?: (location: DocumentationLocation) => void,
): DocumentationBrowserHost {
  const tree = root.querySelector<HTMLElement>('[data-doc-tree]');

  const explorer = root.querySelector<HTMLElement>('[data-doc-explorer]');

  const resizer = root.querySelector<HTMLElement>('[data-doc-resizer]');

  const viewer = root.querySelector<HTMLElement>('[data-doc-viewer]');

  const content = root.querySelector<HTMLElement>('[data-doc-content]');

  const resourceViewer = root.querySelector<HTMLElement>('[data-doc-resource]');

  const loading = root.querySelector<HTMLElement>('[data-doc-loading]');

  const status = root.querySelector<HTMLElement>('[data-doc-status]');

  const filter = root.querySelector<HTMLInputElement>('[data-doc-filter]');

  const back = root.querySelector<HTMLButtonElement>('[data-doc-back]');

  const forward = root.querySelector<HTMLButtonElement>('[data-doc-forward]');

  const home = root.querySelector<HTMLButtonElement>('[data-doc-home]');

  if (
    !tree ||
    !explorer ||
    !resizer ||
    !viewer ||
    !content ||
    !resourceViewer ||
    !loading ||
    !status ||
    !back ||
    !forward ||
    !home
  ) {
    throw new Error('Documentation browser host is incomplete.');
  }

  const navigationWindow = root.ownerDocument.defaultView;
  if (!navigationWindow) {
    throw new Error('Documentation browser requires a browser window.');
  }

  const activeDocument = (): Document => root.ownerDocument;
  const activeWindow = (): Window => root.ownerDocument.defaultView ?? navigationWindow;
  const localNavigation = initialLocation !== undefined;

  if (localNavigation) {
    navigationWindow.history.replaceState(
      {
        doc: initialLocation.path,
        hash: initialLocation.anchor,
      },
      '',
    );
  }

  let manifest: DocumentationNode[] = [];
  let allFiles: DocumentationNode[] = [];
  let destroyed = false;
  let loadRevision = 0;

  const activeObjectUrls = new Set<string>();

  const releaseObjectUrls = () => {
    for (const url of activeObjectUrls) {
      URL.revokeObjectURL(url);
    }

    activeObjectUrls.clear();
  };

  const createResourceUrl = (resource: DocumentationResource): string => {
    const url = objectUrl(resource);

    activeObjectUrls.add(url);

    return url;
  };

  const collectFiles = (nodes: readonly DocumentationNode[]) => {
    for (const node of nodes) {
      if (node.type === 'file') {
        allFiles.push(node);
      } else {
        collectFiles(node.children ?? []);
      }
    }
  };

  const currentPath = () => {
    if (localNavigation) {
      const state = navigationWindow.history.state as { doc?: unknown } | null;
      return typeof state?.doc === 'string' ? state.doc : '';
    }

    return new URL(navigationWindow.location.href).searchParams.get('doc') ?? '';
  };

  const currentAnchor = () => {
    if (localNavigation) {
      const state = navigationWindow.history.state as { hash?: unknown } | null;
      return typeof state?.hash === 'string' ? state.hash : '';
    }

    return navigationWindow.location.hash.slice(1);
  };

  const fileByPath = (path: string) => allFiles.find((file) => file.path === path);

  const homePath = () =>
    allFiles.find((file) => file.path.toLowerCase() === 'readme.md')?.path ??
    allFiles[0]?.path ??
    '';

  const nodeMatches = (node: DocumentationNode, filterText: string): boolean => {
    if (!filterText) return true;

    if (`${node.name} ${node.path}`.toLowerCase().includes(filterText)) {
      return true;
    }

    return (
      node.type === 'folder' &&
      (node.children ?? []).some((child) => nodeMatches(child, filterText))
    );
  };

  const markActive = (path: string) => {
    for (const button of tree.querySelectorAll<HTMLElement>('[data-doc-path]')) {
      const active = button.dataset.docPath === path;

      button.classList.toggle('active', active);

      if (!active) continue;

      let parent = button.parentElement;

      while (parent) {
        if (parent instanceof HTMLDetailsElement) {
          parent.open = true;
        }

        parent = parent.parentElement;
      }
    }
  };

  const navigate = (path: string, hash = '') => {
    if (!path) return;

    if (localNavigation) {
      navigationWindow.history.pushState({ doc: path, hash }, '');
      void loadDocument(path, hash);
      return;
    }

    const url = new URL(navigationWindow.location.href);

    url.searchParams.set('doc', path);
    url.hash = hash ? `#${hash}` : '';

    navigationWindow.history.pushState(
      {
        doc: path,
        hash,
      },
      '',
      url,
    );

    void loadDocument(path, hash);
  };

  const navigateAnchor = (hash: string) => {
    const path = currentPath();
    if (!path) return;

    if (localNavigation) {
      navigationWindow.history.pushState({ doc: path, hash }, '');
    } else {
      const url = new URL(navigationWindow.location.href);
      url.hash = hash ? `#${hash}` : '';
      navigationWindow.history.pushState({ doc: path, hash }, '', url);
    }

    activeDocument().getElementById(hash)?.scrollIntoView();
    locationChanged?.({ path, anchor: hash });
  };

  const renderTreeNodes = (
    nodes: readonly DocumentationNode[],
    parent: HTMLElement,
    filterText: string,
  ) => {
    for (const node of nodes) {
      if (!nodeMatches(node, filterText)) {
        continue;
      }

      if (node.type === 'folder') {
        const details = activeDocument().createElement('details');

        details.className = 'documentation-tree-folder';

        details.open = Boolean(filterText) || node.path.split('/').length === 1;

        const summary = activeDocument().createElement('summary');

        summary.innerHTML = `<i class="bi bi-folder2" aria-hidden="true"></i>${escapeHtml(
          node.name.replaceAll('-', ' '),
        )}`;

        details.append(summary);

        const children = activeDocument().createElement('div');

        children.className = 'documentation-tree-children';

        renderTreeNodes(node.children ?? [], children, filterText);

        details.append(children);
        parent.append(details);

        continue;
      }

      const button = activeDocument().createElement('button');

      button.type = 'button';
      button.className = 'documentation-tree-file';

      button.dataset.docPath = node.path;

      button.setAttribute('role', 'treeitem');

      const badge =
        node.resourceType && node.resourceType !== 'markdown'
          ? `<span class="documentation-resource-badge">${escapeHtml(
              node.resourceType.toUpperCase(),
            )}</span>`
          : '';

      button.innerHTML =
        `<i class="bi ${resourceIcon(node)}" aria-hidden="true"></i>` +
        `<span class="documentation-tree-file-label">${escapeHtml(fileLabel(node.name))}</span>` +
        badge;

      button.addEventListener('click', () => navigate(node.path));

      parent.append(button);
    }
  };

  const renderTree = () => {
    const filterText = filter?.value.trim().toLowerCase() ?? '';

    tree.replaceChildren();

    renderTreeNodes(manifest, tree, filterText);

    markActive(currentPath());
  };

  const resolveRelativePath = (href: string | null, sourcePath: string): string => {
    if (!href || href.startsWith('#')) {
      return sourcePath;
    }

    if (/^[a-z][a-z\d+.-]*:/i.test(href) || href.startsWith('//')) {
      return '';
    }

    const pathPart = href.split('#', 1)[0]?.split('?', 1)[0] ?? '';

    const base = sourcePath.includes('/')
      ? sourcePath.slice(0, sourcePath.lastIndexOf('/') + 1)
      : '';

    const normalized: string[] = [];

    for (const segment of `${base}${pathPart}`.split('/')) {
      if (!segment || segment === '.') {
        continue;
      }

      if (segment === '..') {
        normalized.pop();
      } else {
        normalized.push(segment);
      }
    }

    return normalized.join('/');
  };

  const wireRenderedLinks = (sourcePath: string, revision: number) => {
    for (const anchor of content.querySelectorAll<HTMLAnchorElement>('a[href]')) {
      const href = anchor.getAttribute('href');

      if (!href) continue;

      if (safeExternalHref(href)) {
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer';
        continue;
      }

      if (/^[a-z][a-z\d+.-]*:/i.test(href) || href.startsWith('//')) {
        anchor.removeAttribute('href');
        continue;
      }

      const [pathPart, hash = ''] = href.split('#', 2);

      if (href.startsWith('#')) {
        anchor.addEventListener('click', (event) => {
          event.preventDefault();
          navigateAnchor(href.slice(1));
        });

        continue;
      }

      if (!/\.(?:md|svg|pdf|dot)$/i.test(pathPart ?? '')) {
        continue;
      }

      const path = resolveRelativePath(pathPart ?? '', sourcePath);

      if (!fileByPath(path)) continue;

      anchor.addEventListener('click', (event) => {
        event.preventDefault();
        navigate(path, hash);
      });
    }

    for (const image of content.querySelectorAll<HTMLImageElement>('img[src]')) {
      const path = resolveRelativePath(image.getAttribute('src'), sourcePath);

      if (fileByPath(path)?.resourceType !== 'svg') {
        continue;
      }

      void source
        .read(path)
        .then((resource) => {
          if (destroyed || revision !== loadRevision) {
            return;
          }

          image.src = createResourceUrl(resource);
        })
        .catch(() => undefined);
    }
  };

  const loadDocument = async (path: string, hash = '') => {
    const revision = ++loadRevision;

    if (destroyed) return;

    releaseObjectUrls();

    if (!path) {
      loading.textContent = 'No documentation resources were found.';

      content.hidden = true;
      resourceViewer.hidden = true;

      return;
    }

    const file = fileByPath(path);

    const type =
      file?.resourceType ?? (path.toLowerCase().endsWith('.md') ? 'markdown' : undefined);

    loading.textContent = 'Loading documentation…';

    loading.hidden = false;
    content.hidden = true;
    resourceViewer.hidden = true;

    resourceViewer.replaceChildren();

    status.textContent = path;

    markActive(path);

    try {
      const resource = await source.read(path);

      if (destroyed || revision !== loadRevision) {
        return;
      }

      if (type === 'svg') {
        const image = activeDocument().createElement('img');

        image.className = 'documentation-resource-image';

        image.src = createResourceUrl(resource);

        image.alt = fileLabel(path.split('/').pop() ?? path);

        resourceViewer.append(image);
        resourceViewer.hidden = false;
      } else if (type === 'pdf') {
        const frame = activeDocument().createElement('iframe');

        frame.className = 'documentation-resource-pdf';

        frame.src = createResourceUrl(resource);

        frame.title = fileLabel(path.split('/').pop() ?? path);

        resourceViewer.append(frame);
        resourceViewer.hidden = false;
      } else {
        const text = new TextDecoder().decode(resource.content);

        if (type === 'dot') {
          content.innerHTML =
            `<pre class="documentation-dot-source">` +
            `<code data-language="dot">${escapeHtml(text)}</code>` +
            `</pre>`;
        } else {
          content.innerHTML = renderMarkdown(text);

          wireRenderedLinks(path, revision);
        }

        content.hidden = false;
      }

      loading.hidden = true;
      viewer.scrollTop = 0;

      if (hash && type === 'markdown') {
        activeWindow().requestAnimationFrame(() =>
          activeDocument().getElementById(hash)?.scrollIntoView(),
        );
      }

      locationChanged?.({ path, anchor: hash });
    } catch (error) {
      if (destroyed || revision !== loadRevision) {
        return;
      }

      loading.textContent =
        error instanceof Error ? error.message : 'Documentation could not be loaded.';

      content.hidden = true;
      resourceViewer.hidden = true;
    }
  };

  const onFilter = () => renderTree();

  const onBack = () => navigationWindow.history.back();

  const onForward = () => navigationWindow.history.forward();

  const onHome = () => navigate(homePath());

  const onPopState = () => void loadDocument(currentPath(), currentAnchor());

  const onResizePointerDown = (event: PointerEvent) => {
    event.preventDefault();

    resizer.setPointerCapture(event.pointerId);

    const move = (moveEvent: PointerEvent) => {
      const rootRect = root.getBoundingClientRect();

      const width = Math.max(
        180,
        Math.min(rootRect.width * 0.55, moveEvent.clientX - rootRect.left),
      );

      explorer.style.width = `${width}px`;
    };

    const stop = () => {
      resizer.removeEventListener('pointermove', move);

      resizer.removeEventListener('pointerup', stop);

      resizer.removeEventListener('pointercancel', stop);
    };

    resizer.addEventListener('pointermove', move);

    resizer.addEventListener('pointerup', stop);

    resizer.addEventListener('pointercancel', stop);
  };

  filter?.addEventListener('input', onFilter);

  back.addEventListener('click', onBack);

  forward.addEventListener('click', onForward);

  home.addEventListener('click', onHome);

  resizer.addEventListener('pointerdown', onResizePointerDown);

  navigationWindow.addEventListener('popstate', onPopState);

  void source
    .getTree()
    .then(async (items) => {
      if (destroyed) return;

      manifest = [...items] as DocumentationNode[];

      allFiles = [];

      collectFiles(manifest);
      renderTree();

      const initialPath = currentPath() || homePath();

      if (!currentPath() && initialPath) {
        if (localNavigation) {
          navigationWindow.history.replaceState({ doc: initialPath, hash: '' }, '');
        } else {
          const url = new URL(navigationWindow.location.href);

          url.searchParams.set('doc', initialPath);

          navigationWindow.history.replaceState(
            {
              doc: initialPath,
            },
            '',
            url,
          );
        }
      }

      await loadDocument(initialPath, currentAnchor());
    })
    .catch((error: unknown) => {
      if (destroyed) return;

      loading.textContent =
        error instanceof Error ? error.message : 'Documentation tree could not be loaded.';
    });

  return {
    getLocation(): DocumentationLocation {
      return {
        path: currentPath(),
        anchor: currentAnchor(),
      };
    },

    navigate(location: DocumentationLocation): void {
      navigate(location.path, location.anchor);
    },

    destroy(): void {
      destroyed = true;
      loadRevision += 1;

      releaseObjectUrls();

      filter?.removeEventListener('input', onFilter);

      back.removeEventListener('click', onBack);

      forward.removeEventListener('click', onForward);

      home.removeEventListener('click', onHome);

      resizer.removeEventListener('pointerdown', onResizePointerDown);

      navigationWindow.removeEventListener('popstate', onPopState);
    },
  };
}
