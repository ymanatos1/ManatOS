(() => {
  'use strict';

  const root = document.querySelector('[data-documentation-browser]');
  if (!root) return;

  const manifestElement = document.getElementById('documentationManifest');
  const tree = root.querySelector('[data-doc-tree]');
  const explorer = root.querySelector('[data-doc-explorer]');
  const resizer = root.querySelector('[data-doc-resizer]');
  const viewer = root.querySelector('[data-doc-viewer]');
  const content = root.querySelector('[data-doc-content]');
  const resourceViewer = root.querySelector('[data-doc-resource-viewer]');
  const loading = root.querySelector('[data-doc-loading]');
  const status = root.querySelector('[data-doc-status]');
  const filter = root.querySelector('[data-doc-filter]');
  const back = root.querySelector('[data-doc-back]');
  const forward = root.querySelector('[data-doc-forward]');
  const home = root.querySelector('[data-doc-home]');
  const explorerWidthKey = 'manatos.documentation.explorerWidth';
  const resourceBase = root.dataset.docResourceBase || '/documentation/content';
  const resourceUrl = (path) => `${resourceBase}?path=${encodeURIComponent(path)}`;

  let manifest = [];
  try {
    manifest = JSON.parse(manifestElement?.textContent || '[]');
  } catch {
    manifest = [];
  }

  const allFiles = [];
  const collectFiles = (nodes) => {
    for (const node of nodes || []) {
      if (node.type === 'file') allFiles.push(node);
      else collectFiles(node.children);
    }
  };
  collectFiles(manifest);

  const escapeHtml = (value) =>
    String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');

  const slug = (value) =>
    String(value || '')
      .toLowerCase()
      .trim()
      .replace(/<[^>]*>/g, '')
      .replace(/[^\p{L}\p{N}\s-]/gu, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');

  const inlineMarkdown = (source) => {
    const codeSpans = [];
    let text = String(source || '').replace(/`([^`]+)`/g, (_match, code) => {
      const token = `MANATOSCODETOKEN${codeSpans.length}ENDTOKEN`;
      codeSpans.push(`<code>${escapeHtml(code)}</code>`);
      return token;
    });

    text = escapeHtml(text)
      .replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_match, alt, href) => {
        const safeHref = escapeHtml(href);
        return `<img src="${safeHref}" alt="${alt}" loading="lazy">`;
      })
      .replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_match, label, href) => {
        const safeHref = escapeHtml(href);
        return `<a href="${safeHref}">${label}</a>`;
      })
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/__([^_]+)__/g, '<strong>$1</strong>')
      .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>');

    return text.replace(
      /MANATOSCODETOKEN(\d+)ENDTOKEN/g,
      (_match, index) => codeSpans[Number(index)] || '',
    );
  };

  const renderMarkdown = (markdown) => {
    const lines = String(markdown || '')
      .replaceAll('\r\n', '\n')
      .split('\n');
    const output = [];
    let index = 0;
    let paragraph = [];
    let listType = null;
    let listItems = [];

    const flushParagraph = () => {
      if (!paragraph.length) return;
      output.push(`<p>${inlineMarkdown(paragraph.join(' '))}</p>`);
      paragraph = [];
    };
    const flushList = () => {
      if (!listType) return;
      output.push(
        `<${listType}>${listItems.map((item) => `<li>${inlineMarkdown(item)}</li>`).join('')}</${listType}>`,
      );
      listType = null;
      listItems = [];
    };
    const flushBlocks = () => {
      flushParagraph();
      flushList();
    };

    while (index < lines.length) {
      const line = lines[index];

      if (/^```/.test(line)) {
        flushBlocks();
        const language = line.slice(3).trim();
        const code = [];
        index += 1;
        while (index < lines.length && !/^```/.test(lines[index])) {
          code.push(lines[index]);
          index += 1;
        }
        output.push(
          `<pre><code${language ? ` data-language="${escapeHtml(language)}"` : ''}>${escapeHtml(code.join('\n'))}</code></pre>`,
        );
        index += 1;
        continue;
      }

      const heading = /^(#{1,6})\s+(.+)$/.exec(line);
      if (heading) {
        flushBlocks();
        const level = heading[1].length;
        const rendered = inlineMarkdown(heading[2]);
        output.push(`<h${level} id="${escapeHtml(slug(heading[2]))}">${rendered}</h${level}>`);
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
        /^\s*\|?\s*:?-{3,}/.test(lines[index + 1])
      ) {
        flushBlocks();
        const rows = [];
        const splitRow = (row) =>
          row
            .trim()
            .replace(/^\||\|$/g, '')
            .split('|')
            .map((cell) => cell.trim());
        const headers = splitRow(line);
        index += 2;
        while (index < lines.length && lines[index].includes('|') && lines[index].trim()) {
          rows.push(splitRow(lines[index]));
          index += 1;
        }
        output.push(
          `<table><thead><tr>${headers.map((cell) => `<th>${inlineMarkdown(cell)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${inlineMarkdown(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>`,
        );
        continue;
      }

      const unordered = /^\s*[-+*]\s+(.+)$/.exec(line);
      const ordered = /^\s*\d+[.)]\s+(.+)$/.exec(line);
      if (unordered || ordered) {
        flushParagraph();
        const nextType = unordered ? 'ul' : 'ol';
        if (listType && listType !== nextType) flushList();
        listType = nextType;
        listItems.push((unordered || ordered)[1]);
        index += 1;
        continue;
      }

      const quote = /^>\s?(.*)$/.exec(line);
      if (quote) {
        flushBlocks();
        const quoteLines = [quote[1]];
        index += 1;
        while (index < lines.length) {
          const nextQuote = /^>\s?(.*)$/.exec(lines[index]);
          if (!nextQuote) break;
          quoteLines.push(nextQuote[1]);
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

      if (listType) flushList();
      paragraph.push(line.trim());
      index += 1;
    }

    flushBlocks();
    return output.join('\n');
  };

  const folderLabel = (name) => name.replaceAll('-', ' ');
  const fileLabel = (name) => {
    if (name.toLowerCase() === 'readme.md') return 'Overview';
    return name.replace(/\.(?:md|svg|pdf|dot)$/i, '').replaceAll('-', ' ');
  };

  const resourceBadge = (node) => {
    if (!node?.resourceType || node.resourceType === 'markdown') return '';
    return `<span class="documentation-resource-badge">${escapeHtml(node.resourceType.toUpperCase())}</span>`;
  };

  const resourceIcon = (node) => {
    if (node.resourceType === 'svg') return 'bi-filetype-svg';
    if (node.resourceType === 'pdf') return 'bi-filetype-pdf';
    if (node.resourceType === 'dot') return 'bi-diagram-3';
    return 'bi-file-earmark-text';
  };

  const renderTreeNodes = (nodes, parent, filterText = '') => {
    for (const node of nodes || []) {
      if (node.type === 'folder') {
        const childMatches = (node.children || []).filter((child) =>
          nodeMatches(child, filterText),
        );
        if (filterText && !childMatches.length && !node.name.toLowerCase().includes(filterText))
          continue;
        const details = document.createElement('details');
        details.className = 'documentation-tree-folder';
        details.open = Boolean(filterText) || node.path.split('/').length === 1;
        const summary = document.createElement('summary');
        summary.innerHTML = `<i class="bi bi-folder2 me-1" aria-hidden="true"></i>${escapeHtml(folderLabel(node.name))}`;
        details.append(summary);
        const children = document.createElement('div');
        children.className = 'documentation-tree-children';
        renderTreeNodes(node.children, children, filterText);
        details.append(children);
        parent.append(details);
      } else {
        if (filterText && !nodeMatches(node, filterText)) continue;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'documentation-tree-file';
        button.dataset.docPath = node.path;
        button.setAttribute('role', 'treeitem');
        button.innerHTML = `<i class="bi ${resourceIcon(node)} me-1" aria-hidden="true"></i><span class="documentation-tree-file-label">${escapeHtml(fileLabel(node.name))}</span>${resourceBadge(node)}`;
        button.addEventListener('click', () => navigate(node.path));
        parent.append(button);
      }
    }
  };

  const nodeMatches = (node, filterText) => {
    if (!filterText) return true;
    if (`${node.name} ${node.path}`.toLowerCase().includes(filterText)) return true;
    return (
      node.type === 'folder' &&
      (node.children || []).some((child) => nodeMatches(child, filterText))
    );
  };

  const renderTree = () => {
    const filterText = String(filter?.value || '')
      .trim()
      .toLowerCase();
    tree.replaceChildren();
    renderTreeNodes(manifest, tree, filterText);
    markActive(currentPath());
  };

  const currentPath = () => new URL(window.location.href).searchParams.get('doc') || '';

  const fileByPath = (path) => allFiles.find((file) => file.path === path);

  const markActive = (path) => {
    for (const button of tree.querySelectorAll('[data-doc-path]')) {
      const active = button.dataset.docPath === path;
      button.classList.toggle('active', active);
      if (active) {
        let parent = button.parentElement;
        while (parent) {
          if (parent.tagName === 'DETAILS') parent.open = true;
          parent = parent.parentElement;
        }
      }
    }
  };

  const homePath = () =>
    allFiles.find((file) => file.path.toLowerCase() === 'readme.md')?.path ||
    allFiles[0]?.path ||
    '';

  const updateNavigationButtons = () => {
    back.disabled = window.history.length <= 1;
    forward.disabled = false;
  };

  const resolveRelativePath = (href, sourcePath) => {
    if (!href || href.startsWith('#')) return sourcePath;
    if (/^[a-z][a-z\d+.-]*:/i.test(href) || href.startsWith('//')) return '';
    const pathPart = href.split('#', 1)[0].split('?', 1)[0];
    const base = sourcePath.includes('/')
      ? sourcePath.slice(0, sourcePath.lastIndexOf('/') + 1)
      : '';
    const segments = `${base}${pathPart}`.split('/');
    const normalized = [];
    for (const segment of segments) {
      if (!segment || segment === '.') continue;
      if (segment === '..') normalized.pop();
      else normalized.push(segment);
    }
    return normalized.join('/');
  };

  const resolveDocumentationLink = (href, sourcePath) => {
    if (!href || href.startsWith('#')) return { path: sourcePath, hash: href.slice(1) };
    if (/^[a-z][a-z\d+.-]*:/i.test(href) || href.startsWith('//')) return null;
    const [pathPart, hash = ''] = href.split('#', 2);
    if (!/\.(?:md|svg|pdf|dot)$/i.test(pathPart)) return null;
    const path = resolveRelativePath(pathPart, sourcePath);
    return fileByPath(path) ? { path, hash } : null;
  };

  const wireRenderedLinks = (sourcePath) => {
    for (const anchor of content.querySelectorAll('a[href]')) {
      const href = anchor.getAttribute('href');
      const resolved = resolveDocumentationLink(href, sourcePath);
      if (resolved) {
        anchor.addEventListener('click', (event) => {
          event.preventDefault();
          if (resolved.path === sourcePath && resolved.hash) {
            document.getElementById(resolved.hash)?.scrollIntoView();
            return;
          }
          navigate(resolved.path, resolved.hash);
        });
      } else if (/^[a-z][a-z\d+.-]*:/i.test(href || '') || href?.startsWith('//')) {
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer';
      }
    }

    for (const image of content.querySelectorAll('img[src]')) {
      const src = image.getAttribute('src');
      const resolvedPath = resolveRelativePath(src, sourcePath);
      const resource = fileByPath(resolvedPath);
      if (resource?.resourceType === 'svg') {
        image.src = resourceUrl(resolvedPath);
      }
    }
  };

  const showResource = (path, type) => {
    resourceViewer.replaceChildren();
    const source = resourceUrl(path);
    if (type === 'svg') {
      const image = document.createElement('img');
      image.className = 'documentation-resource-image';
      image.src = source;
      image.alt = fileLabel(path.split('/').pop() || path);
      resourceViewer.append(image);
    } else if (type === 'pdf') {
      const frame = document.createElement('iframe');
      frame.className = 'documentation-resource-pdf';
      frame.src = source;
      frame.title = fileLabel(path.split('/').pop() || path);
      resourceViewer.append(frame);
    }
    resourceViewer.classList.remove('d-none');
  };

  const loadDocument = async (path, hash = '') => {
    if (!path) {
      loading.textContent = 'No documentation resources were found.';
      content.classList.add('d-none');
      resourceViewer.classList.add('d-none');
      return;
    }

    const file = fileByPath(path);
    const type = file?.resourceType || (path.toLowerCase().endsWith('.md') ? 'markdown' : '');
    loading.textContent = 'Loading documentation…';
    loading.classList.remove('d-none');
    content.classList.add('d-none');
    resourceViewer.classList.add('d-none');
    resourceViewer.replaceChildren();
    status.textContent = path;
    markActive(path);

    try {
      if (type === 'svg' || type === 'pdf') {
        showResource(path, type);
      } else {
        const response = await fetch(resourceUrl(path), {
          headers: { Accept: type === 'dot' ? 'text/plain' : 'text/markdown' },
        });
        if (!response.ok) throw new Error(`Documentation request failed (${response.status}).`);
        const source = await response.text();
        if (type === 'dot') {
          content.innerHTML = `<pre class="documentation-dot-source"><code data-language="dot">${escapeHtml(source)}</code></pre>`;
        } else {
          content.innerHTML = renderMarkdown(source);
          wireRenderedLinks(path);
        }
        content.classList.remove('d-none');
      }
      loading.classList.add('d-none');
      viewer.scrollTop = 0;
      document.title = `${fileLabel(path.split('/').pop() || path)} · ManatOS Documentation`;
      if (hash && type === 'markdown') {
        requestAnimationFrame(() => document.getElementById(hash)?.scrollIntoView());
      }
    } catch (error) {
      loading.textContent =
        error instanceof Error ? error.message : 'Documentation could not be loaded.';
      content.classList.add('d-none');
      resourceViewer.classList.add('d-none');
    }
    updateNavigationButtons();
  };

  const navigate = (path, hash = '') => {
    if (!path) return;
    const url = new URL(window.location.href);
    url.searchParams.set('doc', path);
    url.hash = hash ? `#${hash}` : '';
    window.history.pushState({ doc: path, hash }, '', url);
    void loadDocument(path, hash);
  };

  filter?.addEventListener('input', renderTree);
  back?.addEventListener('click', () => window.history.back());
  forward?.addEventListener('click', () => window.history.forward());
  home?.addEventListener('click', () => navigate(homePath()));
  window.addEventListener(
    'popstate',
    () => void loadDocument(currentPath(), window.location.hash.slice(1)),
  );

  const storedWidth = Number(window.localStorage.getItem(explorerWidthKey));
  if (Number.isFinite(storedWidth) && storedWidth >= 180) explorer.style.width = `${storedWidth}px`;

  resizer?.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    resizer.setPointerCapture(event.pointerId);
    const move = (moveEvent) => {
      const width = Math.max(180, Math.min(window.innerWidth * 0.55, moveEvent.clientX));
      explorer.style.width = `${width}px`;
    };
    const stop = () => {
      resizer.removeEventListener('pointermove', move);
      resizer.removeEventListener('pointerup', stop);
      window.localStorage.setItem(
        explorerWidthKey,
        String(Math.round(explorer.getBoundingClientRect().width)),
      );
    };
    resizer.addEventListener('pointermove', move);
    resizer.addEventListener('pointerup', stop);
  });

  renderTree();
  const initialPath = currentPath() || homePath();
  if (!currentPath() && initialPath) {
    const url = new URL(window.location.href);
    url.searchParams.set('doc', initialPath);
    window.history.replaceState({ doc: initialPath }, '', url);
  }
  void loadDocument(initialPath, window.location.hash.slice(1));
})();
