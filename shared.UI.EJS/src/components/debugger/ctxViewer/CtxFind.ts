import { multilingual, type CtxSearchMode, type CtxSearchSyntax } from '@manatos/shared-ui';

export interface CtxFindState {
  readonly searchText: string;
  readonly mode: CtxSearchMode;
  readonly syntax: CtxSearchSyntax;
  readonly history: readonly string[];
  readonly matchCount: number;
}

export interface CtxFindCallbacks {
  readonly searchChanged: (value: string) => void;
  readonly modeChanged: (value: CtxSearchMode) => void;
  readonly syntaxChanged: (value: CtxSearchSyntax) => void;
  readonly previous: () => void;
  readonly next: () => void;
  readonly historySelected: (value: string) => void;
  readonly closeRequested: () => void;
}

export interface CtxFindController {
  readonly element: HTMLElement;
  update(state: CtxFindState): void;
  focus(): void;
  destroy(): void;
}

export function createCtxFind(
  document: Document,
  callbacks: CtxFindCallbacks,
  language: () => 'EN' | 'EL',
): CtxFindController {
  const abortController = new AbortController();
  const element = document.createElement('div');
  element.className = 'ctx-debug-find-row';
  element.setAttribute('role', 'search');
  element.setAttribute('aria-label', 'Find in CTX');
  element.dataset.multilingualAriaLabel = 'FindInCtx';

  const inputWrap = document.createElement('div');
  inputWrap.className = 'ctx-debug-find-input-wrap';
  const input = document.createElement('input');
  input.className = 'ctx-find-input';
  input.type = 'text';
  input.autocomplete = 'off';
  input.placeholder = 'Find in CTX…';
  input.dataset.multilingualPlaceholder = 'FindInCtxPlaceholder';
  input.setAttribute('aria-label', 'CTX find pattern');
  input.dataset.multilingualAriaLabel = 'CtxFindPattern';
  inputWrap.appendChild(input);

  const historyWrap = document.createElement('details');
  historyWrap.className = 'ctx-debug-find-history-wrap';
  const historySummary = document.createElement('summary');
  historySummary.title = 'Recent searches';
  historySummary.dataset.multilingualTitle = 'RecentSearches';
  historySummary.setAttribute('aria-label', 'Recent CTX searches');
  historySummary.dataset.multilingualAriaLabel = 'RecentCtxSearches';
  historySummary.innerHTML = '<i class="bi bi-clock-history" aria-hidden="true"></i>';
  const historyList = document.createElement('div');
  historyList.className = 'ctx-debug-find-history';
  historyList.setAttribute('role', 'listbox');
  historyList.setAttribute('aria-label', 'Recent CTX searches');
  historyList.dataset.multilingualAriaLabel = 'RecentCtxSearches';
  historyWrap.append(historySummary, historyList);
  inputWrap.appendChild(historyWrap);

  const makeButton = (icon: string, title: string, callback: () => void) => {
    const button = document.createElement('button');
    button.className = 'debug-tool-button';
    button.type = 'button';
    button.title = title;
    button.innerHTML = `<i class="bi ${icon}" aria-hidden="true"></i>`;
    button.addEventListener('click', callback, { signal: abortController.signal });
    return button;
  };

  const previous = makeButton('bi-arrow-up', 'Find previous', callbacks.previous);
  previous.dataset.multilingualTitle = 'FindPrevious';
  const next = makeButton('bi-arrow-down', 'Find next', callbacks.next);
  next.dataset.multilingualTitle = 'FindNext';

  const mode = document.createElement('select');
  mode.setAttribute('aria-label', 'CTX find target');
  mode.dataset.multilingualAriaLabel = 'CtxFindTarget';
  mode.title = 'Find by key, value, or both';
  mode.dataset.multilingualTitle = 'FindByKeyValueOrBoth';
  mode.innerHTML =
    '<option value="key" data-multilingual-text="FindByKey">By key</option><option value="value" data-multilingual-text="FindByValue">By value</option><option value="both" data-multilingual-text="FindByKeyAndValue">By key + value</option>';

  const syntax = document.createElement('select');
  syntax.setAttribute('aria-label', 'CTX find syntax');
  syntax.dataset.multilingualAriaLabel = 'CtxFindSyntax';
  syntax.title = 'Wildcard or regular-expression matching';
  syntax.dataset.multilingualTitle = 'WildcardOrRegex';
  syntax.innerHTML =
    '<option value="wildcard" data-multilingual-text="Wildcard">Wildcard</option><option value="regex" data-multilingual-text="RegExpr">RegExpr</option>';

  const count = document.createElement('span');
  count.className = 'ctx-find-count';

  const close = document.createElement('button');
  close.className = 'btn-close-debug';
  close.type = 'button';
  close.title = 'Close find';
  close.dataset.multilingualTitle = 'CloseFind';
  close.setAttribute('aria-label', 'Close find');
  close.dataset.multilingualAriaLabel = 'CloseFind';
  close.textContent = '×';

  element.append(inputWrap, previous, next, mode, syntax, count, close);

  input.addEventListener('input', () => callbacks.searchChanged(input.value), {
    signal: abortController.signal,
  });
  input.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        if (event.shiftKey) callbacks.previous();
        else callbacks.next();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        callbacks.closeRequested();
      }
    },
    { signal: abortController.signal },
  );
  mode.addEventListener('change', () => callbacks.modeChanged(mode.value as CtxSearchMode), {
    signal: abortController.signal,
  });
  syntax.addEventListener(
    'change',
    () => callbacks.syntaxChanged(syntax.value as CtxSearchSyntax),
    { signal: abortController.signal },
  );
  historyList.addEventListener(
    'click',
    (event) => {
      const target = event.target as Element;
      const term = target.closest<HTMLElement>('[data-history-term]')?.dataset.historyTerm;
      if (term !== undefined) callbacks.historySelected(term);
    },
    { signal: abortController.signal },
  );
  close.addEventListener('click', callbacks.closeRequested, { signal: abortController.signal });

  return {
    element,
    update(state) {
      if (input.value !== state.searchText) input.value = state.searchText;
      mode.value = state.mode;
      syntax.value = state.syntax;
      previous.disabled = state.matchCount === 0;
      next.disabled = state.matchCount === 0;
      count.textContent = String(state.matchCount);
      count.title = multilingual(language(), []).format('@CM.CtxFindMatchCount', {
        count: state.matchCount,
      });
      historyWrap.hidden = state.history.length === 0;
      historyList.replaceChildren(
        ...state.history.map((term) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.setAttribute('role', 'option');
          button.title = term;
          button.textContent = term;
          button.dataset.historyTerm = term;
          return button;
        }),
      );
    },
    focus() {
      input.focus();
      input.select();
    },
    destroy() {
      abortController.abort();
    },
  };
}
