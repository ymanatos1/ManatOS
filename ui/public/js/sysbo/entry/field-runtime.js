/**
 * Progressive enhancement for canonical metadata-driven entity fields.
 *
 * Components never write CTX directly. Mutating actions update the native
 * backing control and emit normal input/change events; read-only controls keep
 * their component menu for non-mutating inspection/copy actions.
 */
(() => {
  const pad = (value) => String(value).padStart(2, '0');
  const localDate = (date) =>
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const localDateTime = (date, midnight = false) => {
    const hours = midnight ? 0 : date.getHours();
    const minutes = midnight ? 0 : date.getMinutes();
    return `${localDate(date)}T${pad(hours)}:${pad(minutes)}`;
  };

  /**
   * Publish a native field mutation with optional causal provenance. Consumers
   * can distinguish a direct/user-authoritative change from a dependent write
   * without introducing component-local recursion guards.
   */
  const publish = (control, focus = true, cause = {}) => {
    const dispatch = (type) => {
      const event = new Event(type, { bubbles: true });
      Object.defineProperty(event, 'manatosCause', {
        value: { ...cause },
        enumerable: false,
      });
      control.dispatchEvent(event);
    };
    dispatch('input');
    dispatch('change');
    // Enhanced enum/reference controls keep a native backing select for form/CTX
    // semantics, but that select is intentionally aria-hidden and non-tabbable.
    // Never move focus into a hidden backing control: doing so leaves focus inside
    // an aria-hidden subtree when the rich dropdown closes and triggers browser
    // accessibility warnings. Visible component controls own user focus.
    const focusableBackingControl =
      control.getAttribute?.('aria-hidden') !== 'true' &&
      !control.classList?.contains('visually-hidden') &&
      control.tabIndex >= 0;
    if (
      focus &&
      focusableBackingControl &&
      typeof control.focus === 'function' &&
      !control.disabled &&
      control.type !== 'hidden'
    )
      control.focus();
  };

  const pictureRuntime = window.ManatOS?.pictureFieldRuntime?.install?.({ publish });
  const owningEntryPath =
    pictureRuntime?.owningEntryPath ||
    ((element) =>
      element?.closest?.('[data-ctx-page-path]')?.getAttribute?.('data-ctx-page-path') || null);

  const isReadOnly = (control) =>
    control.disabled || (control instanceof HTMLInputElement && control.readOnly);

  const parseDuration = (value) => {
    if (!value) return null;
    if (typeof value === 'object' && !Array.isArray(value)) return value;
    try {
      const parsed = JSON.parse(String(value));
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  };

  const normalizedDuration = (value) => {
    const source = parseDuration(value) || {};
    const part = (key) => {
      const parsed = Number(source[key] ?? 0);
      return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : 0;
    };
    return { years: part('years'), months: part('months'), days: part('days') };
  };

  const durationIsEmpty = (root) =>
    [...root.querySelectorAll('[data-duration-part]')].every(
      (control) => !String(control.value ?? '').trim(),
    );

  const durationValue = (root) => {
    if (!(root instanceof Element)) return null;
    if (durationIsEmpty(root)) return null;
    const output = { years: 0, months: 0, days: 0 };
    root.querySelectorAll('[data-duration-part]').forEach((control) => {
      if (!(control instanceof HTMLInputElement)) return;
      const key = control.dataset.durationPart;
      if (!key || !(key in output)) return;
      const numeric = Number(control.value || 0);
      output[key] = Number.isFinite(numeric) && numeric >= 0 ? Math.trunc(numeric) : 0;
    });
    return output;
  };

  const formatDuration = (value) => {
    const duration = parseDuration(value);
    if (!duration) return '';
    const normalized = normalizedDuration(duration);
    const parts = [
      ['year', normalized.years],
      ['month', normalized.months],
      ['day', normalized.days],
    ]
      .filter(([, count]) => count > 0)
      .map(([unit, count]) => `${count} ${unit}${count === 1 ? '' : 's'}`);
    return parts.length ? parts.join(', ') : '0 days';
  };

  /**
   * Update one duration editor as a single canonical field value. Visible unit
   * inputs are kept in sync with the hidden structured field consumed by CTX.
   */
  const setDurationValue = (root, value, { emit = true, cause = {} } = {}) => {
    if (!(root instanceof Element)) return;
    const canonical = root.querySelector('[data-duration-canonical-value]');
    if (!(canonical instanceof HTMLInputElement)) return;
    const duration = value == null ? null : normalizedDuration(value);

    root.querySelectorAll('[data-duration-part]').forEach((control) => {
      if (!(control instanceof HTMLInputElement)) return;
      const key = control.dataset.durationPart;
      if (!key) return;
      control.value = duration == null ? '' : String(duration[key] ?? 0);
    });
    canonical.value = duration == null ? '' : JSON.stringify(duration);
    if (emit) publish(canonical, false, cause);
  };

  const syncDurationFromParts = (partControl) => {
    const durationRoot = partControl.closest('[data-duration-field]');
    if (!durationRoot) return;
    const canonical = durationRoot.querySelector('[data-duration-canonical-value]');
    if (!(canonical instanceof HTMLInputElement)) return;
    const value = durationValue(durationRoot);
    canonical.value = value == null ? '' : JSON.stringify(value);
    publish(canonical, false);
  };

  document.addEventListener('input', (event) => {
    const part =
      event.target instanceof Element ? event.target.closest('[data-duration-part]') : null;
    if (part instanceof HTMLInputElement) syncDurationFromParts(part);

    const versionPart =
      event.target instanceof Element ? event.target.closest('[data-version-part]') : null;
    if (versionPart instanceof HTMLInputElement) {
      const root = versionPart.closest('[data-version-field]');
      const canonical = root?.querySelector('[data-version-canonical-value]');
      if (root && canonical instanceof HTMLInputElement) {
        const parts = [...root.querySelectorAll('[data-version-part]')];
        const allEmpty = parts.every((control) => !String(control.value ?? '').trim());
        canonical.value = allEmpty
          ? ''
          : parts
              .map((control) => {
                const numeric = Number(control.value || 0);
                return String(Number.isFinite(numeric) && numeric >= 0 ? Math.trunc(numeric) : 0);
              })
              .join('.');
        publish(canonical, false);
      }
    }
  });

  const controlValue = (control, root) => {
    if (root?.matches('[data-enhanced-field-input][data-field-component="duration"]')) {
      return formatDuration(control.value);
    }
    if (control instanceof HTMLInputElement && control.type === 'checkbox')
      return control.checked ? 'true' : 'false';
    if (control instanceof HTMLSelectElement)
      return control.selectedOptions[0]?.textContent?.trim() || control.value;
    return control.value;
  };

  const referenceOptionIcons = (option) => {
    if (!(option instanceof HTMLOptionElement)) return [];
    try {
      const parsed = JSON.parse(option.dataset.entryIcons || '[]');
      return Array.isArray(parsed) ? parsed.filter((icon) => typeof icon === 'string' && icon) : [];
    } catch {
      return [];
    }
  };

  const renderReferenceSelection = (selected, control) => {
    if (!(selected instanceof Element) || !(control instanceof HTMLSelectElement)) return;
    const option =
      [...control.options].find((candidate) => candidate.value === control.value) || null;
    const name = option?.dataset.entryName || option?.textContent?.trim() || '';
    const icons = referenceOptionIcons(option);

    selected.replaceChildren();
    if (icons.length) {
      const iconGroup = document.createElement('span');
      iconGroup.className = 'metadata-entry-icons me-1';
      iconGroup.setAttribute('aria-hidden', 'true');
      icons.forEach((icon, index) => {
        const element = document.createElement('i');
        element.className = `bi bi-${String(icon).replace(/^bi-/, '')} metadata-entry-icon metadata-entry-icon-${index}`;
        iconGroup.append(element);
      });
      selected.append(iconGroup);
    }

    if (name) selected.append(document.createTextNode(name));
    else selected.append(document.createTextNode(control.required ? 'Choose...' : 'None'));
  };

  const setReferenceValue = (control, value) => {
    if (!(control instanceof HTMLSelectElement)) return;
    control.value = value == null ? '' : String(value);
    const root = control.closest('[data-metadata-reference-select]');
    if (!root) return;
    const choice = [...root.querySelectorAll('[data-reference-choice]')].find(
      (candidate) =>
        candidate instanceof HTMLButtonElement &&
        String(candidate.dataset.referenceChoice || '') === control.value,
    );
    root.querySelectorAll('[data-reference-choice]').forEach((candidate) => {
      const isSelected = candidate === choice;
      candidate.classList.toggle('active', isSelected);
      candidate.setAttribute('aria-selected', String(isSelected));
    });
    const toggle = root.querySelector('[data-reference-toggle]');
    if (toggle instanceof HTMLButtonElement) toggle.disabled = control.disabled;
    const selected = root.querySelector('[data-reference-selected]');
    if (selected) renderReferenceSelection(selected, control);
    root.querySelectorAll('[data-field-action-requires-value="true"]').forEach((action) => {
      if (!(action instanceof HTMLButtonElement)) return;
      action.disabled = !control.value;
      action.setAttribute('aria-disabled', String(!control.value));
    });
  };

  const enumToneClasses = (item) => {
    const tone = item?.tone;
    if (!tone) return [];
    if (tone === 'danger' && item?.toneStrength === 'soft') return ['text-danger', 'opacity-75'];
    if (tone === 'danger' && item?.toneStrength === 'strong') return ['text-danger-emphasis'];
    if (tone === 'warning') return ['text-warning-emphasis'];
    return [`text-${tone}`];
  };

  const setEnumValue = (control, value) => {
    if (!(control instanceof HTMLSelectElement)) return;
    control.value = value == null ? '' : String(value);
    const root = control.closest('[data-metadata-enum-select]');
    if (!root) return;
    const choice = [...root.querySelectorAll('[data-enum-choice]')].find(
      (candidate) =>
        candidate instanceof HTMLButtonElement &&
        String(candidate.dataset.enumChoice || '') === control.value,
    );
    root.querySelectorAll('[data-enum-choice]').forEach((candidate) => {
      const selected = candidate === choice;
      candidate.classList.toggle('active', selected);
      candidate.setAttribute('aria-selected', String(selected));
    });
    const label = root.querySelector('[data-enum-selected-label]');
    const icon = root.querySelector('[data-enum-selected-icon]');
    const selectedOption = control.selectedOptions[0];
    let item = null;
    try {
      item = selectedOption?.dataset.enumItem ? JSON.parse(selectedOption.dataset.enumItem) : null;
    } catch {
      item = null;
    }
    if (label) label.textContent = item?.label || item?.value || 'Choose...';
    if (icon instanceof HTMLElement) {
      icon.className = item?.icon ? `bi bi-${item.icon}` : 'bi d-none';
      if (item?.icon) enumToneClasses(item).forEach((className) => icon.classList.add(className));
    }
    const toggle = root.querySelector('[data-metadata-enum-toggle]');
    if (toggle instanceof HTMLButtonElement) toggle.disabled = control.disabled;
  };

  /**
   * Programmatic value binding used by the evaluator/runtime. Presentation
   * knowledge remains inside field-components: callers supply only the native
   * canonical control and its newly resolved value.
   */
  /**
   * Return canonical option metadata for the current field value when the
   * concrete field type exposes such semantics. Evaluator/CTX runtimes may use
   * this without knowing how enum controls store or present their options.
   */
  const applyStringLengthValidity = (control) => {
    if (!(control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement)) return;
    const value = String(control.value ?? '');
    const minLengthAttribute = control.getAttribute('minlength');
    const maxLengthAttribute = control.getAttribute('maxlength');
    const minLength = minLengthAttribute === null ? null : Number(minLengthAttribute);
    const maxLength = maxLengthAttribute === null ? null : Number(maxLengthAttribute);
    let message = '';
    if (
      value.length > 0 &&
      minLength !== null &&
      Number.isFinite(minLength) &&
      minLength >= 0 &&
      value.length < minLength
    ) {
      message = `Enter at least ${minLength} characters.`;
    } else if (
      maxLength !== null &&
      Number.isFinite(maxLength) &&
      maxLength >= 0 &&
      value.length > maxLength
    ) {
      message = `Enter no more than ${maxLength} characters.`;
    }
    control.setCustomValidity(message);
  };

  const setFieldValue = (control, value, { emit = false, cause = {} } = {}) => {
    if (!(
      control instanceof HTMLInputElement ||
      control instanceof HTMLSelectElement ||
      control instanceof HTMLTextAreaElement
    ))
      return;
    const root = control.closest('[data-enhanced-field-input]');
    const component = root?.dataset.fieldComponent;
    if (component === 'duration') {
      setDurationValue(root, value, { emit, cause });
      return;
    }
    if (component === 'reference') setReferenceValue(control, value);
    else if (component === 'enum') setEnumValue(control, value);
    else if (control instanceof HTMLInputElement && control.type === 'checkbox')
      control.checked = Boolean(value);
    else if (control instanceof HTMLInputElement && control.dataset.ctxValueType === 'json')
      control.value = value == null ? '' : JSON.stringify(value);
    else control.value = value == null ? '' : String(value);
    applyStringLengthValidity(control);
    if (emit) publish(control, false, cause);
  };

  document.addEventListener('input', (event) => {
    const control =
      event.target instanceof Element ? event.target.closest('[data-field-control]') : null;
    if (!(control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement)) return;
    queueMicrotask(() => applyStringLengthValidity(control));
  });

  document.querySelectorAll('[data-field-control]').forEach((control) => {
    if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) {
      applyStringLengthValidity(control);
    }
  });

  document.addEventListener('click', async (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const enumChoice = target.closest('[data-enum-choice]');
    if (enumChoice instanceof HTMLButtonElement) {
      const root = enumChoice.closest('[data-metadata-enum-select]');
      const control = root?.querySelector('select[data-enum-items]');
      if (!(control instanceof HTMLSelectElement) || control.disabled) return;
      setEnumValue(control, enumChoice.dataset.enumChoice || '');
      publish(control);
      return;
    }

    const referenceChoice = target.closest('[data-reference-choice]');
    if (referenceChoice instanceof HTMLButtonElement) {
      const root = referenceChoice.closest('[data-metadata-reference-select]');
      const control = root?.querySelector('select[data-ctx-field]');
      if (!(control instanceof HTMLSelectElement) || control.disabled) return;
      setReferenceValue(control, referenceChoice.dataset.referenceChoice || '');
      publish(control);
      return;
    }

    const action = target.closest('[data-field-input-action]');
    if (!(action instanceof HTMLButtonElement)) return;

    const root = action.closest('[data-enhanced-field-input]');
    const control = root?.querySelector('[data-ctx-field], [data-field-control]');
    if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement)) return;

    switch (action.dataset.fieldInputAction) {
      case 'copy': {
        const value = controlValue(control, root);
        try {
          await navigator.clipboard.writeText(value);
        } catch {
          /* Clipboard may be unavailable in insecure contexts. */
        }
        return;
      }
      case 'inspect-ctx': {
        const fieldKey = action.dataset.fieldKey || control.dataset.ctxField;
        if (!fieldKey) return;

        // Developer field inspection first asks the shell to reveal the CTX
        // Viewer. Window event dispatch is synchronous, so by the time the
        // selection event is emitted below, the shell has already made the
        // viewer available without this field component knowing its DOM/layout.
        window.dispatchEvent(new Event('manatos:ctx-viewer-show'));
        window.dispatchEvent(
          new CustomEvent('manatos:ctx-viewer-select', {
            detail: {
              path: `${window.ManatOS?.popup?.recordSelector?.leafPagePath?.() || 'ctx.ui.level'}.fields.${fieldKey}`,
              expand: true,
            },
          }),
        );
        return;
      }
      case 'view-entry': {
        if (!(control instanceof HTMLSelectElement) || !control.value) return;
        const popup = window.ManatOS?.popup?.entry;
        const ctxRuntime = window.ManatOS?.ctx;
        if (!popup?.open || !ctxRuntime) return;

        const targetEntityKey = root?.dataset.referenceEntityKey || '';
        const fieldKey = root?.dataset.referenceFieldKey || control.dataset.ctxField;
        if (!targetEntityKey || !fieldKey) return;

        const token = globalThis.crypto?.randomUUID?.() || `entry-${Date.now()}-${Math.random()}`;
        const params = new URLSearchParams({
          _entryPopup: '1',
          _entryPopupToken: token,
          _entryMode: 'view',
        });
        const targetEntityLabel =
          root?.dataset.referenceEntityLabel || root?.dataset.referenceFieldLabel || 'Entry';
        const selectedOption = control.selectedOptions?.[0];
        const selectedEntryName = String(
          selectedOption?.dataset.entryName || selectedOption?.textContent || '',
        ).trim();
        popup.open({
          token,
          title: selectedEntryName
            ? `View ${targetEntityLabel} - ${selectedEntryName}`
            : `View ${targetEntityLabel}`,
          url: `/bo/${encodeURIComponent(targetEntityKey)}/${encodeURIComponent(control.value)}?${params.toString()}`,
          entityKey: targetEntityKey,
          mode: 'view',
          invocation: {
            purpose: 'view',
            presentation: { layout: 'entry' },
          },
        });
        return;
      }
      case 'add-entry': {
        if (!(control instanceof HTMLSelectElement) || control.disabled) return;
        const popup = window.ManatOS?.popup?.entry;
        const ctxRuntime = window.ManatOS?.ctx;
        if (!popup?.open || !ctxRuntime) return;

        const fieldKey = root?.dataset.referenceFieldKey || control.dataset.ctxField;
        const targetEntityKey = root?.dataset.referenceEntityKey || '';
        if (!fieldKey || !targetEntityKey) return;

        let createRelated = null;
        try {
          createRelated = JSON.parse(root?.dataset.referenceCreateRelated || 'null');
        } catch {
          createRelated = null;
        }
        // Creation is a universal reference capability. Relationship metadata is
        // optional and only enriches the hosted entry with defaults/constraints.
        createRelated = createRelated || {};

        const selector = window.ManatOS?.popup?.recordSelector;
        const pagePath = selector?.leafPagePath?.();
        const resolvedEntry = pagePath ? ctxRuntime.get?.(`${pagePath}.entry.current`) : null;
        /*
         * Creating a referenced entry is valid even when no source-entry values
         * are required. Some relationships (for example Principal -> Parent) only
         * constrain the target UI. Do not make the popup depend on resolving an
         * otherwise-unneeded source entry; use it only when metadata mappings ask
         * for sourceField values.
         */
        const currentEntry =
          resolvedEntry && typeof resolvedEntry === 'object' ? resolvedEntry : {};

        const defaults = {};
        for (const [targetField, mapping] of Object.entries(createRelated.defaults || {})) {
          const sourceField = mapping?.sourceField;
          if (sourceField && Object.prototype.hasOwnProperty.call(currentEntry, sourceField))
            defaults[targetField] = currentEntry[sourceField];
        }
        for (const [targetField, mapping] of Object.entries(createRelated.fixedValues || {})) {
          const sourceField = mapping?.sourceField;
          if (sourceField && Object.prototype.hasOwnProperty.call(currentEntry, sourceField))
            defaults[targetField] = currentEntry[sourceField];
        }

        const overrides = { ...(createRelated.uiOverrides || {}) };
        for (const targetField of Object.keys(createRelated.fixedValues || {})) {
          overrides[targetField] = {
            ...(overrides[targetField] || {}),
            editable: false,
            readOnlyValue: defaults[targetField] ?? null,
          };
        }
        /*
         * allowedValues / allowedEnumItemTrait are option-domain restrictions,
         * not route-owned defaulting rules. The browser entry-policy runtime
         * reconciles them after canonical metadata defaults are available.
         */

        const token = globalThis.crypto?.randomUUID?.() || `entry-${Date.now()}-${Math.random()}`;
        const params = new URLSearchParams({
          _entryPopup: '1',
          _entryPopupToken: token,
          _entryDefaults: JSON.stringify(defaults),
          _entryOverrides: JSON.stringify(overrides),
        });
        const targetEntityLabel =
          root?.dataset.referenceEntityLabel || root?.dataset.referenceFieldLabel || 'Entry';
        popup.open({
          token,
          title: `Add ${targetEntityLabel}`,
          url: `/bo/${encodeURIComponent(targetEntityKey)}/new?${params.toString()}`,
          entityKey: targetEntityKey,
          mode: 'create',
          invocation: {
            purpose: 'create',
            presentation: { layout: 'entry' },
          },
          onSaved: (result) => {
            const id = String(result?.value || '');
            if (!id) return;
            const representation = result?.metadata?.representation || {};
            const name = String(representation.name || result?.record?.name || id);
            const icons = Array.isArray(representation.icons) ? representation.icons : [];

            let option = [...control.options].find((candidate) => candidate.value === id);
            if (!option) {
              option = document.createElement('option');
              option.value = id;
              control.append(option);
            }
            option.textContent = name;
            option.dataset.entryName = name;
            option.dataset.entryIcons = JSON.stringify(icons);
            option.disabled = false;

            const menu = root?.querySelector('.metadata-reference-select-menu');
            if (menu && !menu.querySelector(`[data-reference-choice="${CSS.escape(id)}"]`)) {
              const li = document.createElement('li');
              const button = document.createElement('button');
              button.type = 'button';
              button.className = 'dropdown-item';
              button.dataset.referenceChoice = id;
              button.setAttribute('role', 'option');
              button.textContent = name;
              li.append(button);
              menu.append(li);
            }
            setReferenceValue(control, id);
            publish(control, false, {
              source: 'entry-popup',
              purpose: 'add-related-entry',
              targetField: fieldKey,
            });
          },
        });
        return;
      }
      case 'select-existing': {
        if (!(control instanceof HTMLSelectElement) || control.disabled) return;
        const selector = window.ManatOS?.popup?.recordSelector;
        const template = root?.querySelector('[data-record-selector-template]');
        const ctxRuntime = window.ManatOS?.ctx;
        if (!selector?.open || !(template instanceof HTMLTemplateElement) || !ctxRuntime) return;

        // The caller resolves its own CTX identity before opening the child.
        // The selector never discovers or dereferences its invoking field/entry.
        const pagePath = owningEntryPath(root) || owningEntryPath(control);
        const fieldKey = root?.dataset.referenceFieldKey || control.dataset.ctxField;
        const targetEntityKey = root?.dataset.referenceEntityKey || '';
        const sourceEntityKey = root?.dataset.referenceSourceEntityKey || '';
        const fieldLabelText = root?.dataset.referenceFieldLabel || fieldKey || 'related entry';
        if (!pagePath || !fieldKey || !targetEntityKey) return;

        const fieldContext = ctxRuntime.get?.(`${pagePath}.fields.${fieldKey}`);
        const source = Array.isArray(fieldContext?.options) ? fieldContext.options : [];
        // fields.<field>.options is the canonical effective option domain for an
        // entry field. It already reflects metadata plus caller/server restrictions.
        // resources.referenceData remains factual resource data for consumers such
        // as hierarchy/representation, but selectors must not choose between two
        // parallel catalogues for the same field.
        if (!source.length) return;

        const currentEntry = ctxRuntime.get?.(`${pagePath}.entry.current`);
        const sourceRecordId =
          currentEntry && typeof currentEntry === 'object' ? String(currentEntry.id ?? '') : '';
        const entities = ctxRuntime.value?.entities;
        const targetContext =
          entities && typeof entities === 'object'
            ? Object.values(entities).find((entity) => entity?.key === targetEntityKey)
            : null;
        const sourceContext =
          entities && typeof entities === 'object'
            ? Object.values(entities).find((entity) => entity?.key === sourceEntityKey)
            : null;
        const targetEntityName = targetContext?.name || targetContext?.metadata?.name || null;
        const sourceEntityName = sourceContext?.name || sourceContext?.metadata?.name || null;
        const sourcePrimaryField = sourceContext?.metadata?.primaryField || 'name';
        const sourceRecordName =
          currentEntry && typeof currentEntry === 'object'
            ? String(currentEntry[sourcePrimaryField] ?? currentEntry.name ?? '').trim()
            : '';
        const targetLabel = targetContext?.metadata?.label || fieldLabelText;
        const sourceLabel = sourceContext?.metadata?.label || sourceEntityName || 'entry';
        const title = sourceRecordName
          ? `Select ${targetLabel} for ${sourceLabel} '${sourceRecordName}'`
          : `Select ${targetLabel}`;
        let queryExclude = [];
        try {
          const parsed = JSON.parse(root?.dataset.referenceQueryExclude || '[]');
          queryExclude = Array.isArray(parsed) ? parsed : [];
        } catch {
          queryExclude = [];
        }

        selector.open({
          template,
          source,
          initialSelection: control.value || null,
          invocation: {
            entityName: targetEntityName || undefined,
            purpose: 'select',
            caller: {
              surfaceRef: pagePath,
              ...(sourceEntityName ? { entityName: sourceEntityName } : {}),
              ...(sourceRecordId ? { recordId: sourceRecordId } : {}),
            },
            presentation: { title, layout: 'entry' },
            ...(queryExclude.length ? { rules: { query: { exclude: queryExclude } } } : {}),
            behavior: { selection: 'single', allowClear: !control.required },
          },
          onSelect: (candidate) => {
            const selectedId = candidate?.id ?? candidate?.value;
            if (selectedId == null || selectedId === '') return false;
            setReferenceValue(control, selectedId);
            publish(control, false, {
              source: 'record-selector',
              purpose: 'select',
              targetField: fieldKey,
            });
            return true;
          },
        });
        return;
      }
      case 'focus':
        if (!control.disabled) control.focus();
        return;
      default:
        break;
    }

    const versionRoot = root?.closest('[data-version-field]');
    if (versionRoot) {
      if (action.dataset.fieldInputAction === 'clear') {
        versionRoot.querySelectorAll('[data-version-part]').forEach((part) => {
          if (part instanceof HTMLInputElement && !part.readOnly && !part.disabled) part.value = '';
        });
        if (control instanceof HTMLInputElement) {
          control.value = '';
          publish(control, false);
        }
      }
      return;
    }

    const durationRoot = root?.closest('[data-duration-field]');
    if (durationRoot) {
      const editablePart = durationRoot.querySelector(
        '[data-duration-part]:not([readonly]):not([disabled])',
      );
      if (!editablePart) return;
      if (action.dataset.fieldInputAction === 'duration-zero') {
        setDurationValue(durationRoot, { years: 0, months: 0, days: 0 });
      } else if (action.dataset.fieldInputAction === 'clear') {
        setDurationValue(durationRoot, null);
      }
      return;
    }

    if (isReadOnly(control)) return;

    switch (action.dataset.fieldInputAction) {
      case 'trim':
        if (!(control instanceof HTMLInputElement)) return;
        control.value = control.value.trim();
        break;
      case 'clear':
        control.value = '';
        break;
      case 'today':
        if (!(control instanceof HTMLInputElement)) return;
        control.value =
          control.type === 'date' ? localDate(new Date()) : localDateTime(new Date(), true);
        break;
      case 'now':
        if (!(control instanceof HTMLInputElement)) return;
        control.value =
          control.type === 'date' ? localDate(new Date()) : localDateTime(new Date(), false);
        break;
      case 'zero':
        if (!(control instanceof HTMLInputElement) || control.type !== 'number') return;
        control.value = '0';
        break;
      case 'toggle':
        if (!(control instanceof HTMLInputElement) || control.type !== 'checkbox') return;
        control.checked = !control.checked;
        break;
      default:
        return;
    }

    publish(control);
  });

  /**
   * Native backing controls are the canonical browser value for enhanced enum
   * and reference fields. Any external code that legitimately changes one and
   * emits `change` gets the same component-owned presentation refresh as user
   * interaction or evaluator-driven writes.
   */
  document.addEventListener('change', (event) => {
    const control = event.target;
    if (!(control instanceof HTMLSelectElement)) return;
    if (control.closest('[data-metadata-enum-select]') && control.dataset.enumItems) {
      setEnumValue(control, control.value);
      return;
    }
    if (control.closest('[data-metadata-reference-select]')) {
      setReferenceValue(control, control.value);
    }
  });

  // Server rendering already supplies the initial visible state. Reconcile it
  // once through the same field-component functions so dynamically inserted or
  // locally drafted controls also begin from the canonical native value.
  document
    .querySelectorAll('[data-metadata-enum-select] select[data-enum-items]')
    .forEach((control) => {
      if (control instanceof HTMLSelectElement) setEnumValue(control, control.value);
    });
  document.querySelectorAll('[data-metadata-reference-select] select').forEach((control) => {
    if (control instanceof HTMLSelectElement) setReferenceValue(control, control.value);
  });

  window.ManatOS = window.ManatOS || {};
  window.ManatOS.fieldComponents = Object.freeze({
    publish,
    durationValue,
    setDurationValue,
    setFieldValue,
    formatDuration,
  });
})();
