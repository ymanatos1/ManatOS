/* Metadata-driven reactive entry-form runtime.
 *
 * Owns form/CTX synchronization, dependency registration and causal reactive
 * scheduling. AST execution and compile-cache transport live in the sibling
 * expression-runtime service and are consumed here through one explicit boundary.
 */

/* ==========================================================================
 * Metadata-driven reactive CTX fields
 *
 * Expression source remains available at presentation boundaries while AST objects
 * stay outside ordinary DOM transport and are resolved from the expression registry.
 * Every source-field mutation also emits the normal manatos:ctx-change event;
 * when the development CTX runtime is present the actual browser CTX node is
 * updated first so DEBUG observes the same value transition.
 *
 * The reactive plan is built once from registry-resolved ASTs. Calculated values and
 * evaluator-driven UI properties share one dependency registry, so a source
 * change evaluates only the entries that depend on that field and propagates
 * through calculated-field dependencies without reparsing expressions.
 * ======================================================================== */
window.ManatOS = window.ManatOS || {};
let resolveExpressionRuntimeReady;
window.ManatOS.expressionRuntimeReady = new Promise((resolve) => {
  resolveExpressionRuntimeReady = resolve;
});

(async () => {
  const formCandidate = document.querySelector('form.metadata-driven-record-form');
  const form = formCandidate instanceof HTMLFormElement ? formCandidate : null;
  const initializationOwner = 'reactive-entry';
  const entryInitialization = window.ManatOS?.entryInitialization ?? null;
  if (form) entryInitialization?.begin(initializationOwner);
  await entryInitialization?.readyForWork?.();

  const CHANGE_EVENT = 'manatos:ctx-change';
  const runtime = window.ManatOS?.ctx;
  const reactivePolicy = await import('/shared-runtime/policies/reactive-runtime-policy.js');
  const leafPagePath = () => {
    let node = runtime?.value?.ui?.level;
    if (!node) return null;
    let path = 'ctx.ui.level';
    while (node?.level) {
      node = node.level;
      path += '.level';
    }
    return path;
  };

  // This runtime belongs to the entry form that existed when it booted. Child UI
  // levels (selectors, popups, etc.) may temporarily become the topology leaf,
  // but they must never retarget the owning form's field writes/evaluation scope.
  const entryPagePath = leafPagePath();
  const entryPageFieldsPath = entryPagePath ? `${entryPagePath}.fields` : null;

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
    if (control instanceof HTMLInputElement && control.dataset.ctxValueType === 'json') {
      if (!control.value) return null;
      try {
        return JSON.parse(control.value);
      } catch {
        return null;
      }
    }
    return control?.value ?? null;
  };

  const fieldOptionFromCtx = (key, value) => {
    if (!entryPageFieldsPath || !key) return undefined;
    const options = runtime?.get?.(`${entryPageFieldsPath}.${key}.options`);
    if (!Array.isArray(options)) return undefined;
    return options.find(
      (candidate) => String(candidate?.value ?? candidate?.id ?? '') === String(value ?? ''),
    );
  };

  const csrfToken =
    form?.querySelector('input[name="_csrf"]')?.value ||
    document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') ||
    '';

  const createExpressionRuntime = window.ManatOS?.createEntryExpressionRuntime;
  if (typeof createExpressionRuntime !== 'function')
    throw new Error('Entry expression runtime service is unavailable.');
  const { evaluate, evaluateOwned, withOwnedCapabilityPass, astForSource, loadAstForSource } =
    createExpressionRuntime({
      runtime,
      entryPagePath,
      entryPageFieldsPath,
      csrfToken,
      entryInitialization,
    });

  window.ManatOS.expression = Object.freeze({
    astForSource,
    loadAstForSource,
    evaluateAst: (ast) => evaluate(ast),
    evaluateAstOwned: (ast) => evaluateOwned(ast),
    evaluateAstAt: (ast, scopePath) => evaluate(ast, scopePath || null),
    evaluateAstOwnedAt: (ast, scopePath) => evaluateOwned(ast, scopePath || null),
    currentCtxPath: () => entryPagePath,
    currentCtxNode: () => {
      const path = entryPagePath;
      return path && runtime?.get ? runtime.get(path) : null;
    },
  });
  resolveExpressionRuntimeReady?.(window.ManatOS.expression);

  // The evaluator is a page-runtime capability, not an entry-form capability.
  // List/page actions also consume metadata expressions, so publish the evaluator
  // on every shell page and stop here only after that capability exists.
  if (!form) return;

  // Normalization is a canonical field-metadata concern. Components merely
  // edit values; this generic pipeline resolves the field AST lazily from
  // canonical authored source on blur and publishes the normalized value through CTX.
  form.addEventListener('focusout', async (event) => {
    const control =
      event.target instanceof Element ? event.target.closest('[data-ctx-field]') : null;
    if (!(
      control instanceof HTMLInputElement ||
      control instanceof HTMLSelectElement ||
      control instanceof HTMLTextAreaElement
    ))
      return;
    const container = control.closest('[data-ctx-field-container]');
    if (!container?.dataset.fieldNormalizeExpression) return;
    try {
      const ast = await loadAstForSource(container.dataset.fieldNormalizeExpression);
      if (!ast) return;
      const previous = control.value;
      const normalized = evaluate(ast, null, {
        operands: Object.freeze({ value: previous }),
      });
      if (normalized == null && previous === '') return;
      const next = normalized == null ? '' : String(normalized);
      if (next !== previous) {
        control.value = next;
        syncSourceField(control, {
          source: 'field-normalization',
          triggerField: control.dataset.ctxField,
        });
      }
    } catch (error) {
      control.setCustomValidity(error instanceof Error ? error.message : 'Invalid value.');
      control.reportValidity();
    }
  });
  form.addEventListener('input', (event) => {
    const control =
      event.target instanceof Element ? event.target.closest('[data-ctx-field]') : null;
    if (
      control instanceof HTMLInputElement ||
      control instanceof HTMLSelectElement ||
      control instanceof HTMLTextAreaElement
    )
      control.setCustomValidity('');
  });

  /* Resolve browser execution AST data by authored source through the UI compile boundary. */
  const compileAttribute = async (element, attribute) => {
    const source = element.getAttribute(attribute);
    if (!source) return null;
    const ast = await loadAstForSource(source);
    if (!ast) console.error('[ManatOS expression AST registry] Missing resolved AST', source);
    return ast;
  };

  const expressionDependencyPaths = (ast) => {
    const dependencies = new Set();
    const scopePath = entryPagePath ?? undefined;

    const visit = (node) => {
      if (!node || typeof node !== 'object') return;

      if (node.kind === 'variable' && typeof node.path === 'string') {
        // Dependency discovery consumes the same canonical variable AST as
        // evaluation. Using node.path would reparse aliases such as
        // $level-entity-fields and loses dynamic path members.
        const resolvedPath = runtime?.resolveVariableWithPath?.(
          node,
          scopePath,
          (dynamicExpression) => evaluate(dynamicExpression, scopePath),
        )?.path;
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

  const pathsOverlap = reactivePolicy.reactivePathsOverlap;

  const reactiveEntries = [];
  const registerEntry = (entry) => {
    reactiveEntries.push(entry);
    runtime?.trackSubscriber?.([...entry.dependencyPaths], {
      kind: 'expression',
      label: entry.kind,
    });
  };

  const sameReactiveValue = (left, right) => {
    if (Object.is(left, right)) return true;
    if (left && right && typeof left === 'object' && typeof right === 'object') {
      try {
        return JSON.stringify(left) === JSON.stringify(right);
      } catch {
        return false;
      }
    }
    return false;
  };

  const writeCalculatedControlValue = (control, value) => {
    window.ManatOS?.fieldComponents?.setFieldValue?.(control, value, { emit: false });
  };

  /*
   * Canonical field calculations are discovered from entity metadata, never from
   * whichever presentation container happens to render the field. This keeps
   * summary/read-only/hidden calculated fields semantic and presentation-neutral.
   * Dependencies still come exclusively from the cached canonical AST.
   */
  const entrySurface = entryPagePath ? runtime?.get?.(entryPagePath) : null;
  const entryEntity = Object.values(runtime?.value?.entities || {}).find(
    (candidate) => candidate?.key === entrySurface?.control?.entityKey,
  );
  const canonicalFieldDefinitions = entryEntity?.metadata?.fieldDefinition || {};

  for (const [key, definition] of Object.entries(canonicalFieldDefinitions)) {
    const source = definition?.calculation?.expression;
    if (typeof source !== 'string' || !source.trim()) continue;
    const ast = await loadAstForSource(source);
    if (!ast) continue;
    registerEntry({
      kind: 'field-calculation',
      key,
      dependencyPaths: expressionDependencyPaths(ast),
      run: async (change, evaluationPass) => {
        const authoritativePath = change?.cause?.triggerPath || change?.changedPath;
        try {
          const next = await evaluateOwned(ast, null, evaluationPass);
          const pagePath = entryPagePath;
          const fieldsPath = entryPageFieldsPath;
          if (!pagePath || !fieldsPath || !runtime?.updateField) return false;
          const valuePath = `${fieldsPath}.${key}.value`;
          const current = runtime.get?.(valuePath);
          if (sameReactiveValue(current, next)) return false;

          const escaped = globalThis.CSS?.escape ? CSS.escape(key) : key.replace(/"/g, '\\"');
          const control = form.querySelector(`[data-ctx-field="${escaped}"]`);
          writeCalculatedControlValue(control, next);
          form
            .querySelectorAll(
              `[data-v2-summary-field-key="${escaped}"] [data-v2-summary-dynamic-value]`,
            )
            .forEach((element) => {
              if (element instanceof HTMLElement)
                element.textContent = next == null || next === '' ? '—' : String(next);
            });
          const option = fieldOptionFromCtx(key, next);
          runtime.updateField(pagePath, key, next, option, {
            source: 'calculated-field',
            triggerPath: authoritativePath || valuePath,
            ...(change?.cause?.rootEventId ? { rootEventId: change.cause.rootEventId } : {}),
          });
          return true;
        } catch (error) {
          console.error('[ManatOS calculated field]', { key, error });
          return false;
        }
      },
    });
  }

  const debugValueText = (value) => {
    // The debugger must expose raw evaluator values, not field presentation
    // placeholders, so null/undefined/empty-string remain distinguishable.
    if (value === undefined) return 'undefined';
    if (value === null) return 'null';
    if (value === '') return "''";
    if (Array.isArray(value))
      return value.length ? `[ ${value.map(debugValueText).join(', ')} ]` : '[]';
    if (typeof value === 'string') return `'${value.replaceAll("'", "\\'")}'`;
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    }
    return String(value);
  };

  /*
   * Development-only Debugging-tab cells subscribe to the same resolved CTX
   * dependency paths as visible calculated values. The DOM carries only the
   * authored expression source; the executable AST is resolved lazily through
   * the same non-semantic browser execution mirror used by production consumers.
   */
  for (const cell of form.querySelectorAll('[data-debug-calculation-value]')) {
    if (!(cell instanceof HTMLElement)) continue;
    const sourceElement = cell.closest('tr')?.querySelector('[data-debug-expression]');
    const source = sourceElement?.textContent ?? '';
    const ast = await loadAstForSource(source);
    if (!ast) continue;

    registerEntry({
      kind: 'debug-value',
      dependencyPaths: expressionDependencyPaths(ast),
      run: async (_change, evaluationPass) => {
        try {
          const next = debugValueText(await evaluateOwned(ast, null, evaluationPass));
          const changed = cell.textContent !== next;
          if (changed) cell.textContent = next;
          return changed;
        } catch {
          return false;
        }
      },
    });
  }

  /*
   * Layout spans use the same cached-AST reactive pipeline as field
   * visibility/editability. Metadata may therefore reflow a grid when a CTX
   * dependency changes without any entity/component-specific JavaScript.
   */
  for (const container of form.querySelectorAll('[data-ui-grid-span-expression]')) {
    if (!(container instanceof HTMLElement)) continue;
    const spanAst = await compileAttribute(container, 'data-ui-grid-span-expression');
    if (!spanAst) continue;
    const fallback = Math.max(
      1,
      Math.min(12, Number(container.dataset.uiGridSpanFallback || 12) || 12),
    );

    registerEntry({
      kind: 'grid-span',
      dependencyPaths: expressionDependencyPaths(spanAst),
      run: async (_change, evaluationPass) => {
        try {
          const evaluated = Number(await evaluateOwned(spanAst, null, evaluationPass));
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
  }

  for (const container of form.querySelectorAll('[data-ctx-field-container]')) {
    if (!(container instanceof HTMLElement)) continue;
    const visibleAst = await compileAttribute(container, 'data-ui-visible-expression');
    const editableAst = await compileAttribute(container, 'data-ui-editable-expression');

    if (visibleAst) {
      registerEntry({
        kind: 'visible',
        dependencyPaths: expressionDependencyPaths(visibleAst),
        run: async (_change, evaluationPass) => {
          try {
            const nextHidden = (await evaluateOwned(visibleAst, null, evaluationPass)) === false;
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
        run: async (_change, evaluationPass) => {
          try {
            const editable = (await evaluateOwned(editableAst, null, evaluationPass)) !== false;
            const controls = [...container.querySelectorAll('[data-ctx-field]')];
            const readonlySubmit = container.querySelector('[data-readonly-submit]');
            const hasReadOnlyValue = container.dataset.uiHasReadonlyValue === 'true';
            let readOnlyValue;
            if (hasReadOnlyValue) {
              try {
                readOnlyValue = JSON.parse(container.dataset.uiReadonlyValue || 'null');
              } catch {
                readOnlyValue = null;
              }
            }

            let changed = false;
            controls.forEach((control) => {
              const wasEditable =
                control instanceof HTMLInputElement && control.type !== 'checkbox'
                  ? !control.readOnly
                  : !control.disabled;

              if (!editable && hasReadOnlyValue) {
                const current = controlValue(control);
                if (!Object.is(current, readOnlyValue)) {
                  if (control instanceof HTMLInputElement && control.type === 'checkbox') {
                    control.checked = Boolean(readOnlyValue);
                  } else if (
                    control instanceof HTMLInputElement ||
                    control instanceof HTMLSelectElement ||
                    control instanceof HTMLTextAreaElement
                  ) {
                    control.value = readOnlyValue == null ? '' : String(readOnlyValue);
                  }
                  window.ManatOS?.fieldComponents?.setFieldValue?.(control, controlValue(control), {
                    emit: false,
                  });

                  const key = control.dataset.ctxField;
                  const pagePath = entryPagePath;
                  const fieldsPath = entryPageFieldsPath;
                  if (key && pagePath && fieldsPath && runtime?.updateField) {
                    const valuePath = `${fieldsPath}.${key}.value`;
                    runtime.updateField(pagePath, key, readOnlyValue, undefined, {
                      source: 'field-editability',
                      triggerPath: valuePath,
                    });
                  }
                  changed = true;
                }
              }

              if (control instanceof HTMLInputElement && control.type !== 'checkbox')
                control.readOnly = !editable;
              else control.disabled = !editable;
              window.ManatOS?.fieldComponents?.setFieldValue?.(control, controlValue(control), {
                emit: false,
              });
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
  }

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
      await withOwnedCapabilityPass(async (evaluationPass) => {
        while (pendingChanges.length) {
          const currentChange = pendingChanges.shift();
          pendingChangeKeys.delete(currentChange.queueKey);

          for (const entry of reactiveEntries) {
            if (
              ![...entry.dependencyPaths].some((dependencyPath) =>
                pathsOverlap(dependencyPath, currentChange.changedPath),
              )
            )
              continue;
            await entry.run(currentChange, evaluationPass);
            executions += 1;
            if (executions > 512) {
              console.error(
                '[ManatOS CTX] Reactive calculation queue exceeded 512 executions; possible dependency cycle.',
                {
                  changedPath: currentChange.changedPath,
                  triggerPath: currentChange.cause?.triggerPath,
                  rootEventId: currentChange.cause?.rootEventId,
                },
              );
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
    const paths = [
      change?.path,
      ...(Array.isArray(change?.relatedPaths) ? change.relatedPaths : []),
    ].filter((path) => typeof path === 'string' && path);
    if (!paths.length) return;
    const cause = change?.cause || {};
    for (const changedPath of paths) {
      const key = reactivePolicy.reactiveChangeQueueKey(changedPath, cause);
      if (pendingChangeKeys.has(key)) continue;
      pendingChangeKeys.add(key);
      pendingChanges.push({ changedPath, cause, queueKey: key });
    }
    void processPendingChanges();
  };

  const runAllReactiveEntries = () =>
    withOwnedCapabilityPass(async (evaluationPass) => {
      // Preserve deterministic metadata order even though some entries may cross
      // an async capability boundary. Dependent CTX writes still re-enter the
      // normal causal event scheduler.
      for (const entry of reactiveEntries) await entry.run(undefined, evaluationPass);
    });

  const syncSourceField = (control, eventCause = {}) => {
    const key = control?.dataset?.ctxField;
    if (!key) return;
    const value = controlValue(control);
    const fieldsPath = entryPageFieldsPath;
    const path = fieldsPath ? `${fieldsPath}.${key}.value` : `fields.${key}.value`;

    window.ManatOS?.fieldComponents?.setFieldValue?.(control, controlValue(control), {
      emit: false,
    });

    const source =
      typeof eventCause.source === 'string' && eventCause.source ? eventCause.source : 'form-field';
    const triggerPath =
      eventCause.triggerField && fieldsPath
        ? `${fieldsPath}.${eventCause.triggerField}.value`
        : eventCause.triggerPath || path;
    const cause = {
      source,
      triggerPath,
      ...(eventCause.rootEventId ? { rootEventId: eventCause.rootEventId } : {}),
    };

    if (!fieldsPath || !entryPagePath || !runtime?.updateField)
      throw new Error('Canonical CTX field mutation authority is unavailable.');

    const option = fieldOptionFromCtx(key, value);
    runtime.updateField(entryPagePath, key, value, option, cause);
  };

  const react = (event) => {
    const control =
      event.target instanceof Element ? event.target.closest('[data-ctx-field]') : null;
    if (control) syncSourceField(control, event.manatosCause || {});
  };

  // DOM controls only adapt user input into CTX. Formula-to-form reactivity is
  // entirely driven by CTX value paths discovered from AST dependencies.
  runtime?.trackSubscriber?.('*', { kind: 'scheduler', label: 'Reactive expression scheduler' });
  window.addEventListener(CHANGE_EVENT, (event) => {
    enqueueChange(event?.detail || {});
  });

  form.addEventListener('click', (event) => {
    const action =
      event.target instanceof Element ? event.target.closest('[data-debug-inspect-ctx]') : null;
    if (!(action instanceof HTMLButtonElement)) return;
    const path = action.dataset.debugInspectPath;
    if (!path) return;
    window.dispatchEvent(new Event('manatos:ctx-viewer-show'));
    window.dispatchEvent(
      new CustomEvent('manatos:ctx-viewer-select', { detail: { path, expand: true } }),
    );
  });

  form.addEventListener('input', react);
  form.addEventListener('change', react);
  queueMicrotask(async () => {
    form.querySelectorAll('[data-ctx-field]').forEach((control) => {
      window.ManatOS?.fieldComponents?.setFieldValue?.(control, controlValue(control), {
        emit: false,
      });
    });

    /*
     * Hosted-entry caller defaults are real field assignments, not inert render
     * hints. Publish each supplied value through the canonical CTX setter so
     * every dependent calculated field/UI property receives exactly the same
     * causal event it would receive from a user/programmatic field change.
     */
    const invocationValues = entryPagePath
      ? (runtime?.get?.(`${entryPagePath}.control.invocation.rules.values`) ?? {})
      : {};
    for (const [key, valueRule] of Object.entries(invocationValues)) {
      if (
        !valueRule ||
        typeof valueRule !== 'object' ||
        (!Object.prototype.hasOwnProperty.call(valueRule, 'default') &&
          !Object.prototype.hasOwnProperty.call(valueRule, 'fixed'))
      )
        continue;
      const escaped = globalThis.CSS?.escape ? CSS.escape(key) : key.replace(/"/g, '\\"');
      const control = form.querySelector(`[data-ctx-field="${escaped}"]`);
      if (control) syncSourceField(control, { source: 'entry-invocation', triggerField: key });
    }

    try {
      await runAllReactiveEntries();
      form.dispatchEvent(new Event('change', { bubbles: true }));
      form.dataset.metadataFormInitialized = 'true';
      form.dispatchEvent(new Event('manatos:form-initialized'));
    } finally {
      entryInitialization?.end(initializationOwner);
    }
  });
})();
