/* Metadata-driven reactive CTX/evaluator runtime.
 *
 * This cohesive runtime is intentionally isolated from generic form lifecycle code.
 * Server-parsed canonical ASTs are evaluated here for live calculated fields and
 * CTX-driven UI properties; the browser does not reparse metadata expressions.
 */

/* ==========================================================================
 * Metadata-driven reactive CTX fields
 *
 * Server-side expressions are parsed once and their AST is embedded beside
 * calculated controls. While the user edits ordinary form fields, this small
 * browser evaluator reuses that AST to refresh calculated values immediately.
 * Every source-field mutation also emits the normal manatos:ctx-change event;
 * when the development CTX runtime is present the actual browser CTX node is
 * updated first so DEBUG observes the same value transition.
 *
 * The reactive plan is compiled once from those ASTs. Calculated values and
 * evaluator-driven UI properties share one dependency registry, so a source
 * change evaluates only the entries that depend on that field and propagates
 * through calculated-field dependencies without reparsing expressions.
 * ======================================================================== */
(() => {
  const form = document.querySelector('form.metadata-driven-record-form');
  if (!(form instanceof HTMLFormElement)) return;

  const CHANGE_EVENT = 'manatos:ctx-change';
  const runtime = window.ManatOS?.ctx;

  const leafPagePath = () => {
    if (!runtime?.value?.page) return null;
    let node = runtime.value.page;
    let path = 'ctx.page';
    while (node?.page) {
      node = node.page;
      path += '.page';
    }
    return path;
  };

  const leafPageFieldsPath = () => {
    const pagePath = leafPagePath();
    return pagePath ? `${pagePath}.fields` : null;
  };

  const leafPageEntryPath = () => {
    const pagePath = leafPagePath();
    return pagePath ? `${pagePath}.entry` : null;
  };

  /** Update the working record through CTX; dependents react to the CTX event. */
  const syncCurrentValue = (key, value, source, triggerPath) => {
    const currentPath = leafPageEntryPath();
    if (!key || !currentPath || !runtime?.replace) return;
    const path = `${currentPath}.${key}`;
    if (runtime.get?.(path) !== value) {
      runtime.replace(path, value, { source, triggerPath: triggerPath ?? path });
    }
  };

  const controlValue = (control) => {
    if (control instanceof HTMLSelectElement && control.value === '') return null;
    if (control instanceof HTMLInputElement && control.type === 'checkbox') return control.checked;
    if (control instanceof HTMLInputElement && control.type === 'number') {
      return control.value === '' ? null : Number(control.value);
    }
    if (control instanceof HTMLInputElement && control.dataset.ctxValueType === 'duration') {
      if (!control.value) return null;
      try {
        const parsed = JSON.parse(control.value);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
      } catch {
        return null;
      }
    }
    return control?.value ?? null;
  };


  const formFieldValue = (name) => {
    const escaped = globalThis.CSS?.escape ? CSS.escape(name) : name.replace(/"/g, '\\"');
    const control = form.querySelector(`[data-ctx-field="${escaped}"]`);
    if (control) return controlValue(control);
    return undefined;
  };

  /**
   * Resolve a live form field as an evaluator value. Bare field references use
   * the control's scalar value, while member access keeps a tiny field wrapper
   * so declarative enum-item metadata (for example
   * `principalType.option.canHaveParent`) remains available even when the CTX
   * debugger/runtime is disabled. This keeps reactive UI decisions independent
   * from developer tooling and mirrors the server evaluator's field semantics.
   */
  let normalizationValueActive = false;
  let normalizationValue;
  const resolveLocalFieldVariable = (members) => {
    if (!Array.isArray(members) || !members.length || typeof members[0] !== 'string') return undefined;
    const key = members[0];
    if (normalizationValueActive && key === 'value' && members.length === 1) return normalizationValue;
    const escaped = globalThis.CSS?.escape ? CSS.escape(key) : key.replace(/"/g, '\\"');
    const control = form.querySelector(`[data-ctx-field="${escaped}"]`);
    let fieldValue;
    let option;
    if (control) {
      fieldValue = controlValue(control);
      option = window.ManatOSFieldComponents?.getFieldOption?.(control);
    } else {
      return undefined;
    }

    if (members.length === 1) return fieldValue;

    let value = { value: fieldValue, option };
    for (const member of members.slice(1)) {
      if (value == null || (typeof value !== 'object' && typeof value !== 'function')) return undefined;
      value = value[member];
    }
    return value;
  };

  let explicitEvaluationScopePath = null;
  let explicitEvaluationScopeValue = null;
  let explicitScopeMemo = new Map();
  let explicitScopeActive = new Set();

  const scopedValue = (members) => {
    if (!explicitEvaluationScopeValue || !Array.isArray(members) || !members.length) return undefined;
    let value = explicitEvaluationScopeValue;
    for (const member of members) {
      if (value == null || (typeof value !== 'object' && typeof value !== 'function')) return undefined;
      value = value[member];
    }
    if (value && typeof value === 'object' && value.__manatosExpressionAst) {
      if (explicitScopeMemo.has(value)) return explicitScopeMemo.get(value);
      if (explicitScopeActive.has(value)) return value.value ?? null;
      explicitScopeActive.add(value);
      try {
        const calculated = evaluate(value.__manatosExpressionAst);
        explicitScopeMemo.set(value, calculated);
        return calculated;
      } finally {
        explicitScopeActive.delete(value);
      }
    }
    return value;
  };

  const resolveVariable = (node) => {
    if (!node || !Array.isArray(node.members) || !node.members.length) return undefined;

    if (!node.absolute && explicitEvaluationScopeValue) {
      const scoped = scopedValue(node.members);
      if (scoped !== undefined) return scoped;
    }

    // Non-absolute expressions resolve local form fields first. This includes
    // rich enum option traits and therefore works in production even when the
    // development CTX runtime is not loaded.
    if (!node.absolute && !explicitEvaluationScopePath) {
      const local = resolveLocalFieldVariable(node.members);
      if (local !== undefined) return local;
    }

    // Root/page/user/system paths continue through the generic CTX resolver.
    if (runtime?.resolve) {
      const scopePath = explicitEvaluationScopePath ?? leafPageFieldsPath()?.replace(/\.fields$/, '') ?? undefined;
      const resolved = runtime.resolve(node.path, scopePath);
      if (resolved !== undefined) return resolved;
    }
    throw new Error(`Reactive expression variable not available in this browser scope: ${node.path}`);
  };

  const scalar = (value) => value === null || ['string', 'number', 'boolean', 'undefined'].includes(typeof value) || value instanceof Date;
  const num = (value, op) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${op} requires numbers`);
    return value;
  };
  const truthy = (value) => {
    if (!scalar(value)) throw new Error('Structured values are not supported by reactive scalar expressions yet.');
    return Boolean(value);
  };
  const plus = (left, right) => {
    if (typeof left === 'string' || typeof right === 'string') return String(left) + String(right);
    return num(left, '+') + num(right, '+');
  };

  const parseCalendarDate = (raw) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(raw || ''));
    if (!match) return null;
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    return Number.isNaN(date.getTime()) ? null : date;
  };
  const formatCalendarDate = (date) => {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
    const pad2 = (value) => String(value).padStart(2, '0');
    return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
  };
  const normalizedCalendarDuration = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const part = (key) => {
      const numeric = Number(value[key] || 0);
      return Number.isFinite(numeric) && numeric >= 0 ? Math.trunc(numeric) : 0;
    };
    return { years: part('years'), months: part('months'), days: part('days') };
  };
  const daysInCalendarMonth = (year, monthIndex) => new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const withClampedCalendarYearMonth = (date, year, monthIndex) => new Date(Date.UTC(
    year,
    monthIndex,
    Math.min(date.getUTCDate(), daysInCalendarMonth(year, monthIndex)),
  ));
  const addCalendarDuration = (start, duration) => {
    let cursor = withClampedCalendarYearMonth(start, start.getUTCFullYear() + duration.years, start.getUTCMonth());
    const monthTotal = cursor.getUTCFullYear() * 12 + cursor.getUTCMonth() + duration.months;
    cursor = withClampedCalendarYearMonth(cursor, Math.floor(monthTotal / 12), monthTotal % 12);
    return new Date(cursor.getTime() + duration.days * 24 * 60 * 60 * 1000);
  };
  const calendarDurationBetween = (start, end) => {
    if (end.getTime() < start.getTime()) return null;
    let years = Math.max(0, end.getUTCFullYear() - start.getUTCFullYear());
    while (years > 0 && addCalendarDuration(start, { years, months: 0, days: 0 }).getTime() > end.getTime()) years -= 1;
    let cursor = addCalendarDuration(start, { years, months: 0, days: 0 });
    let months = Math.max(0, (end.getUTCFullYear() - cursor.getUTCFullYear()) * 12 + (end.getUTCMonth() - cursor.getUTCMonth()));
    while (months > 0 && addCalendarDuration(cursor, { years: 0, months, days: 0 }).getTime() > end.getTime()) months -= 1;
    cursor = addCalendarDuration(cursor, { years: 0, months, days: 0 });
    const days = Math.max(0, Math.round((end.getTime() - cursor.getTime()) / (24 * 60 * 60 * 1000)));
    return { years, months, days };
  };

  const evaluate = (node) => {
    if (!node) return undefined;
    switch (node.kind) {
      case 'literal': return node.value;
      case 'variable': return resolveVariable(node);
      case 'group': return evaluate(node.expression);
      case 'unary': {
        const value = evaluate(node.operand);
        if (node.operator === '!') return !truthy(value);
        if (node.operator === '~') return ~num(value, '~');
        if (node.operator === '+') return num(value, '+');
        if (node.operator === '-') return -num(value, '-');
        return undefined;
      }
      case 'binary': {
        const left = evaluate(node.left);
        if (node.operator === '??') return left == null ? evaluate(node.right) : left;
        if (node.operator === '&&') return truthy(left) ? evaluate(node.right) : left;
        if (node.operator === '||') return truthy(left) ? left : evaluate(node.right);
        const right = evaluate(node.right);
        switch (node.operator) {
          case '+': return plus(left, right);
          case '-': return num(left, '-') - num(right, '-');
          case '*': return num(left, '*') * num(right, '*');
          case '/': return num(left, '/') / num(right, '/');
          case '%': return num(left, '%') % num(right, '%');
          case '**': return num(left, '**') ** num(right, '**');
          // Intentional JS/TS-style scalar equality split, matching the server evaluator.
          case '==': return left == right; // eslint-disable-line eqeqeq
          case '!=': return left != right; // eslint-disable-line eqeqeq
          case '===': return left === right;
          case '!==': return left !== right;
          case '<': return left < right;
          case '<=': return left <= right;
          case '>': return left > right;
          case '>=': return left >= right;
          case '<<': return num(left, '<<') << (num(right, '<<') & 31);
          case '>>': return num(left, '>>') >> (num(right, '>>') & 31);
          case '>>>': return (num(left, '>>>') >>> (num(right, '>>>') & 31)) >>> 0;
          case '&': return num(left, '&') & num(right, '&');
          case '^': return num(left, '^') ^ num(right, '^');
          case '|': return num(left, '|') | num(right, '|');
          default: return undefined;
        }
      }
      case 'conditional': return truthy(evaluate(node.condition)) ? evaluate(node.whenTrue) : evaluate(node.whenFalse);
      case 'function': {
        const args = (node.arguments || []).map(evaluate);
        if (node.functionName === 'CurrentDay') {
          const now = new Date();
          const pad = (v) => String(v).padStart(2, '0');
          return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T00:00`;
        }
        if (node.functionName === 'EmailAddress') {
          const normalized = String(args[0] ?? '').trim().toLocaleLowerCase();
          if (!normalized) return null;
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new Error('EmailAddress requires a valid email address.');
          return normalized;
        }
        if (node.functionName === 'TelephoneNbr') {
          const clean = (value) => String(value ?? '').trim();
          if (args.length === 1) {
            const raw = clean(args[0]);
            if (!raw) return null;
            const digits = raw.replace(/\D/g, '');
            if (!raw.startsWith('+') || digits.length < 4 || digits.length > 15) throw new Error('TelephoneNbr requires an international number beginning with + and containing 4-15 digits.');
            return `+${digits}`;
          }
          const country = clean(args[0]);
          const countryDigits = country.replace(/\D/g, '');
          const numberDigits = clean(args[1]).replace(/\D/g, '');
          if (!country.startsWith('+') || !countryDigits || numberDigits.length < 3 || `${countryDigits}${numberDigits}`.length > 15) throw new Error('TelephoneNbr requires a valid country code and national number.');
          return `+${countryDigits}${numberDigits}`;
        }
        if (node.functionName === 'SqRoot') return Math.sqrt(Number(args[0]));
        if (node.functionName === 'TraverseCtx') {
          const [startId, collection, parentField, resultField] = args;
          if (startId == null || startId === '' || !collection || typeof collection !== 'object') return null;
          const keyed = (container, key) => {
            if (Array.isArray(container)) {
              return container.find((item) => item && typeof item === 'object' && (item.id === key || item.key === key));
            }
            return container?.[key];
          };
          const seen = new Set();
          let id = startId;
          for (let depth = 0; depth < 256; depth += 1) {
            const key = String(id);
            if (seen.has(key)) throw new Error(`TraverseCtx detected a parent cycle at ${key}.`);
            seen.add(key);
            const row = keyed(collection, key);
            if (!row || typeof row !== 'object') return null;
            const parent = row[parentField];
            if (parent == null || parent === '') return resultField ? (row[resultField] ?? null) : row;
            id = parent;
          }
          throw new Error('TraverseCtx exceeded the maximum traversal depth of 256.');
        }
        if (node.functionName === 'CalendarAddDuration') {
          const start = parseCalendarDate(args[0]);
          const duration = normalizedCalendarDuration(args[1]);
          return start && duration ? formatCalendarDate(addCalendarDuration(start, duration)) : null;
        }
        if (node.functionName === 'CalendarDurationBetween') {
          const start = parseCalendarDate(args[0]);
          const end = parseCalendarDate(args[1]);
          return start && end ? calendarDurationBetween(start, end) : null;
        }
        if (node.functionName === 'GetTime') return Date.now();
        if (node.functionName === 'StrFormat') {
          return String(args[0] ?? '').replace(/\{(\d+)\}/g, (match, raw) => Number(raw) + 1 < args.length ? String(args[Number(raw) + 1] ?? '') : match);
        }
        return undefined;
      }
      default: return undefined;
    }
  };

  const csrfToken = form.querySelector('input[name="_csrf"]')?.value || '';

  /*
   * One owner evaluation pass may contain several reactive consumers of the
   * same resolver-backed subexpression (for example the actual calculated
   * field plus its Debugging-tab value). Keep a pass-scoped promise cache so
   * those consumers share one remote capability call without changing lazy
   * AST semantics or leaking results across independent user events.
   */
  let ownedCapabilityPassCache = null;
  const withOwnedCapabilityPass = async (action) => {
    if (ownedCapabilityPassCache) return action();
    ownedCapabilityPassCache = new Map();
    try { return await action(); }
    finally { ownedCapabilityPassCache = null; }
  };

  /**
   * Browser-owned hybrid evaluation. The browser remains responsible for the
   * complete AST and preserves lazy operators/conditionals. Only a function node
   * whose parser-annotated capability is unavailable locally is delegated.
   * Phase 1 delegates EntityResolver calls individually; later planning may batch
   * compatible reached subtrees without changing ownership semantics.
   */
  const evaluateOwned = async (node) => {
    if (!node) return undefined;
    switch (node.kind) {
      case 'literal':
      case 'variable': return evaluate(node);
      case 'group': return evaluateOwned(node.expression);
      case 'unary': {
        const value = await evaluateOwned(node.operand);
        return evaluate({ ...node, operand: { kind: 'literal', value } });
      }
      case 'binary': {
        const left = await evaluateOwned(node.left);
        if (node.operator === '??') return left == null ? evaluateOwned(node.right) : left;
        if (node.operator === '&&') return truthy(left) ? evaluateOwned(node.right) : left;
        if (node.operator === '||') return truthy(left) ? left : evaluateOwned(node.right);
        const right = await evaluateOwned(node.right);
        return evaluate({ ...node, left: { kind: 'literal', value: left }, right: { kind: 'literal', value: right } });
      }
      case 'conditional': {
        const condition = await evaluateOwned(node.condition);
        if (typeof condition !== 'boolean') throw new Error(`?: requires a boolean condition; received ${condition === null ? 'null' : typeof condition}.`);
        return condition ? evaluateOwned(node.whenTrue) : evaluateOwned(node.whenFalse);
      }
      case 'function': {
        const args = [];
        for (const argument of node.arguments || []) args.push(await evaluateOwned(argument));
        const localCapabilities = new Set(['pure', 'clock', 'ctx']);
        if (node.capability === 'entityResolver') {
          const cacheKey = `${node.functionName}:${JSON.stringify(args)}`;
          const executeRemote = async () => {
            const response = await fetch('/bo/expression/evaluate-function', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ _csrf: csrfToken, functionName: node.functionName, args }),
            });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.error || payload.errorMessage || 'Remote expression capability failed.');
            return payload.value;
          };
          if (!ownedCapabilityPassCache) return executeRemote();
          if (!ownedCapabilityPassCache.has(cacheKey)) {
            ownedCapabilityPassCache.set(cacheKey, executeRemote());
          }
          try { return await ownedCapabilityPassCache.get(cacheKey); }
          catch (error) {
            ownedCapabilityPassCache.delete(cacheKey);
            throw error;
          }
        }
        if (node.capability && !localCapabilities.has(node.capability)) {
          throw new Error(`Function ${node.functionName} requires capability '${node.capability}', unavailable to browser evaluation owner.`);
        }
        return evaluate({ ...node, arguments: args.map((value) => ({ kind: 'literal', value })) });
      }
      default: return evaluate(node);
    }
  };

  window.ManatOS = window.ManatOS || {};
  window.ManatOS.expression = Object.freeze({
    evaluateAst: (ast) => evaluate(ast),
    evaluateAstOwned: (ast) => evaluateOwned(ast),
    evaluateAstAt: (ast, scopePath) => {
      const previousScope = explicitEvaluationScopePath;
      explicitEvaluationScopePath = scopePath || null;
      try { return evaluate(ast); } finally { explicitEvaluationScopePath = previousScope; }
    },
    evaluateAstOwnedAt: async (ast, scopePath) => {
      const previousScope = explicitEvaluationScopePath;
      explicitEvaluationScopePath = scopePath || null;
      try { return await evaluateOwned(ast); } finally { explicitEvaluationScopePath = previousScope; }
    },
    evaluateAstWithScope: (ast, scope) => {
      const previousPath = explicitEvaluationScopePath;
      const previousValue = explicitEvaluationScopeValue;
      const previousMemo = explicitScopeMemo;
      const previousActive = explicitScopeActive;
      explicitEvaluationScopePath = null;
      explicitEvaluationScopeValue = scope && typeof scope === 'object' ? scope : null;
      explicitScopeMemo = new Map();
      explicitScopeActive = new Set();
      try { return evaluate(ast); }
      finally {
        explicitEvaluationScopePath = previousPath;
        explicitEvaluationScopeValue = previousValue;
        explicitScopeMemo = previousMemo;
        explicitScopeActive = previousActive;
      }
    },
    currentCtxPath: () => leafPagePath(),
    currentCtxNode: () => {
      const path = leafPagePath();
      return path && runtime?.get ? runtime.get(path) : null;
    },
  });

  // Normalization is a canonical field-metadata concern. Components merely
  // edit values; this generic pipeline evaluates the field's precompiled
  // normalize AST on blur and publishes the normalized value through CTX.
  form.addEventListener('focusout', (event) => {
    const control = event.target instanceof Element ? event.target.closest('[data-ctx-field]') : null;
    if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement)) return;
    const container = control.closest('[data-ctx-field-container]');
    if (!container?.dataset.fieldNormalizeAst) return;
    try {
      const ast = JSON.parse(container.dataset.fieldNormalizeAst || 'null');
      if (!ast) return;
      const previous = control.value;
      normalizationValueActive = true;
      normalizationValue = previous;
      let normalized;
      try { normalized = evaluate(ast); }
      finally { normalizationValueActive = false; normalizationValue = undefined; }
      if (normalized == null && previous === '') return;
      const next = normalized == null ? '' : String(normalized);
      if (next !== previous) {
        control.value = next;
        syncSourceField(control, { source: 'field-normalization', triggerField: control.dataset.ctxField });
      }
    } catch (error) {
      control.setCustomValidity(error instanceof Error ? error.message : 'Invalid value.');
      control.reportValidity();
    }
  });
  form.addEventListener('input', (event) => {
    const control = event.target instanceof Element ? event.target.closest('[data-ctx-field]') : null;
    if (control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement) control.setCustomValidity('');
  });

  /*
   * Compile the browser-side reactive plan once from the ASTs embedded by the
   * server. The browser never reparses expression strings. Calculated values
   * and evaluator-driven UI properties share this same dependency registry.
   */
  const astCache = new WeakMap();
  const parseAst = (element, attribute) => {
    let byAttribute = astCache.get(element);
    if (!byAttribute) {
      byAttribute = new Map();
      astCache.set(element, byAttribute);
    }
    if (byAttribute.has(attribute)) return byAttribute.get(attribute);
    try {
      const raw = element.getAttribute(attribute);
      const ast = raw ? JSON.parse(raw) : null;
      byAttribute.set(attribute, ast);
      return ast;
    } catch {
      byAttribute.set(attribute, null);
      return null;
    }
  };

  const expressionDependencyPaths = (ast) => {
    const dependencies = new Set();
    const scopePath = leafPagePath() ?? undefined;

    const visit = (node) => {
      if (!node || typeof node !== 'object') return;

      if (node.kind === 'variable' && typeof node.path === 'string') {
        const resolvedPath = runtime?.resolvePath?.(node.path, scopePath);
        if (typeof resolvedPath === 'string' && resolvedPath) {
          dependencies.add(resolvedPath);
        }
      }

      Object.values(node).forEach((value) => {
        if (Array.isArray(value)) value.forEach(visit);
        else if (value && typeof value === 'object') visit(value);
      });
    };

    visit(ast);
    return dependencies;
  };

  const pathsOverlap = (left, right) => {
    if (left === right) return true;
    const childOf = (candidate, parent) =>
      candidate.startsWith(`${parent}.`) || candidate.startsWith(`${parent}[`);
    return childOf(left, right) || childOf(right, left);
  };

  const reactiveEntries = [];
  const registerEntry = (entry) => {
    reactiveEntries.push(entry);
  };

  const sameReactiveValue = (left, right) => {
    if (Object.is(left, right)) return true;
    if (left && right && typeof left === 'object' && typeof right === 'object') {
      try { return JSON.stringify(left) === JSON.stringify(right); } catch { return false; }
    }
    return false;
  };

  const writeCalculatedControlValue = (control, value) => {
    window.ManatOSFieldComponents?.setFieldValue?.(control, value, { emit: false });
  };

  /*
   * Canonical normal-field calculations use the same precompiled AST/evaluator
   * plan as other calculated fields. The UI component arranging a field never participates
   * in the calculation. `triggeredBy` is matched against CTX causal provenance,
   * preserving the original user-authoritative field through dependent writes.
   */
  form.querySelectorAll('[data-field-calculation-ast]').forEach((container) => {
    if (!(container instanceof HTMLElement)) return;
    const ast = parseAst(container, 'data-field-calculation-ast');
    if (!ast) return;
    const key = container.dataset.ctxFieldContainer;
    if (!key) return;
    let triggeredBy = [];
    try {
      const parsed = JSON.parse(container.dataset.fieldCalculationTriggeredBy || '[]');
      if (Array.isArray(parsed)) triggeredBy = parsed.filter((value) => typeof value === 'string' && value);
    } catch { /* invalid metadata is already visible through server-side diagnostics */ }
    const scopePath = leafPagePath() ?? undefined;
    const triggerPaths = new Set(triggeredBy.map((fieldKey) => runtime?.resolvePath?.(fieldKey, scopePath)).filter(Boolean));

    registerEntry({
      kind: 'field-calculation',
      key,
      dependencyPaths: expressionDependencyPaths(ast),
      run: async (change) => {
        const authoritativePath = change?.cause?.triggerPath || change?.changedPath;
        if (triggerPaths.size) {
          if (!authoritativePath) return false;
          if (![...triggerPaths].some((triggerPath) => pathsOverlap(triggerPath, authoritativePath))) return false;
        }
        try {
          const next = await evaluateOwned(ast);
          const pagePath = leafPagePath();
          const fieldsPath = leafPageFieldsPath();
          if (!pagePath || !fieldsPath || !runtime?.updateField) return false;
          const valuePath = `${fieldsPath}.${key}.value`;
          const current = runtime.get?.(valuePath);
          if (sameReactiveValue(current, next)) return false;

          const escaped = globalThis.CSS?.escape ? CSS.escape(key) : key.replace(/"/g, '\\"');
          const control = form.querySelector(`[data-ctx-field="${escaped}"]`);
          writeCalculatedControlValue(control, next);
          const option = window.ManatOSFieldComponents?.getFieldOption?.(control);
          runtime.updateField(pagePath, key, next, option, {
            source: 'calculated-field',
            triggerPath: authoritativePath || valuePath,
            ...(change.cause?.rootEventId ? { rootEventId: change.cause.rootEventId } : {}),
          });
          return true;
        } catch {
          return false;
        }
      },
    });
  });

  const debugValueText = (value) => {
    // The debugger must expose raw evaluator values, not field presentation
    // placeholders, so null/undefined/empty-string remain distinguishable.
    if (value === undefined) return 'undefined';
    if (value === null) return 'null';
    if (value === '') return "''";
    if (Array.isArray(value)) return value.length ? `[ ${value.map(debugValueText).join(', ')} ]` : '[]';
    if (typeof value === 'string') return `'${value.replaceAll("'", "\\'")}'`;
    if (typeof value === 'object') {
      try { return JSON.stringify(value); } catch { return String(value); }
    }
    return String(value);
  };

  /*
   * Development-only Debugging-tab cells subscribe to the same resolved CTX
   * dependency paths as visible calculated values. Their AST is still the
   * server-compiled AST; the browser never reparses formula text.
   */
  form.querySelectorAll('[data-debug-calculation-value]').forEach((cell) => {
    if (!(cell instanceof HTMLElement)) return;
    const ast = parseAst(cell, 'data-debug-calculation-ast');
    if (!ast) return;
    registerEntry({
      kind: 'debug-value',
      dependencyPaths: expressionDependencyPaths(ast),
      run: async () => {
        try {
          const next = debugValueText(await evaluateOwned(ast));
          const changed = cell.textContent !== next;
          if (changed) cell.textContent = next;
          return changed;
        } catch {
          return false;
        }
      },
    });
  });

  /*
   * Layout spans use the same precompiled-AST reactive pipeline as field
   * visibility/editability. Metadata may therefore reflow a grid when a CTX
   * dependency changes without any entity/component-specific JavaScript.
   */
  form.querySelectorAll('[data-ui-grid-span-ast]').forEach((container) => {
    if (!(container instanceof HTMLElement)) return;
    const spanAst = parseAst(container, 'data-ui-grid-span-ast');
    if (!spanAst) return;
    const fallback = Math.max(1, Math.min(12, Number(container.dataset.uiGridSpanFallback || 12) || 12));

    registerEntry({
      kind: 'grid-span',
      dependencyPaths: expressionDependencyPaths(spanAst),
      run: async () => {
        try {
          const evaluated = Number(await evaluateOwned(spanAst));
          const nextSpan = Number.isFinite(evaluated)
            ? Math.max(1, Math.min(12, Math.trunc(evaluated)))
            : fallback;
          const currentClass = [...container.classList].find((name) => /^col-md-\d+$/.test(name));
          const nextClass = `col-md-${nextSpan}`;
          if (currentClass === nextClass) return false;
          if (currentClass) container.classList.remove(currentClass);
          container.classList.add(nextClass);
          return true;
        } catch {
          return false;
        }
      },
    });
  });

  form.querySelectorAll('[data-ctx-field-container]').forEach((container) => {
    if (!(container instanceof HTMLElement)) return;
    const visibleAst = parseAst(container, 'data-ui-visible-ast');
    const editableAst = parseAst(container, 'data-ui-editable-ast');

    if (visibleAst) {
      registerEntry({
        kind: 'visible',
        dependencyPaths: expressionDependencyPaths(visibleAst),
        run: async () => {
          try {
            const nextHidden = (await evaluateOwned(visibleAst)) === false;
            const changed = container.hidden !== nextHidden;
            container.hidden = nextHidden;
            return changed;
          } catch {
            return false;
          }
        },
      });
    }

    if (editableAst) {
      registerEntry({
        kind: 'editable',
        dependencyPaths: expressionDependencyPaths(editableAst),
        run: async () => {
          try {
            const editable = (await evaluateOwned(editableAst)) !== false;
            const controls = [...container.querySelectorAll('[data-ctx-field]')];
            const readonlySubmit = container.querySelector('[data-readonly-submit]');
            const hasReadOnlyValue = container.dataset.uiHasReadonlyValue === 'true';
            let readOnlyValue;
            if (hasReadOnlyValue) {
              try { readOnlyValue = JSON.parse(container.dataset.uiReadonlyValue || 'null'); }
              catch { readOnlyValue = null; }
            }

            let changed = false;
            controls.forEach((control) => {
              const wasEditable = control instanceof HTMLInputElement && control.type !== 'checkbox'
                ? !control.readOnly
                : !control.disabled;

              if (!editable && hasReadOnlyValue) {
                const current = controlValue(control);
                if (!Object.is(current, readOnlyValue)) {
                  if (control instanceof HTMLInputElement && control.type === 'checkbox') {
                    control.checked = Boolean(readOnlyValue);
                  } else if (control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement) {
                    control.value = readOnlyValue == null ? '' : String(readOnlyValue);
                  }
                  window.ManatOSFieldComponents?.setFieldValue?.(control, controlValue(control), { emit: false });

                  const key = control.dataset.ctxField;
                  const pagePath = leafPagePath();
                  const fieldsPath = leafPageFieldsPath();
                  if (key && pagePath && fieldsPath && runtime?.updateField) {
                    const valuePath = `${fieldsPath}.${key}.value`;
                    runtime.updateField(pagePath, key, readOnlyValue, undefined, {
                      source: 'field-editability',
                      triggerPath: valuePath,
                    });
                  } else if (key && fieldsPath && runtime?.replace) {
                    const valuePath = `${fieldsPath}.${key}.value`;
                    runtime.replace(valuePath, readOnlyValue, {
                      source: 'field-editability',
                      triggerPath: valuePath,
                    });
                    syncCurrentValue(key, readOnlyValue, 'field-editability', valuePath);
                  }
                  changed = true;
                }
              }

              if (control instanceof HTMLInputElement && control.type !== 'checkbox') control.readOnly = !editable;
              else control.disabled = !editable;
              window.ManatOSFieldComponents?.setFieldValue?.(control, controlValue(control), { emit: false });
              if (wasEditable !== editable) changed = true;
            });

            if (readonlySubmit instanceof HTMLInputElement) {
              readonlySubmit.disabled = editable;
              readonlySubmit.value = readOnlyValue == null ? '' : String(readOnlyValue);
            }

            return changed;
          } catch {
            return false;
          }
        },
      });
    }
  });

  /*
   * CTX-event scheduler.
   *
   * Every formula subscribes to the exact CTX paths resolved from its AST when
   * the page starts. User edits and calculated/programmatic changes all travel
   * through the same CTX setter/event path. If a calculation changes another
   * CTX value, that event is queued and wakes its own dependents. Processing
   * continues until the queue is empty, with a hard cycle/runaway guard.
   */
  const pendingChanges = [];
  const pendingChangeKeys = new Set();
  let processingChanges = false;

  const processPendingChanges = async () => {
    if (processingChanges) return;
    processingChanges = true;
    let executions = 0;
    try {
      await withOwnedCapabilityPass(async () => {
      while (pendingChanges.length) {
        const currentChange = pendingChanges.shift();
        pendingChangeKeys.delete(currentChange.queueKey);

        for (const entry of reactiveEntries) {
          if (![...entry.dependencyPaths].some((dependencyPath) => pathsOverlap(dependencyPath, currentChange.changedPath))) continue;
          await entry.run(currentChange);
          executions += 1;
          if (executions > 512) {
            console.error('[ManatOS CTX] Reactive calculation queue exceeded 512 executions; possible dependency cycle.', {
              changedPath: currentChange.changedPath,
              triggerPath: currentChange.cause?.triggerPath,
              rootEventId: currentChange.cause?.rootEventId,
            });
            pendingChanges.length = 0;
            pendingChangeKeys.clear();
            return;
          }
        }
      }
      });
    } finally {
      processingChanges = false;
      // A change may arrive after the loop observed an empty queue but before
      // this owner releases the scheduler flag. Start another drain without
      // duplicating or rewriting the queued causal event.
      if (pendingChanges.length) void processPendingChanges();
    }
  };

  const enqueueChange = (change) => {
    const paths = [change?.path, ...(Array.isArray(change?.relatedPaths) ? change.relatedPaths : [])]
      .filter((path) => typeof path === 'string' && path);
    if (!paths.length) return;
    const cause = change?.cause || {};
    for (const changedPath of paths) {
      const key = `${cause.rootEventId || cause.eventId || 'event'}|${changedPath}`;
      if (pendingChangeKeys.has(key)) continue;
      pendingChangeKeys.add(key);
      pendingChanges.push({ changedPath, cause, queueKey: key });
    }
    void processPendingChanges();
  };

  const runAllReactiveEntries = () => {
    // Preserve deterministic metadata order even though some entries may cross
    // an async capability boundary. Dependent CTX writes still re-enter the
    // normal causal event scheduler.
    void withOwnedCapabilityPass(async () => {
      for (const entry of reactiveEntries) await entry.run();
    });
  };

  const syncSourceField = (control, eventCause = {}) => {
    const key = control?.dataset?.ctxField;
    if (!key) return;
    const value = controlValue(control);
    const fieldsPath = leafPageFieldsPath();
    const path = fieldsPath ? `${fieldsPath}.${key}.value` : `fields.${key}.value`;

    window.ManatOSFieldComponents?.setFieldValue?.(control, controlValue(control), { emit: false });

    const source = typeof eventCause.source === 'string' && eventCause.source
      ? eventCause.source
      : 'form-field';
    const triggerPath = eventCause.triggerField && fieldsPath
      ? `${fieldsPath}.${eventCause.triggerField}.value`
      : (eventCause.triggerPath || path);
    const cause = { source, triggerPath, ...(eventCause.rootEventId ? { rootEventId: eventCause.rootEventId } : {}) };

    if (fieldsPath && runtime?.updateField) {
      const pagePath = leafPagePath();
      const option = window.ManatOSFieldComponents?.getFieldOption?.(control);
      runtime.updateField(pagePath, key, value, option, cause);
    } else if (fieldsPath && runtime?.replace) {
      runtime.replace(path, value, cause);
      syncCurrentValue(key, value, source, triggerPath);
    } else {
      window.dispatchEvent(new CustomEvent(CHANGE_EVENT, {
        detail: {
          operation: 'replace', path, relatedPaths: [], newValue: value,
          cause,
        },
      }));
    }
  };

  const react = (event) => {
    const control = event.target instanceof Element ? event.target.closest('[data-ctx-field]') : null;
    if (control) syncSourceField(control, event.manatosCause || {});
  };

  // DOM controls only adapt user input into CTX. Formula-to-form reactivity is
  // entirely driven by CTX value paths discovered from AST dependencies.
  window.addEventListener(CHANGE_EVENT, (event) => {
    enqueueChange(event?.detail || {});
  });

  form.addEventListener('click', (event) => {
    const action = event.target instanceof Element ? event.target.closest('[data-debug-inspect-ctx]') : null;
    if (!(action instanceof HTMLButtonElement)) return;
    const path = action.dataset.debugInspectPath;
    if (!path) return;
    window.dispatchEvent(new Event('manatos:ctx-viewer-show'));
    window.dispatchEvent(new CustomEvent('manatos:ctx-viewer-select', { detail: { path, expand: true } }));
  });

  form.addEventListener('input', react);
  form.addEventListener('change', react);
  queueMicrotask(() => {
    form.querySelectorAll('[data-ctx-field]').forEach((control) => {
      window.ManatOSFieldComponents?.setFieldValue?.(control, controlValue(control), { emit: false });
    });
    runAllReactiveEntries();
    form.dispatchEvent(new Event('change', { bubbles: true }));
  });
})();
