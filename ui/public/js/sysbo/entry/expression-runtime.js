/* Browser expression execution service for metadata-driven UI.
 *
 * Owns variable resolution, scalar/function AST evaluation, hybrid capability
 * delegation, and the document-local mirror of UI-process compiled ASTs.
 * It does not own form reactivity, DOM synchronization, or dependency scheduling.
 */
window.ManatOS = window.ManatOS || {};

window.ManatOS.createEntryExpressionRuntime = ({
  runtime,
  entryPagePath,
  entryPageFieldsPath,
  csrfToken,
  entryInitialization,
}) => {
  // Evaluation-local operands are explicit invocation data, never shared mutable
  // evaluator state or semantic CTX. Field normalization currently uses only the
  // raw control `value`; all ordinary field/runtime values remain CTX-owned.
  const resolveVariable = (node, evaluationScopePath = null, invocation = null) => {
    if (!node || !Array.isArray(node.members) || !node.members.length) return undefined;

    const firstMember = node.members[0];
    if (
      invocation?.operands &&
      Object.prototype.hasOwnProperty.call(invocation.operands, 'value') &&
      !node.absolute &&
      firstMember === 'value' &&
      node.members.length === 1
    )
      return invocation.operands.value;

    const usesExplicitCtxPathLanguage =
      node.absolute ||
      String(node.path || '').startsWith('$') ||
      firstMember === '$' ||
      firstMember === '#' ||
      firstMember === '#level' ||
      node.members.some(
        (member) => member && typeof member === 'object' && member.kind === 'dynamic-path',
      );

    // Explicit CTX owners resolve ordinary field variables through the canonical
    // variable AST. Browser entry initialization evaluates against the real entry
    // surface itself, so there is no initialization-only working-record scope.
    if (evaluationScopePath && runtime?.resolveVariableWithPath) {
      const resolved = runtime.resolveVariableWithPath(node, evaluationScopePath, (expression) =>
        evaluate(expression, evaluationScopePath, invocation),
      );
      if (resolved) return resolved.value;
    }

    if (usesExplicitCtxPathLanguage && runtime?.resolveVariable) {
      const scopePath =
        evaluationScopePath ?? entryPageFieldsPath?.replace(/\.fields$/, '') ?? undefined;
      const resolved = runtime.resolveVariable(node, scopePath, (expression) =>
        evaluate(expression, evaluationScopePath, invocation),
      );
      if (resolved !== undefined) return resolved;
      throw new Error(
        `Reactive CTX variable not available from ${scopePath || 'ctx'}: ${node.path}`,
      );
    }

    // Normal entry expressions resolve against the real CTX before the generic
    // root/page/user/system resolver. This keeps rich field state observable and
    // inspectable at #level.fields.<field> instead of manufacturing an
    // evaluator-only field wrapper.
    if (!node.absolute && runtime?.resolveVariableWithPath) {
      const scopePath = entryPagePath ?? undefined;
      const resolved = runtime.resolveVariableWithPath(node, scopePath, (expression) =>
        evaluate(expression, evaluationScopePath, invocation),
      );
      if (resolved) return resolved.value;
    }

    // Root/page/user/system paths continue through the generic CTX resolver.
    if (runtime?.resolve) {
      const scopePath =
        evaluationScopePath ?? entryPageFieldsPath?.replace(/\.fields$/, '') ?? undefined;
      const resolved = runtime.resolve(node.path, scopePath);
      if (resolved !== undefined) return resolved;
    }
    throw new Error(
      `Reactive expression variable not available in this browser scope: ${node.path}`,
    );
  };

  const scalar = (value) =>
    value === null ||
    ['string', 'number', 'boolean', 'undefined'].includes(typeof value) ||
    value instanceof Date;
  const num = (value, op) => {
    if (typeof value !== 'number' || !Number.isFinite(value))
      throw new Error(`${op} requires numbers`);
    return value;
  };
  const truthy = (value) => {
    if (!scalar(value))
      throw new Error('Structured values are not supported by reactive scalar expressions yet.');
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
  const daysInCalendarMonth = (year, monthIndex) =>
    new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const withClampedCalendarYearMonth = (date, year, monthIndex) =>
    new Date(
      Date.UTC(
        year,
        monthIndex,
        Math.min(date.getUTCDate(), daysInCalendarMonth(year, monthIndex)),
      ),
    );
  const addCalendarDuration = (start, duration) => {
    let cursor = withClampedCalendarYearMonth(
      start,
      start.getUTCFullYear() + duration.years,
      start.getUTCMonth(),
    );
    const monthTotal = cursor.getUTCFullYear() * 12 + cursor.getUTCMonth() + duration.months;
    cursor = withClampedCalendarYearMonth(cursor, Math.floor(monthTotal / 12), monthTotal % 12);
    return new Date(cursor.getTime() + duration.days * 24 * 60 * 60 * 1000);
  };
  const calendarDurationBetween = (start, end) => {
    if (end.getTime() < start.getTime()) return null;
    let years = Math.max(0, end.getUTCFullYear() - start.getUTCFullYear());
    while (
      years > 0 &&
      addCalendarDuration(start, { years, months: 0, days: 0 }).getTime() > end.getTime()
    )
      years -= 1;
    let cursor = addCalendarDuration(start, { years, months: 0, days: 0 });
    let months = Math.max(
      0,
      (end.getUTCFullYear() - cursor.getUTCFullYear()) * 12 +
        (end.getUTCMonth() - cursor.getUTCMonth()),
    );
    while (
      months > 0 &&
      addCalendarDuration(cursor, { years: 0, months, days: 0 }).getTime() > end.getTime()
    )
      months -= 1;
    cursor = addCalendarDuration(cursor, { years: 0, months, days: 0 });
    const days = Math.max(
      0,
      Math.round((end.getTime() - cursor.getTime()) / (24 * 60 * 60 * 1000)),
    );
    return { years, months, days };
  };

  const evaluate = (node, evaluationScopePath = null, invocation = null) => {
    if (!node) return undefined;
    switch (node.kind) {
      case 'literal':
        return node.value;
      case 'variable':
        return resolveVariable(node, evaluationScopePath, invocation);
      case 'group':
        return evaluate(node.expression, evaluationScopePath, invocation);
      case 'unary': {
        const value = evaluate(node.operand, evaluationScopePath, invocation);
        if (node.operator === '!') return !truthy(value);
        if (node.operator === '~') return ~num(value, '~');
        if (node.operator === '+') return num(value, '+');
        if (node.operator === '-') return -num(value, '-');
        return undefined;
      }
      case 'binary': {
        const left = evaluate(node.left, evaluationScopePath, invocation);
        if (node.operator === '??')
          return left == null ? evaluate(node.right, evaluationScopePath, invocation) : left;
        if (node.operator === '&&')
          return truthy(left) ? evaluate(node.right, evaluationScopePath, invocation) : left;
        if (node.operator === '||')
          return truthy(left) ? left : evaluate(node.right, evaluationScopePath, invocation);
        const right = evaluate(node.right, evaluationScopePath, invocation);
        switch (node.operator) {
          case '+':
            return plus(left, right);
          case '-':
            return num(left, '-') - num(right, '-');
          case '*':
            return num(left, '*') * num(right, '*');
          case '/':
            return num(left, '/') / num(right, '/');
          case '%':
            return num(left, '%') % num(right, '%');
          case '**':
            return num(left, '**') ** num(right, '**');
          // Intentional JS/TS-style scalar equality split, matching the server evaluator.
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
            return num(left, '<<') << (num(right, '<<') & 31);
          case '>>':
            return num(left, '>>') >> (num(right, '>>') & 31);
          case '>>>':
            return (num(left, '>>>') >>> (num(right, '>>>') & 31)) >>> 0;
          case '&':
            return num(left, '&') & num(right, '&');
          case '^':
            return num(left, '^') ^ num(right, '^');
          case '|':
            return num(left, '|') | num(right, '|');
          default:
            return undefined;
        }
      }
      case 'conditional':
        return truthy(evaluate(node.condition, evaluationScopePath, invocation))
          ? evaluate(node.whenTrue, evaluationScopePath, invocation)
          : evaluate(node.whenFalse, evaluationScopePath, invocation);
      case 'function': {
        const args = (node.arguments || []).map((argument) =>
          evaluate(argument, evaluationScopePath, invocation),
        );
        if (node.functionName === 'CurrentUiLevel' || node.functionName === 'TraverseUiLevels') {
          const levels = [];
          let level = runtime?.value?.ui?.level ?? null;
          while (level) {
            levels.push(level);
            level = level.level ?? null;
          }
          return node.functionName === 'CurrentUiLevel' ? (levels.at(-1) ?? null) : levels;
        }
        if (node.functionName === 'FirstCtx') {
          const collection = args[0];
          const resultField = args[1];
          if (collection == null || typeof collection !== 'object') return null;
          const first = Array.isArray(collection) ? collection[0] : Object.values(collection)[0];
          if (first === undefined) return null;
          if (!resultField) return first;
          if (first == null || typeof first !== 'object') return null;
          return first[resultField] ?? null;
        }
        if (node.functionName === 'FindCtx') {
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
        if (node.functionName === 'CurrentDay') {
          const now = new Date();
          const pad = (v) => String(v).padStart(2, '0');
          return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T00:00`;
        }
        if (node.functionName === 'EmailAddress') {
          const normalized = String(args[0] ?? '')
            .trim()
            .toLocaleLowerCase();
          if (!normalized) return null;
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized))
            throw new Error('EmailAddress requires a valid email address.');
          return normalized;
        }
        if (node.functionName === 'TelephoneNbr') {
          const clean = (value) => String(value ?? '').trim();
          if (args.length === 1) {
            const raw = clean(args[0]);
            if (!raw) return null;
            const digits = raw.replace(/\D/g, '');
            if (!raw.startsWith('+') || digits.length < 4 || digits.length > 15)
              throw new Error(
                'TelephoneNbr requires an international number beginning with + and containing 4-15 digits.',
              );
            return `+${digits}`;
          }
          const country = clean(args[0]);
          const countryDigits = country.replace(/\D/g, '');
          const numberDigits = clean(args[1]).replace(/\D/g, '');
          if (
            !country.startsWith('+') ||
            !countryDigits ||
            numberDigits.length < 3 ||
            `${countryDigits}${numberDigits}`.length > 15
          )
            throw new Error('TelephoneNbr requires a valid country code and national number.');
          return `+${countryDigits}${numberDigits}`;
        }
        if (node.functionName === 'SqRoot') return Math.sqrt(Number(args[0]));
        if (node.functionName === 'TraverseCtx') {
          const [startId, collection, parentField, resultField] = args;
          if (startId == null || startId === '' || !collection || typeof collection !== 'object')
            return null;
          const keyed = (container, key) => {
            if (Array.isArray(container)) {
              return container.find(
                (item) => item && typeof item === 'object' && (item.id === key || item.key === key),
              );
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
            if (parent == null || parent === '')
              return resultField ? (row[resultField] ?? null) : row;
            id = parent;
          }
          throw new Error('TraverseCtx exceeded the maximum traversal depth of 256.');
        }
        if (node.functionName === 'CalendarAddDuration') {
          const start = parseCalendarDate(args[0]);
          const duration = normalizedCalendarDuration(args[1]);
          return start && duration
            ? formatCalendarDate(addCalendarDuration(start, duration))
            : null;
        }
        if (node.functionName === 'CalendarDurationBetween') {
          const start = parseCalendarDate(args[0]);
          const end = parseCalendarDate(args[1]);
          return start && end ? calendarDurationBetween(start, end) : null;
        }
        if (node.functionName === 'GetTime') return Date.now();
        if (node.functionName === 'StrFormat') {
          return String(args[0] ?? '').replace(/\{(\d+)\}/g, (match, raw) =>
            Number(raw) + 1 < args.length ? String(args[Number(raw) + 1] ?? '') : match,
          );
        }
        return undefined;
      }
      default:
        return undefined;
    }
  };

  /*
   * One owner evaluation pass may contain several reactive consumers of the
   * same resolver-backed subexpression (for example the actual calculated
   * field plus its Debugging-tab value). The promise cache belongs to that
   * invocation only; independent async passes must never share resolver state.
   */
  const withOwnedCapabilityPass = (action) => action({ capabilityPromises: new Map() });

  /**
   * Browser-owned hybrid evaluation. The browser remains responsible for the
   * complete AST and preserves lazy operators/conditionals. Only a function node
   * whose parser-annotated capability is unavailable locally is delegated.
   * Phase 1 delegates EntityResolver calls individually; later planning may batch
   * compatible reached subtrees without changing ownership semantics.
   */
  // Owned evaluation may cross await boundaries (for example entityResolver calls).
  // The lexical CTX owner is an explicit evaluation argument, never shared mutable
  // evaluator state. Concurrent presentation evaluations can therefore interleave
  // without stealing each other's owner path.
  const evaluateAtOwnedPath = (node, ownedScopePath) => evaluate(node, ownedScopePath || null);

  const evaluateOwned = async (node, ownedScopePath = null, evaluationPass = null) => {
    if (!node) return undefined;
    switch (node.kind) {
      case 'literal':
      case 'variable':
        return evaluateAtOwnedPath(node, ownedScopePath);
      case 'group':
        return evaluateOwned(node.expression, ownedScopePath, evaluationPass);
      case 'unary': {
        const value = await evaluateOwned(node.operand, ownedScopePath, evaluationPass);
        return evaluateAtOwnedPath(
          { ...node, operand: { kind: 'literal', value } },
          ownedScopePath,
        );
      }
      case 'binary': {
        const left = await evaluateOwned(node.left, ownedScopePath, evaluationPass);
        if (node.operator === '??')
          return left == null ? evaluateOwned(node.right, ownedScopePath, evaluationPass) : left;
        if (node.operator === '&&')
          return truthy(left) ? evaluateOwned(node.right, ownedScopePath, evaluationPass) : left;
        if (node.operator === '||')
          return truthy(left) ? left : evaluateOwned(node.right, ownedScopePath, evaluationPass);
        const right = await evaluateOwned(node.right, ownedScopePath, evaluationPass);
        return evaluateAtOwnedPath(
          {
            ...node,
            left: { kind: 'literal', value: left },
            right: { kind: 'literal', value: right },
          },
          ownedScopePath,
        );
      }
      case 'conditional': {
        const condition = await evaluateOwned(node.condition, ownedScopePath, evaluationPass);
        if (typeof condition !== 'boolean')
          throw new Error(
            `?: requires a boolean condition; received ${condition === null ? 'null' : typeof condition}.`,
          );
        return condition
          ? evaluateOwned(node.whenTrue, ownedScopePath, evaluationPass)
          : evaluateOwned(node.whenFalse, ownedScopePath, evaluationPass);
      }
      case 'function': {
        const args = [];
        for (const argument of node.arguments || [])
          args.push(await evaluateOwned(argument, ownedScopePath, evaluationPass));
        const localCapabilities = new Set(['pure', 'clock', 'ctx']);
        if (node.capability === 'entityResolver') {
          const cacheKey = `${node.functionName}:${JSON.stringify(args)}`;
          const executeRemote = async () => {
            const remoteOwner = `expression:${cacheKey}`;
            const endExpressionActivity =
              window.ManatOS?.activity?.begin?.('expression') || (() => {});
            entryInitialization?.beginRemote?.(remoteOwner);
            try {
              const response = await fetch('/bo/expression/evaluate-function', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ _csrf: csrfToken, functionName: node.functionName, args }),
                manatosBusy: false,
              });
              const payload = await response.json();
              if (!response.ok)
                throw new Error(
                  payload.error || payload.errorMessage || 'Remote expression capability failed.',
                );
              return payload.value;
            } finally {
              entryInitialization?.endRemote?.(remoteOwner);
              endExpressionActivity();
            }
          };
          const capabilityPromises = evaluationPass?.capabilityPromises;
          if (!(capabilityPromises instanceof Map)) return executeRemote();
          if (!capabilityPromises.has(cacheKey)) {
            capabilityPromises.set(cacheKey, executeRemote());
          }
          try {
            return await capabilityPromises.get(cacheKey);
          } catch (error) {
            capabilityPromises.delete(cacheKey);
            throw error;
          }
        }
        if (node.capability && !localCapabilities.has(node.capability)) {
          throw new Error(
            `Function ${node.functionName} requires capability '${node.capability}', unavailable to browser evaluation owner.`,
          );
        }
        return evaluateAtOwnedPath(
          { ...node, arguments: args.map((value) => ({ kind: 'literal', value })) },
          ownedScopePath,
        );
      }
      default:
        return evaluateAtOwnedPath(node, ownedScopePath);
    }
  };

  // Browser execution mirror keyed by exact authored source. Canonical parsing and
  // AST ownership remain in the UI-server process-global registry; this cache only
  // prevents repeated transport during the lifetime of the current document.
  const astBySource = new Map();
  const astRequestBySource = new Map();

  const astForSource = (source) =>
    typeof source === 'string' && source ? (astBySource.get(source) ?? null) : null;

  const loadAstForSource = async (source) => {
    if (typeof source !== 'string' || !source) return null;
    const cached = astBySource.get(source);
    if (cached) return cached;
    if (astRequestBySource.has(source)) return astRequestBySource.get(source);

    const request = (async () => {
      const endExpressionActivity = window.ManatOS?.activity?.begin?.('expression') || (() => {});
      let response;
      try {
        response = await fetch('/bo/expression/compile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ _csrf: csrfToken, expression: source }),
          manatosBusy: false,
        });
      } finally {
        endExpressionActivity();
      }
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error || 'Expression could not be compiled by the UI server.');
      if (!payload?.ast) throw new Error('UI expression compiler returned no AST.');
      astBySource.set(source, payload.ast);
      return payload.ast;
    })();

    astRequestBySource.set(source, request);
    try {
      return await request;
    } finally {
      astRequestBySource.delete(source);
    }
  };

  return Object.freeze({
    evaluate,
    evaluateOwned,
    withOwnedCapabilityPass,
    astForSource,
    loadAstForSource,
  });
};
