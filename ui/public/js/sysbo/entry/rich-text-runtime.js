/**
 * Reusable canonical rich-text field runtime.
 *
 * The persisted/CTX value is always the backing textarea string. Milkdown is a
 * presentation/editor adapter only; its document model never enters CTX.
 *
 * Crepe is loaded from the locally built browser bundle. Keeping its complete
 * dependency graph in one bundle prevents duplicate keyed ProseMirror plugin
 * instances and also makes the editor version follow the repository lockfile.
 */
(() => {
  const MILKDOWN_CREPE_MODULE = '/vendor/milkdown-crepe.js';
  const MILKDOWN_CREPE_STYLE = '/vendor/milkdown-crepe.css';
  const states = new WeakMap();
  let crepeModulePromise = null;

  const escapeHtml = (value) =>
    String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');

  const safeMarkdownPreview = (markdown) => {
    const lines = escapeHtml(markdown).split(/\r?\n/);
    const rendered = [];
    let inList = false;
    let inCode = false;
    for (const rawLine of lines) {
      const line = rawLine;
      if (line.startsWith('```')) {
        if (inList) {
          rendered.push('</ul>');
          inList = false;
        }
        rendered.push(inCode ? '</code></pre>' : '<pre><code>');
        inCode = !inCode;
        continue;
      }
      if (inCode) {
        rendered.push(`${line}\n`);
        continue;
      }
      const listMatch = line.match(/^[-*+]\s+(.+)$/);
      if (listMatch) {
        if (!inList) {
          rendered.push('<ul>');
          inList = true;
        }
        rendered.push(`<li>${listMatch[1]}</li>`);
        continue;
      }
      if (inList) {
        rendered.push('</ul>');
        inList = false;
      }
      const heading = line.match(/^(#{1,6})\s+(.+)$/);
      if (heading) {
        const level = heading[1].length;
        rendered.push(`<h${level}>${heading[2]}</h${level}>`);
      } else if (!line.trim()) {
        rendered.push('');
      } else {
        rendered.push(`<p>${line}</p>`);
      }
    }
    if (inList) rendered.push('</ul>');
    if (inCode) rendered.push('</code></pre>');
    return rendered
      .join('\n')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*]+?)\*/g, '$1<em>$2</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(
        /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
      );
  };

  const publish = (source) => {
    source.dispatchEvent(new Event('input', { bubbles: true }));
    source.dispatchEvent(new Event('change', { bubbles: true }));
  };

  const ensureCrepeStyle = () => {
    if (document.head.querySelector(`link[data-manatos-rich-text-style="${MILKDOWN_CREPE_STYLE}"]`))
      return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = MILKDOWN_CREPE_STYLE;
    link.dataset.manatosRichTextStyle = MILKDOWN_CREPE_STYLE;
    document.head.append(link);
  };

  const loadCrepeModule = () => {
    ensureCrepeStyle();
    crepeModulePromise ||= import(MILKDOWN_CREPE_MODULE);
    return crepeModulePromise;
  };

  const destroyVisualEditor = async (state) => {
    // Invalidate any create operation that has not completed yet. A late editor
    // is immediately destroyed instead of becoming a second live instance.
    state.editorGeneration += 1;
    const crepe = state.crepe;
    state.crepe = null;
    state.visualReadyValue = null;
    if (crepe?.destroy) await crepe.destroy();
    state.visual.replaceChildren();
  };

  const createVisualEditor = async (root, state) => {
    const requestedMarkdown = state.source.value;
    if (state.crepe && state.visualReadyValue === requestedMarkdown) return;

    const generation = state.editorGeneration + 1;
    state.editorGeneration = generation;
    if (state.createPromise) await state.createPromise;
    if (generation !== state.editorGeneration) return;

    const create = (async () => {
      if (state.crepe) {
        const previous = state.crepe;
        state.crepe = null;
        state.visualReadyValue = null;
        if (previous.destroy) await previous.destroy();
        state.visual.replaceChildren();
      }

      if (state.source.readOnly) {
        state.visual.textContent = state.source.value;
        state.visual.classList.add('is-readonly-fallback');
        state.visualReadyValue = state.source.value;
        return;
      }

      try {
        const { Crepe } = await loadCrepeModule();
        if (generation !== state.editorGeneration) return;
        const crepe = new Crepe({ root: state.visual, defaultValue: state.source.value });
        crepe.on((listener) => {
          listener.markdownUpdated((_ctx, markdown) => {
            if (state.syncing || state.source.value === markdown) return;
            state.source.value = markdown;
            state.visualReadyValue = markdown;
            publish(state.source);
          });
        });
        await crepe.create();
        if (generation !== state.editorGeneration) {
          await crepe.destroy?.();
          return;
        }
        state.crepe = crepe;
        state.visualReadyValue = state.source.value;
        state.visual.classList.remove('is-readonly-fallback');
        state.status.textContent = 'Markdown · Milkdown';
      } catch (error) {
        if (generation !== state.editorGeneration) return;
        console.warn(
          '[ManatOS] Milkdown visual editor unavailable; Markdown source remains usable.',
          error,
        );
        state.visual.textContent = state.source.value;
        state.visual.classList.add('is-readonly-fallback');
        state.status.textContent = 'Markdown · source editor fallback';
        if (!state.source.readOnly) {
          state.mode = 'source';
          state.visual.classList.add('d-none');
          state.source.classList.remove('d-none');
          root.querySelectorAll('[data-rich-text-mode]').forEach((button) => {
            const active = button.getAttribute('data-rich-text-mode') === 'source';
            button.classList.toggle('btn-primary', active);
            button.classList.toggle('btn-outline-secondary', !active);
          });
        }
      }
    })();

    state.createPromise = create;
    try {
      await create;
    } finally {
      if (state.createPromise === create) state.createPromise = null;
    }
  };

  const rememberSharedHeight = (root, state) => {
    if (!window.ResizeObserver) return;
    state.resizeObserver = new ResizeObserver((entries) => {
      if (state.mode !== 'source' || state.source.classList.contains('d-none')) return;
      const entry = entries[entries.length - 1];
      const height = Math.round(entry?.borderBoxSize?.[0]?.blockSize || state.source.offsetHeight);
      if (!Number.isFinite(height) || height <= 0 || height === state.sharedHeight) return;
      state.sharedHeight = height;
      root.style.setProperty('--manatos-rich-text-height', `${height}px`);
    });
    state.resizeObserver.observe(state.source);
  };

  const setMode = async (root, mode) => {
    const state = states.get(root);
    if (!state) return;
    state.mode = mode;
    root.querySelectorAll('[data-rich-text-mode]').forEach((button) => {
      const active = button.getAttribute('data-rich-text-mode') === mode;
      button.classList.toggle('btn-primary', active);
      button.classList.toggle('btn-outline-secondary', !active);
    });
    state.visual.classList.toggle('d-none', mode !== 'visual');
    state.source.classList.toggle('d-none', mode !== 'source');
    state.preview.classList.toggle('d-none', mode !== 'preview');
    if (mode === 'visual') await createVisualEditor(root, state);
    if (mode === 'preview') state.preview.innerHTML = safeMarkdownPreview(state.source.value);
  };

  document.querySelectorAll('[data-rich-text-field]').forEach((root) => {
    if (!(root instanceof HTMLElement)) return;
    const source = root.querySelector('[data-rich-text-source]');
    const visual = root.querySelector('[data-rich-text-visual]');
    const preview = root.querySelector('[data-rich-text-preview]');
    const status = root.querySelector('[data-rich-text-engine-status]');
    if (
      !(source instanceof HTMLTextAreaElement) ||
      !(visual instanceof HTMLElement) ||
      !(preview instanceof HTMLElement) ||
      !(status instanceof HTMLElement)
    )
      return;
    const metadataModes = String(root.dataset.richTextModes || 'visual,markdown,preview')
      .split(',')
      .map((mode) => mode.trim())
      .filter(Boolean);
    const availableModes = new Set(
      metadataModes.map((mode) => (mode === 'markdown' ? 'source' : mode)),
    );
    const requestedInitialMode = root.dataset.richTextInitialMode || metadataModes[0] || 'markdown';
    const initialMode = requestedInitialMode === 'markdown' ? 'source' : requestedInitialMode;
    const initialHeight = Number(root.dataset.richTextInitialHeight || 160);
    const minHeight = Number(root.dataset.richTextMinHeight || 100);
    const maxHeight = Number(root.dataset.richTextMaxHeight || 800);
    root.style.setProperty('--manatos-rich-text-height', `${initialHeight}px`);
    root.style.setProperty('--manatos-rich-text-min-height', `${minHeight}px`);
    root.style.setProperty('--manatos-rich-text-max-height', `${maxHeight}px`);

    states.set(root, {
      source,
      visual,
      preview,
      status,
      crepe: null,
      createPromise: null,
      editorGeneration: 0,
      visualReadyValue: null,
      mode: availableModes.has(initialMode) ? initialMode : availableModes.values().next().value,
      availableModes,
      syncing: false,
      resizeObserver: null,
      sharedHeight: initialHeight,
    });
    const state = states.get(root);
    if (state) rememberSharedHeight(root, state);
    if (state) void setMode(root, state.mode);
  });

  document.addEventListener('click', (event) => {
    const button =
      event.target instanceof Element ? event.target.closest('[data-rich-text-mode]') : null;
    if (!(button instanceof HTMLButtonElement)) return;
    const root = button.closest('[data-rich-text-field]');
    if (!(root instanceof HTMLElement)) return;
    const mode = button.dataset.richTextMode;
    if (!['visual', 'source', 'preview'].includes(mode)) return;
    const state = states.get(root);
    if (!state?.availableModes?.has(mode)) return;
    void setMode(root, mode);
  });

  document.addEventListener('input', (event) => {
    const source =
      event.target instanceof Element ? event.target.closest('[data-rich-text-source]') : null;
    if (!(source instanceof HTMLTextAreaElement)) return;
    const root = source.closest('[data-rich-text-field]');
    const state = root ? states.get(root) : null;
    if (!state) return;
    if (state.mode === 'preview') state.preview.innerHTML = safeMarkdownPreview(source.value);
    // A Markdown-source edit intentionally invalidates the visual document. On
    // the next Visual activation it is rebuilt exactly once from canonical text.
    if (state.mode === 'source' && state.visualReadyValue !== source.value) {
      state.visualReadyValue = null;
    }
  });

  window.addEventListener('beforeunload', () => {
    document.querySelectorAll('[data-rich-text-field]').forEach((root) => {
      const state = states.get(root);
      if (state) {
        state.resizeObserver?.disconnect();
        void destroyVisualEditor(state);
      }
    });
  });
})();
