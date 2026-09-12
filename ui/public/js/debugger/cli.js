(() => {
  'use strict';

  const MAX_HISTORY = 9999;
  const bootId =
    document.querySelector('meta[name="manatos-ui-boot-id"]')?.getAttribute('content') || 'unknown';
  const ctxRuntime = () => window.ManatOS?.ctx;
  const pageExpressionRuntime = () => window.ManatOS?.expression;
  const pretty = (value) =>
    typeof value === 'string' ? value : (JSON.stringify(value, null, 2) ?? String(value));

  const displayPath = (path, scopePath = null) => {
    const runtime = ctxRuntime();
    if (runtime?.CtxPath) return runtime.CtxPath(path, scopePath || undefined);
    if (runtime?.describePath) return runtime.describePath(path, scopePath || undefined);
    const raw = String(path || 'ctx');
    return raw === 'ctx' ? '$' : raw.startsWith('ctx.') ? `$.${raw.slice(4)}` : raw;
  };

  const csrfToken = (root) =>
    document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') ||
    root?.dataset?.cliCsrf ||
    '';

  const jsonResponse = async (response, fallbackMessage) => {
    const text = await response.text();
    let payload = null;
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      const summary = text.trim().replace(/\s+/g, ' ').slice(0, 140);
      throw new Error(
        `${fallbackMessage} (HTTP ${response.status}; server returned non-JSON${summary ? `: ${summary}` : ''}).`,
      );
    }
    if (!response.ok) {
      throw new Error(
        payload.error || payload.errorMessage || `${fallbackMessage} (HTTP ${response.status}).`,
      );
    }
    return payload;
  };

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

  const exactExistingPath = (requestedPath) => {
    const runtime = ctxRuntime();
    if (!requestedPath || !runtime?.get) return null;
    return runtime.get(requestedPath) !== undefined ? requestedPath : null;
  };

  const resolveRelativeCtxPath = (requested, basePath) => {
    let raw = String(requested || '').trim();
    if (!raw || raw === '.') return basePath;
    if (raw === '$' || raw === 'ctx') return 'ctx';
    if (raw.startsWith('$.')) return `ctx.${raw.slice(2)}`;
    if (raw.startsWith('ctx.')) return raw;

    let cursor = basePath || 'ctx';
    while (raw === '..' || raw.startsWith('../')) {
      cursor = parentPath(cursor);
      raw = raw === '..' ? '' : raw.slice(3);
    }
    if (raw.startsWith('./')) raw = raw.slice(2);
    if (!raw) return cursor;

    const child = raw.replaceAll('/', '.').replace(/^\.+|\.+$/g, '');
    return child ? `${cursor}.${child}` : cursor;
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
          let variable = candidate;
          if (
            Array.isArray(candidate.members) &&
            candidate.members.some(
              (member) => member && typeof member === 'object' && member.kind === 'dynamic-path',
            )
          ) {
            const members = [];
            for (const member of candidate.members) {
              if (member && typeof member === 'object' && member.kind === 'dynamic-path') {
                const value = await evaluate(member.expression);
                const valid =
                  (typeof value === 'string' && value.length > 0) ||
                  (typeof value === 'number' && Number.isInteger(value) && value >= 0);
                if (!valid) {
                  const type =
                    value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
                  throw new Error(
                    `Dynamic CTX path segment (${member.source || 'expression'}) must resolve to a non-empty string or non-negative integer; received ${type}.`,
                  );
                }
                members.push(value);
              } else members.push(member);
            }
            variable = { ...candidate, members };
          }
          const resolved = runtime?.resolveVariable
            ? runtime.resolveVariable(variable, scopePath)
            : runtime?.resolve?.(candidate.path, scopePath);
          if (resolved !== undefined) return resolved;
          throw new Error(
            `Expression variable not available from ${displayPath(scopePath)}: ${candidate.path}`,
          );
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
              manatosBusy: false,
            });
            const payload = await jsonResponse(response, 'Remote expression capability failed');
            return payload.value;
          }
          if (
            candidate.functionName === 'CurrentUiLevel' ||
            candidate.functionName === 'TraverseUiLevels'
          ) {
            const levels = [];
            let level = window.ManatOS?.ctx?.value?.ui?.level ?? null;
            while (level) {
              levels.push(level);
              level = level.level ?? null;
            }
            return candidate.functionName === 'CurrentUiLevel' ? (levels.at(-1) ?? null) : levels;
          }
          if (candidate.functionName === 'FirstCtx') {
            const collection = args[0];
            const resultField = args[1];
            if (collection == null || typeof collection !== 'object') return null;
            const first = Array.isArray(collection) ? collection[0] : Object.values(collection)[0];
            if (first === undefined) return null;
            if (!resultField) return first;
            if (first == null || typeof first !== 'object') return null;
            return first[resultField] ?? null;
          }
          if (candidate.functionName === 'FindCtx') {
            const collection = args[0];
            const matchField = args[1];
            const matchValue = args[2];
            const resultField = args[3];
            if (collection == null || typeof collection !== 'object') return null;
            const members = Array.isArray(collection) ? collection : Object.values(collection);
            const found = members.find(
              (member) =>
                member != null && typeof member === 'object' && member[matchField] === matchValue,
            );
            if (found === undefined) return null;
            if (!resultField) return found;
            return found[resultField] ?? null;
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

  const initializeCli = (root) => {
    if (!(root instanceof HTMLElement) || root.dataset.cliInitialized === 'true') return;
    root.dataset.cliInitialized = 'true';
    const instanceKey = root.dataset.cliInstanceKey || 'page';
    const historyStorageKey = `manatos.debug.cli.history.${instanceKey}`;
    const openStorageKey = `manatos.debug.cli.open.${instanceKey}.${bootId}`;
    const pathStorageKey = `manatos.debug.cli.path.${instanceKey}.${bootId}`;
    const ownerPageStorageKey = `manatos.debug.cli.owner-page.${instanceKey}.${bootId}`;
    const currentPageKey = `${location.pathname}${location.search}`;
    const persistentOpen = root.dataset.cliPersistentOpen === 'true';
    const initialStartPath = nearestExistingPath(root.dataset.cliStartPath || 'ctx.ui.level');
    const initialDisplayPath = root.dataset.cliDisplayPath || '';

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

    let currentPath = initialStartPath;
    let restoredOpen = false;
    if (persistentOpen) {
      try {
        currentPath = nearestExistingPath(localStorage.getItem(pathStorageKey) || currentPath);
        restoredOpen = localStorage.getItem(openStorageKey) === 'true';
      } catch {
        /* developer state only */
      }
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

    const currentDisplayPath = () =>
      initialDisplayPath && currentPath === initialStartPath
        ? initialDisplayPath
        : displayPath(currentPath);

    const refreshPath = ({ persist = true } = {}) => {
      currentPath = nearestExistingPath(currentPath);
      const shownPath = currentDisplayPath();
      const contextHelp = `Execution context: ${shownPath}. Expressions are evaluated relative to this CTX node.`;
      if (contextLabel) {
        contextLabel.textContent = shownPath;
        contextLabel.title = contextHelp;
      }
      if (prompt) {
        prompt.textContent = `${shownPath} >`;
        prompt.title = `${contextHelp} Click to open command history.`;
        prompt.setAttribute('aria-label', `${contextHelp} Show command history.`);
      }
      if (persistentOpen && persist) savePersistentState();
      return currentPath;
    };

    const resizeInput = () => {
      if (!(input instanceof HTMLTextAreaElement)) return;
      input.style.height = 'auto';
      input.style.height = `${Math.max(input.scrollHeight, 22)}px`;
    };

    const selectedTranscriptText = () => {
      const selection = window.getSelection?.();
      if (!selection || selection.isCollapsed || !selection.rangeCount) return '';
      const text = selection.toString();
      if (!text.trim()) return '';
      const range = selection.getRangeAt(0);
      const common =
        range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
          ? range.commonAncestorContainer
          : range.commonAncestorContainer.parentElement;
      return common && transcript?.contains(common) ? text : '';
    };

    const copySelectedTranscript = async () => {
      const text = selectedTranscriptText();
      if (!text) return false;
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        return false;
      }
    };

    consoleBox?.addEventListener('mouseup', () => {
      void copySelectedTranscript();
    });

    consoleBox?.addEventListener('click', (event) => {
      if (event.target instanceof HTMLAnchorElement) return;
      if (selectedTranscriptText()) return;
      input?.focus();
    });

    const append = (kind, text, expression = null) => {
      const pre = document.createElement('pre');
      pre.className = `mb-1 debugging-cli-${kind}`;
      if (expression && window.ManatOS?.debug?.expression?.highlight) {
        pre.append(document.createTextNode(expression.prefix));
        const code = document.createElement('code');
        code.innerHTML = window.ManatOS?.debug?.expression.highlight(expression.formula);
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
    const printCtxShallow = (path) => {
      const value = ctxRuntime()?.get?.(path);
      if (!value || typeof value !== 'object') {
        append('result', pretty(value));
        return;
      }
      const lines = Object.entries(value).map(([key, child]) => {
        if (Array.isArray(child)) return `${key}: Array(${child.length})`;
        if (child && typeof child === 'object') return `${key}: {…}`;
        return `${key}: ${pretty(child)}`;
      });
      append('result', lines.join('\n') || '(empty)');
    };

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

      append('command', '', { prefix: `${currentDisplayPath()} > `, formula: command });
      remember(command);
      if (input) input.value = '';
      resizeInput();

      try {
        if (command === '?' || command === 'help') {
          append(
            'result',
            [
              '$            CTX root',
              '#            immediate parent context',
              '#level       nearest UI-level context',
              '.(expr)      dynamic path segment (string/non-negative integer only)',
              '$entity              canonical entity for an initialization context',
              '$entity-fields       canonical fieldDefinition for an initialization context',
              '$entry-current       scalar record currently being initialized',
              '$level-entity        $.entities.(#level.control.entityName)',
              '$level-entity-fields $.entities.(#level.control.entityName).metadata.fieldDefinition',
              '. [ls] [full]   show current context (shallow by default; full = recursive)',
              '.. [ls] [full]  move to parent and show it (shallow by default; full = recursive)',
              'cd <path>       change execution context ($/ctx absolute, child/../ relative)',
              'cls          clear transcript',
            ].join('\n'),
          );
          return;
        }
        if (command === 'cd' || command.startsWith('cd ')) {
          const requested = command.slice(2).trim();
          if (!requested) {
            append('result', currentDisplayPath());
            return;
          }

          let targetPath = exactExistingPath(resolveRelativeCtxPath(requested, path));

          // Canonical CTX selectors/aliases (#level, $entity, etc.) are resolved from
          // the canonical UI expression-compile boundary so the CLI does not invent a
          // second parser or AST channel.
          if (!targetPath && (requested.startsWith('$') || requested.startsWith('#'))) {
            const response = await fetch('/bo/expression/compile', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ _csrf: csrfToken(root), expression: requested }),
              manatosBusy: false,
            });
            const payload = await jsonResponse(response, 'CTX path could not be compiled');
            if (payload.ast?.kind !== 'variable') {
              throw new Error('cd requires a CTX path or path alias.');
            }
            const pageRuntime = pageExpressionRuntime();
            const resolved = ctxRuntime()?.resolveVariableWithPath?.(
              payload.ast,
              path,
              (dynamicExpression) => pageRuntime?.evaluateAstAt?.(dynamicExpression, path),
            );
            targetPath = resolved?.path && exactExistingPath(resolved.path);
          }

          if (!targetPath) throw new Error(`CTX path not found: ${requested}`);
          currentPath = targetPath;
          refreshPath();
          append('result', currentDisplayPath());
          return;
        }

        const ctxCommand = /^(\.\.?)(?:\s+(ls|full))*?(?:\s+(ls|full))?$/.exec(command);
        if (ctxCommand) {
          const family = ctxCommand[1];
          const modifiers = command.slice(family.length).trim().split(/\s+/).filter(Boolean);
          const supported = modifiers.every((modifier) => modifier === 'ls' || modifier === 'full');
          if (!supported)
            throw new Error(`Unsupported CTX command modifier: ${modifiers.join(' ')}`);
          const recursive = modifiers.includes('full');
          const targetPath =
            family === '..' ? nearestExistingPath(parentPath(path)) : nearestExistingPath(path);
          if (family === '..') {
            currentPath = targetPath;
            refreshPath();
          }
          if (recursive) printCtx(targetPath);
          else printCtxShallow(targetPath);
          return;
        }

        const response = await fetch('/bo/expression/compile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ _csrf: csrfToken(root), expression: command }),
          manatosBusy: false,
        });
        const payload = await jsonResponse(response, 'Expression could not be compiled');

        const pageRuntime = pageExpressionRuntime();
        const value = pageRuntime?.evaluateAstOwnedAt
          ? await pageRuntime.evaluateAstOwnedAt(payload.ast, path)
          : instanceKey === 'page' && pageRuntime?.evaluateAstOwned
            ? await pageRuntime.evaluateAstOwned(payload.ast)
            : await evaluateDebugAst(payload.ast, path, csrfToken(root));
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
  };

  const initializeWithin = (container) => {
    if (!(container instanceof Element || container instanceof Document)) return;
    if (container instanceof Element && container.matches('[data-debugging-cli]')) {
      initializeCli(container);
    }
    container.querySelectorAll?.('[data-debugging-cli]').forEach(initializeCli);
  };

  initializeWithin(document);

  // Selecting either the outer Debugging tab or its CLI sub-tab should put the
  // caret directly in the visible entry CLI, matching click-to-focus behavior.
  document.addEventListener('shown.bs.tab', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const opensDebugging =
      target.matches('[data-v2-tab-id="debugging"]') ||
      target.matches('[data-navigation-track-value="cli"]');
    if (!opensDebugging) return;
    queueMicrotask(() => {
      const pane = document.querySelector('#metadata-debugging-pane');
      const cliPane = pane?.querySelector('#debugging-cli-pane');
      if (!(pane instanceof HTMLElement) || pane.hidden) return;
      if (cliPane instanceof HTMLElement && !cliPane.classList.contains('active')) return;
      pane.querySelector('[data-debugging-cli] [data-cli-input]')?.focus();
    });
  });

  // The metadata Debugging tab is composed after shell startup. Observe only
  // additions and initialize each shared CLI instance exactly once.
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof Element) initializeWithin(node);
      }
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
