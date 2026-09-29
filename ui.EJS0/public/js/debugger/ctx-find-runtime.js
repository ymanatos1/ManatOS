(() => {
  'use strict';

  window.ManatOS = window.ManatOS || {};

  window.ManatOS.createCtxFindRuntime = ({
    bootId,
    allRealNodePaths,
    selectedPath,
    getValue,
    nodeNameFromPath,
    selectPath,
  }) => {
    const findButton = document.getElementById('ctxDebugFind');
    const findBox = document.getElementById('ctxDebugFindBox');
    const findInput = document.getElementById('ctxDebugFindInput');
    const findMode = document.getElementById('ctxDebugFindMode');
    const findSyntax = document.getElementById('ctxDebugFindSyntax');
    const findPreviousButton = document.getElementById('ctxDebugFindPrevious');
    const findNextButton = document.getElementById('ctxDebugFindNext');
    const findHistoryList = document.getElementById('ctxDebugFindHistory');
    const FIND_HISTORY_KEY = `manatos.debug.ctx.find-history.v1.${bootId}`;
    const FIND_HISTORY_LIMIT = 30;

    const readFindHistory = () => {
      try {
        const values = JSON.parse(sessionStorage.getItem(FIND_HISTORY_KEY) || '[]');
        return Array.isArray(values)
          ? values
              .filter((value) => typeof value === 'string' && value.trim())
              .slice(0, FIND_HISTORY_LIMIT)
          : [];
      } catch {
        return [];
      }
    };

    const closeFindHistory = () => findHistoryList?.classList.add('d-none');

    const refreshFindHistory = () => {
      if (!findHistoryList) return;
      const values = readFindHistory();
      findHistoryList.replaceChildren(
        ...values.map((value) => {
          const option = document.createElement('button');
          option.type = 'button';
          option.className = 'ctx-debug-find-history-item';
          option.textContent = value;
          option.title = value;
          option.setAttribute('role', 'option');
          option.addEventListener('mousedown', (event) => event.preventDefault());
          option.addEventListener('click', () => {
            if (findInput) findInput.value = value;
            closeFindHistory();
            findMatch(value, 1);
          });
          return option;
        }),
      );
      findHistoryList.classList.toggle('d-none', values.length === 0);
    };

    const rememberFind = (term) => {
      const values = [term, ...readFindHistory().filter((value) => value !== term)].slice(
        0,
        FIND_HISTORY_LIMIT,
      );
      try {
        sessionStorage.setItem(FIND_HISTORY_KEY, JSON.stringify(values));
      } catch {
        /* debugger only */
      }
      refreshFindHistory();
    };

    const wildcardPattern = (term) =>
      term
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');

    const createFindMatcher = (term) => {
      if (findSyntax?.value === 'regex') {
        try {
          const regex = new RegExp(term, 'i');
          return (candidate) => regex.test(candidate);
        } catch (error) {
          window.dispatchEvent(
            new CustomEvent('manatos:debug-diagnostic', {
              detail: {
                key: 'ctx-find-regex',
                message: `Invalid CTX find regular expression: ${error.message}`,
              },
            }),
          );
          return null;
        }
      }

      if (term.includes('*') || term.includes('?')) {
        const regex = new RegExp(`^${wildcardPattern(term)}$`, 'i');
        return (candidate) => regex.test(candidate);
      }

      const normalized = term.toLowerCase();
      return (candidate) => candidate.toLowerCase().includes(normalized);
    };

    const searchableValue = (value) => {
      if (value === undefined) return 'undefined';
      if (value === null) return 'null';
      if (typeof value === 'string') return value;
      if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint')
        return String(value);
      return '';
    };

    const findMatch = (rawTerm, direction = 1) => {
      const term = rawTerm.trim();
      if (!term) return;
      const matches = createFindMatcher(term);
      if (!matches) return;
      rememberFind(term);

      const paths = allRealNodePaths();
      if (!paths.length) return;
      const selectedIndex = paths.indexOf(selectedPath());
      const current = selectedIndex >= 0 ? selectedIndex : 0;
      const ordered = [];
      for (let offset = 1; offset <= paths.length; offset += 1) {
        const index = (current + direction * offset + paths.length * 2) % paths.length;
        ordered.push(paths[index]);
      }

      const mode = findMode?.value || 'key';
      const match = ordered.find((path) => {
        let value;
        try {
          value = getValue(path);
        } catch {
          value = undefined;
        }
        const byKey = mode !== 'value' && matches(nodeNameFromPath(path));
        const byValue = mode !== 'key' && matches(searchableValue(value));
        return byKey || byValue;
      });
      if (match) selectPath(match);
    };

    refreshFindHistory();
    findButton?.addEventListener('click', () => {
      findBox?.classList.toggle('d-none');
      const open = Boolean(findBox && !findBox.classList.contains('d-none'));
      findButton.classList.toggle('is-active', open);
      findButton.setAttribute('aria-pressed', String(open));
      if (open) {
        refreshFindHistory();
        findInput?.focus();
        findInput?.select();
      } else {
        closeFindHistory();
      }
    });
    findInput?.addEventListener('focus', refreshFindHistory);
    findInput?.addEventListener('input', refreshFindHistory);
    findInput?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        closeFindHistory();
        findMatch(findInput.value, event.shiftKey ? -1 : 1);
      } else if (event.key === 'Escape') {
        closeFindHistory();
        findBox?.classList.add('d-none');
        findButton?.classList.remove('is-active');
        findButton?.setAttribute('aria-pressed', 'false');
        findButton?.focus();
      }
    });
    findPreviousButton?.addEventListener('click', () => findMatch(findInput?.value || '', -1));
    findNextButton?.addEventListener('click', () => findMatch(findInput?.value || '', 1));
    document.addEventListener('click', (event) => {
      if (findBox && !findBox.contains(event.target) && event.target !== findButton)
        closeFindHistory();
    });

    return Object.freeze({ findMatch });
  };
})();
