(() => {
  'use strict';

  const MAX_HISTORY = 9999;
  const roots = [...document.querySelectorAll('[data-debugging-cli]')];
  if (!roots.length) return;

  const bootId =
    document.querySelector('meta[name="manatos-ui-boot-id"]')?.getAttribute('content') || 'unknown';
  const ctxRuntime = () => window.ManatOS?.ctx;
  const pageExpressionRuntime = () => window.ManatOS?.expression;
  const pretty = (value) =>
    typeof value === 'string' ? value : (JSON.stringify(value, null, 2) ?? String(value));

  /** Parent-path handling is intentionally useful for both dotted and indexed CTX paths. */
  const parentPath = (path) => {
    if (!path || path === 'ctx') return 'ctx';
    const withoutIndex = path.replace(/\[(?:\d+|"(?:[^"\\]|\\.)*")\]$/, '');
    if (withoutIndex !== path) return withoutIndex || 'ctx';
    return path.replace(/\.[^.]+$/, '') || 'ctx';
  };

  const nearestExistingPath = (requestedPath) => {
    const runtime = ctxRuntime();
    let path = requestedPath || 'ctx';
    if (!runtime?.get) return path;
    while (path !== 'ctx' && runtime.get(path) === undefined) path = parentPath(path);
    return runtime.get(path) !== undefined || path === 'ctx' ? path : 'ctx';
  };

  /**
   * Debugger fallback evaluator for pages that do not host a metadata entry form.
   * It consumes the server-compiled AST; the browser never reparses expression text.
   * Entry pages continue to use the richer canonical form evaluator when available.
   */
  const evaluateDebugAst = async (node, scopePath, csrfToken) => {
    const runtime = ctxRuntime();
    const scalar = (value) =>
      value == null ||
      ['string', 'number', 'boolean', 'undefined'].includes(typeof value) ||
      value instanceof Date;
    const truthy = (value) => {
      if (!scalar(value))
        throw new Error('Structured values are not supported by CLI scalar operators.');
      return Boolean(value);
    };
    const evaluate = async (candidate) => {
      if (!candidate) return undefined;
      switch (candidate.kind) {
        case 'literal':
          return candidate.value;
        case 'variable': {
          const resolved = runtime?.resolve?.(candidate.path, scopePath);
          if (resolved !== undefined) return resolved;
          throw new Error(`Expression variable not available from ${scopePath}: ${candidate.path}`);
        }
        case 'group':
          return evaluate(candidate.expression);
        case 'unary': {
          const value = await evaluate(candidate.operand);
          if (candidate.operator === '!') return !truthy(value);
          if (candidate.operator === '~') return ~Number(value);
          if (candidate.operator === '+') return Number(value);
          if (candidate.operator === '-') return -Number(value);
          return undefined;
        }
        case 'binary': {
          const left = await evaluate(candidate.left);
          if (candidate.operator === '??') return left == null ? evaluate(candidate.right) : left;
          if (candidate.operator === '&&') return truthy(left) ? evaluate(candidate.right) : left;
          if (candidate.operator === '||') return truthy(left) ? left : evaluate(candidate.right);
          const right = await evaluate(candidate.right);
          switch (candidate.operator) {
            case '+':
              return typeof left === 'string' || typeof right === 'string'
                ? String(left) + String(right)
                : Number(left) + Number(right);
            case '-':
              return Number(left) - Number(right);
            case '*':
              return Number(left) * Number(right);
            case '/':
              return Number(left) / Number(right);
            case '%':
              return Number(left) % Number(right);
            case '**':
              return Number(left) ** Number(right);
            case '==':
              return left == right;
            case '!=':
              return left != right;
            case '===':
              return left === right;
            case '!==':
              return left !== right;
            case '<':
              return left < right;
            case '<=':
              return left <= right;
            case '>':
              return left > right;
            case '>=':
              return left >= right;
            case '<<':
              return Number(left) << (Number(right) & 31);
            case '>>':
              return Number(left) >> (Number(right) & 31);
            case '>>>':
              return (Number(left) >>> (Number(right) & 31)) >>> 0;
            case '&':
              return Number(left) & Number(right);
            case '^':
              return Number(left) ^ Number(right);
            case '|':
              return Number(left) | Number(right);
            default:
              throw new Error(`Unsupported binary operator: ${candidate.operator}`);
          }
        }
        case 'conditional': {
          const condition = await evaluate(candidate.condition);
          if (typeof condition !== 'boolean')
            throw new Error(
              `?: requires a boolean condition; received ${condition === null ? 'null' : typeof condition}.`,
            );
          return condition ? evaluate(candidate.whenTrue) : evaluate(candidate.whenFalse);
        }
        case 'function': {
          const args = [];
          for (const argument of candidate.arguments || []) args.push(await evaluate(argument));
          if (candidate.capability === 'entityResolver') {
            const response = await fetch('/bo/expression/evaluate-function', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                _csrf: csrfToken,
                functionName: candidate.functionName,
                args,
              }),
            });
            const payload = await response.json();
            if (!response.ok)
              throw new Error(
                payload.error || payload.errorMessage || 'Remote expression capability failed.',
              );
            return payload.value;
          }
          if (candidate.functionName === 'SqRoot') return Math.sqrt(Number(args[0]));
          if (candidate.functionName === 'GetTime') return Date.now();
          if (candidate.functionName === 'StrFormat')
            return String(args[0] ?? '').replace(/\{(\d+)\}/g, (match, raw) =>
              Number(raw) + 1 < args.length ? String(args[Number(raw) + 1] ?? '') : match,
            );
          if (candidate.functionName === 'CurrentDay') {
            const now = new Date();
            const pad = (value) => String(value).padStart(2, '0');
            return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T00:00`;
          }
          throw new Error(
            `Function ${candidate.functionName} is not available in the shell CLI evaluator on this page.`,
          );
        }
        default:
          return undefined;
      }
    };
    return evaluate(node);
  };

  roots.forEach((root) => {
    const instanceKey = root.dataset.cliInstanceKey || 'page';
    const historyStorageKey = `manatos.debug.cli.history.${instanceKey}`;
    const openStorageKey = `manatos.debug.cli.open.${instanceKey}.${bootId}`;
    const pathStorageKey = `manatos.debug.cli.path.${instanceKey}.${bootId}`;
    const ownerPageStorageKey = `manatos.debug.cli.owner-page.${instanceKey}.${bootId}`;
    const currentPageKey = `${location.pathname}${location.search}`;
    const persistentOpen = root.dataset.cliPersistentOpen === 'true';

    let history = [];
    try {
      const parsed = JSON.parse(localStorage.getItem(historyStorageKey) || '[]');
      if (Array.isArray(parsed))
        history = parsed.filter((value) => typeof value === 'string').slice(-MAX_HISTORY);
    } catch {
      /* developer history must never affect the page */
    }
    let historyIndex = history.length;

    const input = root.querySelector('[data-cli-input]');
    const consoleBox = root.querySelector('[data-cli-console]');
    const transcript = root.querySelector('[data-cli-transcript]');
    const prompt = root.querySelector('[data-cli-prompt]');
    const historyMenu = root.querySelector('[data-cli-history]');
    const contextLabel = root.querySelector('[data-cli-context-label]');

    let currentPath = nearestExistingPath(root.dataset.cliStartPath || 'ctx.page.page');
    let restoredOpen = false;
    if (persistentOpen) {
      try {
        currentPath = nearestExistingPath(localStorage.getItem(pathStorageKey) || currentPath);
        restoredOpen = localStorage.getItem(openStorageKey) === 'true';
      } catch {
        /* developer state only */
      }
    } else if (instanceKey === 'page' && pageExpressionRuntime()?.currentCtxPath) {
      currentPath = nearestExistingPath(pageExpressionRuntime().currentCtxPath());
    }

    const savePersistentState = () => {
      if (!persistentOpen) return;
      try {
        localStorage.setItem(openStorageKey, String(!root.classList.contains('d-none')));
        localStorage.setItem(pathStorageKey, currentPath);
      } catch {
        /* developer state only */
      }
    };

    const reportOpenState = () => {
      window.dispatchEvent(
        new CustomEvent('manatos:debug-cli-state', {
          detail: { instanceKey, open: !root.classList.contains('d-none'), path: currentPath },
        }),
      );
    };

    const setOpen = (open) => {
      if (!persistentOpen) return;
      root.classList.toggle('d-none', !open);
      root.setAttribute('aria-hidden', String(!open));
      savePersistentState();
      reportOpenState();
      if (open) queueMicrotask(() => input?.focus());
    };

    const refreshPath = ({ persist = true } = {}) => {
      currentPath = nearestExistingPath(currentPath);
      if (contextLabel) contextLabel.textContent = currentPath;
      if (prompt) prompt.textContent = `${currentPath} >`;
      if (persistentOpen && persist) savePersistentState();
      return currentPath;
    };

    const resizeInput = () => {
      if (!(input instanceof HTMLTextAreaElement)) return;
      input.style.height = 'auto';
      input.style.height = `${Math.max(input.scrollHeight, 22)}px`;
    };

    const append = (kind, text, expression = null) => {
      const pre = document.createElement('pre');
      pre.className = `mb-1 debugging-cli-${kind}`;
      if (expression && window.ManatOSDebugExpression?.highlight) {
        pre.append(document.createTextNode(expression.prefix));
        const code = document.createElement('code');
        code.innerHTML = window.ManatOSDebugExpression.highlight(expression.formula);
        pre.append(code);
      } else {
        pre.textContent = text;
      }
      transcript?.append(pre);
      if (consoleBox) consoleBox.scrollTop = consoleBox.scrollHeight;
    };

    const remember = (command) => {
      if (!command || history.at(-1) === command) return;
      history.push(command);
      if (history.length > MAX_HISTORY) history = history.slice(-MAX_HISTORY);
      try {
        localStorage.setItem(historyStorageKey, JSON.stringify(history));
      } catch {
        /* developer history only */
      }
      historyIndex = history.length;
    };

    const closeHistory = () => {
      historyMenu?.classList.add('d-none');
      prompt?.setAttribute('aria-expanded', 'false');
    };

    const insertHistory = (command) => {
      if (!(input instanceof HTMLTextAreaElement)) return;
      input.value = command;
      historyIndex = history.length;
      closeHistory();
      resizeInput();
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    };

    const showHistory = () => {
      if (!historyMenu || !prompt) return;
      historyMenu.replaceChildren(
        ...[...history].reverse().map((command) => {
          const option = document.createElement('button');
          option.type = 'button';
          option.className = 'debugging-cli-history-item';
          option.textContent = command;
          option.title = command;
          option.setAttribute('role', 'option');
          option.addEventListener('mousedown', (event) => event.preventDefault());
          option.addEventListener('click', () => insertHistory(command));
          return option;
        }),
      );
      const hasHistory = history.length > 0;
      historyMenu.classList.toggle('d-none', !hasHistory);
      prompt.setAttribute('aria-expanded', String(hasHistory));
    };

    const printCtx = (path) => append('result', pretty(ctxRuntime()?.get?.(path)));

    const run = async () => {
      const command = String(input?.value || '').trim();
      if (!command) return;
      const path = refreshPath();
      closeHistory();

      if (command === 'cls' || command === 'clear') {
        if (transcript) transcript.textContent = '';
        if (input) input.value = '';
        resizeInput();
        return;
      }

      append('command', '', { prefix: `${path} > `, formula: command });
      remember(command);
      if (input) input.value = '';
      resizeInput();

      try {
        if (command === '.') {
          printCtx(path);
          return;
        }
        if (command === '..') {
          printCtx(parentPath(path));
          return;
        }

        const response = await fetch('/bo/debug/compile-expression', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ _csrf: root.dataset.cliCsrf, expression: command }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Expression could not be compiled.');

        const pageRuntime = pageExpressionRuntime();
        const value = pageRuntime?.evaluateAstOwnedAt
          ? await pageRuntime.evaluateAstOwnedAt(payload.ast, path)
          : instanceKey === 'page' && pageRuntime?.evaluateAstOwned
            ? await pageRuntime.evaluateAstOwned(payload.ast)
            : await evaluateDebugAst(payload.ast, path, root.dataset.cliCsrf);
        append('result', pretty(value));
      } catch (error) {
        append('error', `Error: ${error instanceof Error ? error.message : String(error)}`);
      }
    };

    prompt?.addEventListener('click', (event) => {
      event.stopPropagation();
      if (historyMenu?.classList.contains('d-none')) showHistory();
      else closeHistory();
    });

    input?.addEventListener('input', resizeInput);
    input?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        run();
        return;
      }
      if (event.key === 'Escape') {
        closeHistory();
        return;
      }
      if (
        !(input instanceof HTMLTextAreaElement) ||
        !history.length ||
        input.selectionStart !== input.selectionEnd
      )
        return;
      if (event.key === 'ArrowUp' && input.selectionStart === 0) {
        event.preventDefault();
        historyIndex = Math.max(0, historyIndex - 1);
        input.value = history[historyIndex] || '';
        resizeInput();
        input.setSelectionRange(input.value.length, input.value.length);
      }
      if (event.key === 'ArrowDown' && input.selectionStart === input.value.length) {
        event.preventDefault();
        historyIndex = Math.min(history.length, historyIndex + 1);
        input.value = historyIndex >= history.length ? '' : history[historyIndex] || '';
        resizeInput();
        input.setSelectionRange(input.value.length, input.value.length);
      }
    });

    document.addEventListener('click', (event) => {
      if (!root.contains(event.target)) closeHistory();
    });

    window.addEventListener('manatos:debug-cli-toggle', (event) => {
      if (
        !(event instanceof CustomEvent) ||
        event.detail?.instanceKey !== instanceKey ||
        !persistentOpen
      )
        return;
      const requestedPath =
        typeof event.detail?.path === 'string' && event.detail.path
          ? nearestExistingPath(event.detail.path)
          : currentPath;
      const isOpen = !root.classList.contains('d-none');
      let ownerPage = '';
      try {
        ownerPage = localStorage.getItem(ownerPageStorageKey) || '';
      } catch {
        /* developer state only */
      }

      /*
       * Same-page selection changes retarget an already-open CLI, preserving the
       * efficient CTX inspection workflow. After full navigation, however, the
       * first toolbar click is an unambiguous toggle-off even though the new
       * page's selected CTX path naturally differs from the old one.
       */
      if (isOpen && ownerPage && ownerPage !== currentPageKey) {
        setOpen(false);
        return;
      }
      if (isOpen && requestedPath !== currentPath) {
        currentPath = requestedPath;
        try {
          localStorage.setItem(ownerPageStorageKey, currentPageKey);
        } catch {
          /* developer state only */
        }
        refreshPath();
        input?.focus();
        reportOpenState();
        return;
      }
      if (!isOpen) {
        currentPath = requestedPath;
        try {
          localStorage.setItem(ownerPageStorageKey, currentPageKey);
        } catch {
          /* developer state only */
        }
      }
      refreshPath();
      setOpen(!isOpen);
    });

    refreshPath({ persist: false });
    resizeInput();
    if (persistentOpen) setOpen(restoredOpen);
  });
})();
