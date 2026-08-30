(() => {
  'use strict';

  /**
   * Shared developer-only expression presentation helper.
   *
   * This is deliberately a lexical colourizer only. It never parses or
   * evaluates an expression, so execution continues to use the canonical AST
   * ManatOS already compiled from metadata.
   */
  const systemRoots = new Set([
    'mode', 'user', 'system', 'company', 'platform', 'page', 'ctx', 'app',
  ]);
  const literalKeywords = new Set(['true', 'false', 'null', 'undefined']);

  const escapeHtml = (value) => String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

  const highlight = (formula) => {
    const source = String(formula ?? '');
    let html = '';
    let index = 0;
    let pathClass = null;

    const emit = (text, tokenClass = null) => {
      const escaped = escapeHtml(text);
      html += tokenClass
        ? `<span class="debug-expression-${tokenClass}">${escaped}</span>`
        : escaped;
    };

    while (index < source.length) {
      const char = source[index];

      if (/\s/.test(char)) {
        const start = index;
        while (index < source.length && /\s/.test(source[index])) index += 1;
        emit(source.slice(start, index));
        continue;
      }

      if (char === "'" || char === '"' || char === '`') {
        const quote = char;
        const start = index++;
        let escaped = false;
        while (index < source.length) {
          const current = source[index++];
          if (escaped) { escaped = false; continue; }
          if (current === '\\') { escaped = true; continue; }
          if (current === quote) break;
        }
        emit(source.slice(start, index), 'string');
        pathClass = null;
        continue;
      }

      if (/[0-9]/.test(char) || (char === '.' && /[0-9]/.test(source[index + 1] || ''))) {
        const match = source.slice(index).match(/^(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?/);
        if (match) {
          emit(match[0], 'number');
          index += match[0].length;
          pathClass = null;
          continue;
        }
      }

      if (/[A-Za-z_$]/.test(char)) {
        const match = source.slice(index).match(/^[A-Za-z_$][A-Za-z0-9_$]*/);
        const identifier = match?.[0] || char;
        const previousNonSpace = source.slice(0, index).match(/\S(?=\s*$)/)?.[0] || '';

        if (literalKeywords.has(identifier)) {
          emit(identifier, 'literal');
          pathClass = null;
        } else if (previousNonSpace === '.') {
          // Everything after a root/member separator is a path segment. This
          // gives CTX paths the same VS Code-like grey used in the form debugger.
          emit(identifier, 'path');
        } else {
          pathClass = systemRoots.has(identifier) ? 'system' : 'field';
          emit(identifier, pathClass);
        }
        index += identifier.length;
        continue;
      }

      if (char === '.') {
        emit(char, 'punctuation');
        index += 1;
        continue;
      }

      const operatorMatch = source.slice(index).match(/^(===|!==|==|!=|<=|>=|&&|\|\||\?\?|=>|\+\+|--|\+|-|\*|\/|%|<|>|!|\?|:|=)/);
      if (operatorMatch) {
        emit(operatorMatch[0], 'operator');
        index += operatorMatch[0].length;
        pathClass = null;
        continue;
      }

      emit(char, 'punctuation');
      index += 1;
      if (![']', ')'].includes(char)) pathClass = null;
    }

    return html;
  };

  const highlightElement = (element, formula = element?.textContent ?? '') => {
    if (!element) return;
    element.innerHTML = highlight(formula);
    element.classList.add('debugging-formula');
  };

  const highlightAll = (root = document) => {
    root.querySelectorAll('[data-debug-expression]').forEach((element) => {
      highlightElement(element, element.textContent || '');
    });
  };

  window.ManatOSDebugExpression = Object.freeze({
    highlight,
    highlightElement,
    highlightAll,
  });

  // The helper is loaded at the bottom of the document, but keeping the
  // ready-state branch makes it safe to reuse on fragments loaded later.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => highlightAll(), { once: true });
  } else {
    highlightAll();
  }
})();
