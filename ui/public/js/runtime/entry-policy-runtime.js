(() => {
  'use strict';

  const form = document.querySelector('form[data-v2-entry-form]');
  if (!(form instanceof HTMLFormElement)) return;

  const ctx = window.ManatOS?.ctx;
  let expressions = window.ManatOS?.expression ?? null;
  let expressionCompiler = null;
  let fieldPolicy = null;
  if (!ctx) return;

  const leafPath = () => {
    let node = ctx.value?.ui?.level;
    if (!node) return null;
    let path = 'ctx.ui.level';
    while (node?.level) {
      node = node.level;
      path += '.level';
    }
    return path;
  };

  const path = leafPath();
  if (!path) return;
  const surface = ctx.get(path);
  if (!surface || surface.kind !== 'entry') return;

  const entity = Object.values(ctx.value?.entities || {}).find(
    (candidate) => candidate?.key === surface.entityKey,
  );
  const metadata = entity?.metadata;
  const uiMetadata = entity?.uiMetadata;
  if (!metadata || !uiMetadata) return;

  const controlFor = (key) => {
    const escaped = globalThis.CSS?.escape ? CSS.escape(key) : String(key).replace(/"/g, '\\"');
    return form.querySelector(`[data-ctx-field="${escaped}"]`);
  };

  const setField = (key, value, action) => {
    const control = controlFor(key);
    if (control) {
      window.ManatOSFieldComponents?.setFieldValue?.(control, value, { emit: true });
      return;
    }
    const fieldPath = `${path}.fields.${key}.value`;
    ctx.replace?.(fieldPath, value, {
      source: 'entry-policy-runtime',
      action,
      triggerPath: fieldPath,
    });
  };

  const evaluate = async (declaration, fallback = undefined) => {
    if (
      !declaration ||
      typeof declaration !== 'object' ||
      typeof declaration.expression !== 'string'
    )
      return declaration ?? fallback;
    try {
      const ast = expressionCompiler?.ast(declaration.expression);
      return ast ? await expressions.evaluateAstOwnedAt(ast, path) : fallback;
    } catch (error) {
      console.error('[ManatOS entry policy expression]', error);
      return fallback;
    }
  };

  const applyCreateDefaults = async () => {
    if (surface.mode !== 'create') return;
    const fields = Object.values(metadata.fieldDefinition || {}).sort(
      (left, right) => Number(left?.order || 0) - Number(right?.order || 0),
    );
    for (const field of fields) {
      const key = field?.key;
      if (!key) continue;
      const override = uiMetadata.record?.fieldOverrides?.[key];
      if (!override || !Object.prototype.hasOwnProperty.call(override, 'createDefaultValue'))
        continue;
      const current = ctx.get(`${path}.fields.${key}.value`);
      if (!fieldPolicy.isEmptyEntryFieldValue(current)) continue;
      const value = await evaluate(override.createDefaultValue, null);
      setField(key, value, 'metadata-default');
    }
  };

  const reconcileInvocationRestrictions = () => {
    if (surface.mode !== 'create') return;
    for (const [key, restriction] of Object.entries(surface.invocation?.uiOverrides || {})) {
      const field = metadata.fieldDefinition?.[key];
      if (field?.type !== 'enum' || !restriction || typeof restriction !== 'object') continue;
      const allowed = fieldPolicy.allowedInvocationOptionValues(field, restriction);
      if (!allowed) continue;
      const current = ctx.get(`${path}.fields.${key}.value`);
      const next = fieldPolicy.reconcileRestrictedOptionValue(current, allowed);
      if (Object.is(next, current)) continue;
      setField(key, next, 'invocation-option-restriction');
    }
  };

  const applyStaticFieldPolicy = () => {
    for (const [key, field] of Object.entries(metadata.fieldDefinition || {})) {
      if (!field || typeof field !== 'object' || field.sensitive === true) continue;
      const escaped = globalThis.CSS?.escape ? CSS.escape(key) : String(key).replace(/"/g, '\\"');
      const container = form.querySelector(`[data-ctx-field-container="${escaped}"]`);
      if (!(container instanceof HTMLElement)) continue;

      const override = uiMetadata.record?.fieldOverrides?.[key] || {};
      const { visible, editable } = fieldPolicy.staticEntryFieldUx(
        surface.mode,
        field.readOnly === true,
        override,
      );

      container.hidden = !visible;
      container.classList.toggle('effective-field-editable', editable);
      container.classList.toggle('effective-field-readonly', !editable);

      container.querySelectorAll('[data-ctx-field]').forEach((control) => {
        if (control instanceof HTMLInputElement && control.type !== 'checkbox')
          control.readOnly = !editable;
        else if (
          control instanceof HTMLInputElement ||
          control instanceof HTMLSelectElement ||
          control instanceof HTMLTextAreaElement ||
          control instanceof HTMLButtonElement
        )
          control.disabled = !editable;
      });

      if (ctx.replace) {
        ctx.replace(`${path}.fields.${key}.ux.visible`, visible, {
          source: 'entry-policy-runtime',
        });
        ctx.replace(`${path}.fields.${key}.ux.enabled`, editable, {
          source: 'entry-policy-runtime',
        });
        ctx.replace(`${path}.fields.${key}.ux.readonly`, !editable, {
          source: 'entry-policy-runtime',
        });
      }
    }
  };

  const refreshSummaryPresentation = async () => {
    const hosts = [...form.querySelectorAll('[data-v2-summary-presentation]')];
    for (const host of hosts) {
      if (!(host instanceof HTMLElement)) continue;
      let tone = null;
      let icon = null;
      try {
        const source = host.dataset.v2SummaryToneExpression || '';
        const ast = source ? expressionCompiler.ast(source) : null;
        if (ast) tone = await expressions.evaluateAstOwnedAt(ast, path);
      } catch (error) {
        console.error('[ManatOS summary tone expression]', error);
      }
      try {
        const source = host.dataset.v2SummaryIconExpression || '';
        const ast = source ? expressionCompiler.ast(source) : null;
        if (ast) icon = await expressions.evaluateAstOwnedAt(ast, path);
      } catch (error) {
        console.error('[ManatOS summary icon expression]', error);
      }

      const value = host.querySelector('[data-v2-summary-dynamic-value]');
      if (!(value instanceof HTMLElement)) continue;
      value.classList.remove('status-value', 'status-positive', 'status-neutral');
      [...value.classList]
        .filter((name) => name.startsWith('text-bg-'))
        .forEach((name) => value.classList.remove(name));
      value.classList.toggle('badge', Boolean(tone) && !icon);
      if (tone && !icon) value.classList.add(`text-bg-${String(tone)}`);
      if (icon) {
        value.classList.add(
          'status-value',
          tone === 'success' ? 'status-positive' : 'status-neutral',
        );
        let iconElement = value.querySelector('[data-v2-summary-dynamic-icon]');
        if (!(iconElement instanceof HTMLElement)) {
          iconElement = document.createElement('i');
          iconElement.dataset.v2SummaryDynamicIcon = '';
          iconElement.setAttribute('aria-hidden', 'true');
          value.prepend(iconElement);
        }
        iconElement.className = `bi bi-${String(icon)} me-1`;
      } else {
        value.querySelector('[data-v2-summary-dynamic-icon]')?.remove();
      }
    }
  };

  const parseDataJson = (value, fallback = null) => {
    try {
      return JSON.parse(value || 'null') ?? fallback;
    } catch {
      return fallback;
    }
  };

  /**
   * Evaluate detached related-row calculations/presentation entirely in the
   * browser. The row itself is a factual read model; portable expression source
   * is compiled once by the shared browser compiler and cached per execution host.
   */
  const refreshRelatedCollectionPresentation = async () => {
    const hosts = [...form.querySelectorAll('[data-v2-related-value]')];
    for (const host of hosts) {
      if (!(host instanceof HTMLElement)) continue;
      const rowHost = host.closest('[data-v2-related-row]');
      if (!(rowHost instanceof HTMLElement)) continue;

      const row = parseDataJson(rowHost.dataset.v2RelatedRow, {});
      const scopeKeys = parseDataJson(rowHost.dataset.v2RelatedScopeKeys, []);
      const scope = Object.fromEntries(
        (Array.isArray(scopeKeys) ? scopeKeys : []).map((key) => [String(key), null]),
      );
      Object.assign(scope, row && typeof row === 'object' ? row : {});

      const valueSource = host.dataset.v2RelatedValueExpression || '';
      const toneSource = host.dataset.v2RelatedToneExpression || '';
      const iconSource = host.dataset.v2RelatedIconExpression || '';
      const valueAst = valueSource ? expressionCompiler.ast(valueSource) : null;
      const toneAst = toneSource ? expressionCompiler.ast(toneSource) : null;
      const iconAst = iconSource ? expressionCompiler.ast(iconSource) : null;
      const sourceField = host.dataset.v2RelatedSourceField || host.dataset.v2RelatedFieldKey || '';
      let raw = sourceField ? scope[sourceField] : undefined;
      let tone = null;
      let icon = null;

      try {
        if (valueAst) raw = await expressions.evaluateAstOwnedWithScope(valueAst, scope);
      } catch (error) {
        console.error('[ManatOS related collection value expression]', error);
      }
      try {
        if (toneAst) tone = await expressions.evaluateAstOwnedWithScope(toneAst, scope);
      } catch (error) {
        console.error('[ManatOS related collection tone expression]', error);
      }
      try {
        if (iconAst) icon = await expressions.evaluateAstOwnedWithScope(iconAst, scope);
      } catch (error) {
        console.error('[ManatOS related collection icon expression]', error);
      }

      const output = host.querySelector('[data-v2-related-dynamic-value]');
      if (!(output instanceof HTMLElement)) continue;
      const emptyText = host.dataset.v2RelatedEmptyText || '—';
      const fieldType = host.dataset.v2RelatedFieldType || 'string';
      const optionItems = parseDataJson(host.dataset.v2RelatedOptionItems, []);
      const selectedOption = (Array.isArray(optionItems) ? optionItems : []).find(
        (candidate) => String(candidate?.value ?? '') === String(raw ?? ''),
      );

      let label = raw === null || raw === undefined || raw === '' ? emptyText : String(raw);
      if (selectedOption) label = String(selectedOption.label ?? selectedOption.value ?? label);
      if (fieldType === 'boolean') label = raw ? 'Enabled' : 'Disabled';
      if (fieldType === 'reference' && raw !== null && raw !== undefined && raw !== '') {
        const references = ctx.get(`${path}.resources.relatedReferenceData`) || {};
        const sourceKey = host.dataset.v2RelatedSourceKey || '';
        const fieldKey = host.dataset.v2RelatedFieldKey || '';
        const match = (references?.[sourceKey]?.[fieldKey] || []).find(
          (candidate) => String(candidate?.id ?? candidate?.value ?? '') === String(raw),
        );
        label = String(match?.name ?? match?.label ?? raw);
      }

      output.replaceChildren();
      output.className = '';
      const resolvedTone = tone ?? selectedOption?.tone ?? null;
      const resolvedIcon = icon ?? selectedOption?.icon ?? null;
      if (resolvedTone || resolvedIcon) {
        output.classList.add('badge', `text-bg-${String(resolvedTone || 'secondary')}`);
        if (resolvedIcon) {
          const iconElement = document.createElement('i');
          iconElement.className = `bi bi-${String(resolvedIcon)} me-1`;
          iconElement.setAttribute('aria-hidden', 'true');
          output.append(iconElement);
        }
      }
      output.append(document.createTextNode(label));
    }
  };

  /**
   * Resolve metadata component bindings from portable expression source against
   * the owning V2 entry scope. Components receive the resulting values through their
   * stable host dataset/event contract; EJS never executes binding expressions.
   */
  const refreshMetadataComponentBindings = async () => {
    const hosts = [...form.querySelectorAll('[data-metadata-component]')];
    for (const host of hosts) {
      if (!(host instanceof HTMLElement)) continue;
      const bindings = parseDataJson(host.dataset.metadataComponentBindings, {});
      const bindingExpressions = parseDataJson(
        host.dataset.metadataComponentBindingExpressions,
        {},
      );
      const resolved = bindings && typeof bindings === 'object' ? { ...bindings } : {};
      const ownerPath = host.dataset.ctxScopePath || path;

      for (const [bindingKey, source] of Object.entries(bindingExpressions || {})) {
        if (typeof source !== 'string' || !source) continue;
        try {
          const ast = expressionCompiler.ast(source);
          resolved[bindingKey] = await expressions.evaluateAstOwnedAt(ast, ownerPath);
        } catch (error) {
          console.error('[ManatOS metadata component binding expression]', error);
          delete resolved[bindingKey];
        }
      }

      host.dataset.metadataComponentBindings = JSON.stringify(resolved);

      // Contextual-help is a generic keyed presentation component. Its visible
      // item follows the declarative selectedKey binding rather than provider-
      // specific imperative code.
      const contextualHelp = host.querySelector('[data-contextual-help]');
      if (contextualHelp instanceof HTMLElement) {
        const selectedKey = String(resolved.selectedKey ?? '');
        contextualHelp.dataset.contextualHelpSelectedKey = selectedKey;
        contextualHelp.querySelectorAll('[data-contextual-help-key]').forEach((panel) => {
          if (panel instanceof HTMLElement)
            panel.hidden = panel.dataset.contextualHelpKey !== selectedKey;
        });
      }

      host.dispatchEvent(
        new CustomEvent('manatos:metadata-component-bindings', {
          bubbles: false,
          detail: { bindings: resolved },
        }),
      );
    }
  };

  /** Apply declarative entry-action visibility/enabled policy against the live entry CTX. */
  const refreshEntryActions = async () => {
    const actions = uiMetadata.record?.entryActions || {};
    for (const host of form.querySelectorAll('[data-v2-entry-action]')) {
      if (!(host instanceof HTMLElement)) continue;
      const key = host.dataset.v2EntryAction || '';
      const action = actions[key];
      if (!action) continue;

      const visible = (await evaluate(action.visible, true)) !== false;
      const enabled = (await evaluate(action.enabled, true)) !== false;
      const disabledReason = await evaluate(action.disabledReason, null);
      host.hidden = !visible;
      host.querySelectorAll('button, input, select, textarea').forEach((control) => {
        if ('disabled' in control && key !== 'save') control.disabled = !enabled;
      });
      if (host instanceof HTMLButtonElement) host.disabled = !enabled;
      if (disabledReason) host.title = String(disabledReason);
      else host.removeAttribute('title');
    }
  };

  /**
   * Compose developer-only Debugging into the live V2 tab set in the browser.
   * The server may capability-gate delivery of the inert template, but it no
   * longer mutates entity UI metadata or authors an effective Debugging tab.
   */
  const installDeveloperDebuggingTab = () => {
    const template = form.querySelector('[data-v2-developer-debugging-tab-template]');
    if (!(template instanceof HTMLTemplateElement)) return;

    const nav = form.querySelector('.entity-tabs');
    const content = form.querySelector('.entity-tab-content');
    if (!(nav instanceof HTMLElement) || !(content instanceof HTMLElement)) return;

    if (!nav.querySelector('[data-v2-tab-id="debugging"]')) {
      const navItem = template.content.querySelector('[data-v2-developer-debugging-nav]');
      if (navItem) nav.append(navItem.cloneNode(true));
    }
    if (!content.querySelector('#metadata-debugging-pane')) {
      const pane = template.content.querySelector('[data-v2-developer-debugging-pane]');
      if (pane) content.append(pane.cloneNode(true));
    }

    template.remove();
  };

  const activateRequestedTab = () => {
    const visibleButtons = [...document.querySelectorAll('.entity-tabs [data-v2-tab-id]')].filter(
      (candidate) =>
        candidate instanceof HTMLButtonElement && !candidate.closest('.nav-item')?.hidden,
    );
    if (!visibleButtons.length) return;

    const requested = surface.state?.navigation?.activeTabId;
    const target =
      visibleButtons.find((button) => button.dataset.v2TabId === requested) || visibleButtons[0];
    if (!(target instanceof HTMLButtonElement)) return;
    if (!target.classList.contains('active')) target.click();
  };

  const refreshTabVisibility = async () => {
    const buttons = [...document.querySelectorAll('.entity-tabs [data-v2-tab-id]')];
    for (const button of buttons) {
      if (!(button instanceof HTMLButtonElement)) continue;
      let visible = button.dataset.v2TabStaticVisible !== 'false';
      let ast = null;
      const source = button.dataset.v2TabVisibleExpression || '';
      if (source) {
        try {
          const compiler = await window.ManatOS?.expressionCompilerReady;
          ast = compiler?.ast(source) ?? null;
        } catch (error) {
          console.error('[ManatOS tab visibility expression compile]', error);
        }
      }
      if (ast) {
        try {
          visible = (await expressions.evaluateAstOwnedAt(ast, path)) !== false;
        } catch {
          visible = true;
        }
      }
      const item = button.closest('.nav-item');
      if (item instanceof HTMLElement) item.hidden = !visible;
      const pane = document.querySelector(button.dataset.bsTarget || '');
      if (pane instanceof HTMLElement) pane.hidden = !visible;
    }

    activateRequestedTab();
  };

  (async () => {
    const [compiler, evaluator, policyModule] = await Promise.all([
      window.ManatOS?.expressionCompilerReady,
      window.ManatOS?.expressionRuntimeReady,
      import('/shared-runtime/entry-field-policy.js'),
    ]);
    expressionCompiler = compiler ?? null;
    expressions = evaluator ?? window.ManatOS?.expression ?? null;
    fieldPolicy = policyModule ?? null;
    if (!expressionCompiler || !expressions || !fieldPolicy) return;

    installDeveloperDebuggingTab();
    applyStaticFieldPolicy();
    await applyCreateDefaults();
    reconcileInvocationRestrictions();
    await refreshTabVisibility();
    await refreshEntryActions();
    await refreshSummaryPresentation();
    await refreshRelatedCollectionPresentation();
    await refreshMetadataComponentBindings();
    ctx.trackSubscriber?.('*', { kind: 'runtime', label: 'Entry policy' });
    window.addEventListener('manatos:ctx-change', () => {
      void refreshTabVisibility();
      void refreshEntryActions();
      void refreshSummaryPresentation();
      void refreshRelatedCollectionPresentation();
      void refreshMetadataComponentBindings();
    });
  })();
})();
