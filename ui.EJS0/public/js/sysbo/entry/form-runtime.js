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

const surfaceRuntime = window.ManatOS?.entrySurfaces;
const runtime = window.ManatOS?.ctx;
if (surfaceRuntime?.register && runtime) {
  let resolveExpressionRuntimeReady;
  window.ManatOS.expressionRuntimeReady = new Promise((resolve) => {
    resolveExpressionRuntimeReady = resolve;
  });

  const instances = new WeakMap();
  const instancesByPath = new Map();

  // Keep a host-neutral document evaluator for list/page actions. Entry forms get
  // their own evaluator below, bound to their canonical CTX owner.
  const documentExpressionService = window.ManatOS.createEntryExpressionRuntime({
    runtime,
    entryPagePath: null,
    entryPageFieldsPath: null,
    csrfToken: document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '',
    entryInitialization: null,
  });
  const documentExpression = Object.freeze({
    astForSource: documentExpressionService.astForSource,
    loadAstForSource: documentExpressionService.loadAstForSource,
    evaluateAst: (ast) => documentExpressionService.evaluate(ast),
    evaluateAstWithOperands: (ast, operands = {}) =>
      documentExpressionService.evaluate(ast, null, { operands: Object.freeze({ ...operands }) }),
    evaluateAstOwned: (ast) => documentExpressionService.evaluateOwned(ast),
    evaluateAstAt: (ast, scopePath) => documentExpressionService.evaluate(ast, scopePath || null),
    evaluateAstOwnedAt: (ast, scopePath) =>
      documentExpressionService.evaluateOwned(ast, scopePath || null),
    currentCtxPath: () => null,
    currentCtxNode: () => null,
  });
  window.ManatOS.expression = documentExpression;
  resolveExpressionRuntimeReady?.(documentExpression);

  const installAsync = async (form) => {
    if (!(form instanceof HTMLFormElement) || instances.has(form)) return;

    const entryPagePath = form.dataset.ctxScopePath || null;
    const ownerSurface = entryPagePath ? runtime.get?.(entryPagePath) : null;
    if (!entryPagePath || ownerSurface?.control?.kind !== 'entry') return;

    const entryPageFieldsPath = `${entryPagePath}.data.fields`;
    let resolveExpressionReady;
    const expressionReady = new Promise((resolve) => {
      resolveExpressionReady = resolve;
    });
    const instance = {
      entryPagePath,
      expression: null,
      expressionReady,
      resolveExpressionReady,
      initialization: null,
      disposed: false,
    };
    instances.set(form, instance);
    instancesByPath.set(entryPagePath, instance);

    const initializationOwner = 'reactive-entry';
    const entryInitialization = window.ManatOS?.entryInitialization?.forForm?.(form) ?? null;
    instance.initialization = entryInitialization;
    entryInitialization?.begin(initializationOwner);
    await entryInitialization?.readyForWork?.();

    const CHANGE_EVENT = 'manatos:ctx-change';
    const reactivePolicy = await import('/shared-runtime/policies/reactive-runtime-policy.js');

    // A document-level entry runtime may outlive its semantic UI surface briefly
    // while outage recovery disposes ctx.ui.level. Once that owner is gone (or is
    // closing/closed/disposed), no queued/global CTX event may evaluate its formulas.
    const entrySurfaceIsLive = () => {
      if (instance?.disposed || !entryPagePath || !runtime?.get) return false;
      const lifecycle = runtime.get(`${entryPagePath}.state.lifecycle`);
      return (
        !['closing', 'closed', 'disposed'].includes(lifecycle) && runtime.get(entryPagePath) != null
      );
    };

    const controlValue = (control) => {
      if (control instanceof HTMLSelectElement && control.value === '') return null;
      if (control instanceof HTMLInputElement && control.type === 'checkbox')
        return control.checked;
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

    const expressionFacade = Object.freeze({
      astForSource,
      loadAstForSource,
      evaluateAst: (ast) => evaluate(ast),
      // Explicit operands are invocation-local values (for example a collection
      // member candidate). They let any canonical entity field reuse the same
      // expression implementation without copying normalization rules into UI metadata.
      evaluateAstWithOperands: (ast, operands = {}) =>
        evaluate(ast, null, { operands: Object.freeze({ ...operands }) }),
      evaluateAstOwned: (ast) => evaluateOwned(ast),
      evaluateAstAt: (ast, scopePath) => evaluate(ast, scopePath || null),
      evaluateAstOwnedAt: (ast, scopePath) => evaluateOwned(ast, scopePath || null),
      currentCtxPath: () => entryPagePath,
      currentCtxNode: () => {
        const path = entryPagePath;
        return path && runtime?.get ? runtime.get(path) : null;
      },
    });
    instance.expression = expressionFacade;
    instance.resolveExpressionReady?.(expressionFacade);

    /*
     * Canonical field metadata is the only source for both calculations and
     * normalization. Presentation wrappers do not duplicate normalization source
     * into DOM attributes. Compile each field normalizer once for this entry
     * runtime, then apply it only when the field write is committed (change/save).
     * Raw input writes still reach CTX while the user is typing so validators and
     * dependent UI can observe the current candidate without rejecting legitimate
     * intermediate values such as partially typed email/telephone numbers.
     */
    const entrySurface = entryPagePath ? runtime?.get?.(entryPagePath) : null;
    const entryEntity = runtime?.entity?.(entrySurface?.control?.entityKey);
    const canonicalFieldDefinitions = entryEntity?.metadata?.fieldDefinition || {};
    const normalizationAstByField = new Map();

    for (const [key, definition] of Object.entries(canonicalFieldDefinitions)) {
      const source = definition?.normalize?.expression;
      if (typeof source !== 'string' || !source.trim()) continue;
      const ast = await loadAstForSource(source);
      if (ast) normalizationAstByField.set(key, ast);
    }

    const normalizedFieldCandidate = (key, value) => {
      const ast = normalizationAstByField.get(key);
      if (!ast || value === null || value === undefined || value === '') return { ok: true, value };
      try {
        return {
          ok: true,
          value: evaluate(ast, null, { operands: Object.freeze({ value }) }),
        };
      } catch (error) {
        return {
          ok: false,
          value,
          error: error instanceof Error ? error.message : 'Invalid value.',
        };
      }
    };

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
    const subscriberDisposers = [];
    const registerEntry = (entry) => {
      reactiveEntries.push(entry);
      const untrack = runtime?.trackSubscriber?.([...entry.dependencyPaths], {
        kind: 'expression',
        label: entry.kind,
      });
      if (typeof untrack === 'function') subscriberDisposers.push(untrack);
    };

    const semanticEqual = (left, right) => {
      const compare = window.ManatOS?.semanticEqual;
      if (typeof compare !== 'function') {
        throw new Error('Canonical semantic equality runtime is unavailable.');
      }
      return compare(left, right);
    };

    const sameReactiveValue = semanticEqual;

    /*
     * Canonical field calculations are discovered from entity metadata, never from
     * whichever presentation container happens to render the field. This keeps
     * summary/read-only/hidden calculated fields semantic and presentation-neutral.
     * Dependencies still come exclusively from the cached canonical AST.
     */
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
            if (!entrySurfaceIsLive()) return false;
            const pagePath = entryPagePath;
            const fieldsPath = entryPageFieldsPath;
            if (!pagePath || !fieldsPath || !runtime?.updateField) return false;
            const valuePath = `${fieldsPath}.${key}.value`;
            const current = runtime.get?.(valuePath);
            if (sameReactiveValue(current, next)) return false;

            runtime.updateField(pagePath, key, next, undefined, {
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
            if (!entrySurfaceIsLive()) return false;
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
            if (!entrySurfaceIsLive()) return false;
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
              if (!entrySurfaceIsLive()) return false;
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
              if (!entrySurfaceIsLive()) return false;
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

              const presenceMarker = container.querySelector('[data-field-presence-marker]');
              if (presenceMarker instanceof HTMLInputElement) presenceMarker.disabled = !editable;

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
      if (!entrySurfaceIsLive()) {
        pendingChanges.length = 0;
        pendingChangeKeys.clear();
        return;
      }
      processingChanges = true;
      let executions = 0;
      try {
        await withOwnedCapabilityPass(async (evaluationPass) => {
          while (pendingChanges.length) {
            if (!entrySurfaceIsLive()) {
              pendingChanges.length = 0;
              pendingChangeKeys.clear();
              return;
            }
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
      if (!entrySurfaceIsLive()) return;
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

    const runAllReactiveEntries = () => {
      if (!entrySurfaceIsLive()) return Promise.resolve();
      return withOwnedCapabilityPass(async (evaluationPass) => {
        // Preserve deterministic metadata order even though some entries may cross
        // an async capability boundary. Dependent CTX writes still re-enter the
        // normal causal event scheduler.
        for (const entry of reactiveEntries) {
          if (!entrySurfaceIsLive()) return;
          await entry.run(undefined, evaluationPass);
        }
      });
    };

    const syncSourceField = (control, eventCause = {}, options = {}) => {
      const key = control?.dataset?.ctxField;
      if (!key) return true;

      const rawValue = controlValue(control);
      const shouldNormalize = options.normalize === true && normalizationAstByField.has(key);
      const normalized = shouldNormalize
        ? normalizedFieldCandidate(key, rawValue)
        : { ok: true, value: rawValue };

      if (!normalized.ok) {
        control.setCustomValidity?.(normalized.error);
      } else {
        control.setCustomValidity?.('');
        if (shouldNormalize && !sameReactiveValue(rawValue, normalized.value)) {
          window.ManatOS?.fieldComponents?.setFieldValue?.(control, normalized.value, {
            emit: false,
          });
        }
      }

      const value = normalized.ok ? normalized.value : rawValue;
      const fieldsPath = entryPageFieldsPath;
      const path = fieldsPath ? `${fieldsPath}.${key}.value` : `fields.${key}.value`;

      const source = shouldNormalize
        ? 'field-normalization'
        : typeof eventCause.source === 'string' && eventCause.source
          ? eventCause.source
          : 'form-field';
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

      runtime.updateField(entryPagePath, key, value, undefined, cause);
      return normalized.ok;
    };

    const fieldKeyFromCtxPath = (path) => {
      if (!entryPageFieldsPath || typeof path !== 'string') return null;
      const prefix = `${entryPageFieldsPath}.`;
      if (!path.startsWith(prefix)) return null;
      const remainder = path.slice(prefix.length);
      const separator = remainder.indexOf('.');
      return separator > 0 ? remainder.slice(0, separator) : null;
    };

    const projectFieldFromCtx = (key) => {
      if (!form || !entryPageFieldsPath || !key) return;
      const field = runtime?.get?.(`${entryPageFieldsPath}.${key}`);
      if (!field || typeof field !== 'object') return;
      const escaped = globalThis.CSS?.escape ? CSS.escape(key) : key.replace(/"/g, '\\"');
      const control = form.querySelector(`[data-ctx-field="${escaped}"]`);
      if (control) {
        window.ManatOS?.fieldComponents?.setFieldValue?.(control, field.value, { emit: false });
      }
      form.querySelectorAll(`[data-v2-summary-field-key="${escaped}"]`).forEach((host) => {
        if (!(host instanceof HTMLElement)) return;
        const element = host.querySelector('[data-v2-summary-dynamic-value]');
        if (!(element instanceof HTMLElement)) return;

        let initialValue;
        try {
          initialValue = JSON.parse(host.dataset.v2SummaryRawValue || 'null');
        } catch {
          initialValue = undefined;
        }
        if (semanticEqual(initialValue, field.value)) return;

        const fieldType = host.dataset.v2SummaryFieldType || '';
        const representation = host.dataset.v2SummaryRepresentation || 'summary';
        const empty = field.value == null || field.value === '';
        if (empty) {
          element.textContent = '—';
          return;
        }
        if (fieldType === 'duration' && typeof field.value === 'object') {
          const parts = [
            ['year', Number(field.value.years || 0)],
            ['month', Number(field.value.months || 0)],
            ['day', Number(field.value.days || 0)],
          ]
            .filter(([, amount]) => amount > 0)
            .map(([unit, amount]) => `${amount} ${unit}${amount === 1 ? '' : 's'}`);
          element.textContent = parts.length ? parts.join(', ') : '0 days';
          return;
        }
        if (fieldType === 'datetime') {
          const parsed = new Date(String(field.value));
          element.textContent = Number.isNaN(parsed.getTime())
            ? String(field.value)
            : parsed.toLocaleString();
          return;
        }
        if (representation !== 'period') element.textContent = String(field.value);
      });
      form
        .querySelectorAll(`[data-field-input-action="revert"][data-field-key="${escaped}"]`)
        .forEach((action) => {
          if (!(action instanceof HTMLButtonElement)) return;
          const canRevert = field.dirty === true && !action.closest('.is-readonly');
          action.disabled = !canRevert;
          action.setAttribute('aria-disabled', String(!canRevert));
        });
    };

    const projectCtxFieldChange = (change) => {
      const paths = [
        change?.path,
        ...(Array.isArray(change?.relatedPaths) ? change.relatedPaths : []),
      ];
      const keys = new Set(paths.map(fieldKeyFromCtxPath).filter(Boolean));
      keys.forEach(projectFieldFromCtx);
    };

    const react = (event) => {
      const control =
        event.target instanceof Element ? event.target.closest('[data-ctx-field]') : null;
      if (control)
        syncSourceField(control, event.manatosCause || {}, { normalize: event.type === 'change' });
    };

    // DOM controls only adapt user input into CTX. Formula-to-form reactivity is
    // entirely driven by CTX value paths discovered from AST dependencies.
    const untrackScheduler = runtime?.trackSubscriber?.('*', {
      kind: 'scheduler',
      label: 'Reactive expression scheduler',
    });
    if (typeof untrackScheduler === 'function') subscriberDisposers.push(untrackScheduler);
    const onCtxChange = (event) => {
      if (!entrySurfaceIsLive()) return;
      const change = event?.detail || {};
      projectCtxFieldChange(change);
      enqueueChange(change);
    };
    window.addEventListener(CHANGE_EVENT, onCtxChange);

    const disposeReactiveRuntime = (event) => {
      const disposingPath = String(event?.detail?.path || '');
      if (disposingPath !== entryPagePath) return;
      instance.disposed = true;
      window.removeEventListener(CHANGE_EVENT, onCtxChange);
      window.removeEventListener('manatos:ui-level-disposing', disposeReactiveRuntime);
      pendingChanges.length = 0;
      pendingChangeKeys.clear();
      subscriberDisposers.splice(0).forEach((dispose) => dispose());
      if (instancesByPath.get(entryPagePath) === instance) instancesByPath.delete(entryPagePath);
    };
    window.addEventListener('manatos:ui-level-disposing', disposeReactiveRuntime);

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

    form.addEventListener(
      'submit',
      (event) => {
        let valid = true;
        for (const control of form.querySelectorAll('[data-ctx-field]')) {
          const key = control?.dataset?.ctxField;
          if (!key || !normalizationAstByField.has(key)) continue;
          if (
            !syncSourceField(
              control,
              { source: 'field-normalization', triggerField: key },
              { normalize: true },
            )
          )
            valid = false;
        }
        if (valid && form.reportValidity()) return;
        event.preventDefault();
        event.stopImmediatePropagation();
      },
      true,
    );
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
    form.addEventListener('input', react);
    form.addEventListener('change', react);
    queueMicrotask(async () => {
      if (!entrySurfaceIsLive()) {
        entryInitialization?.end(initializationOwner);
        return;
      }
      if (entryPageFieldsPath) {
        const fields = runtime?.get?.(entryPageFieldsPath);
        if (fields && typeof fields === 'object') Object.keys(fields).forEach(projectFieldFromCtx);
      }

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
        const invocationValue = Object.prototype.hasOwnProperty.call(valueRule, 'fixed')
          ? valueRule.fixed
          : valueRule.default;
        runtime.updateField(entryPagePath, key, invocationValue, undefined, {
          source: 'entry-invocation',
          triggerPath: `${entryPagePath}.control.invocation.rules.values.${key}`,
        });
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
  };

  const install = (form) => {
    if (!(form instanceof HTMLFormElement) || instances.has(form)) return true;
    void installAsync(form).catch((error) => {
      const failed = instances.get(form);
      if (failed?.entryPagePath && instancesByPath.get(failed.entryPagePath) === failed)
        instancesByPath.delete(failed.entryPagePath);
      failed?.initialization?.end?.('reactive-entry');
      failed?.resolveExpressionReady?.(null);
      instances.delete(form);
      console.error('[ManatOS reactive entry runtime]', error);
    });
    return true;
  };

  window.ManatOS.expressionRuntimes = Object.freeze({
    forForm: (form) => instances.get(form)?.expression || null,
    forPath: (path) => instancesByPath.get(String(path || ''))?.expression || null,
    whenReady: (form) => instances.get(form)?.expressionReady || Promise.resolve(null),
  });
  surfaceRuntime.register('reactive-entry-form', install);
}
