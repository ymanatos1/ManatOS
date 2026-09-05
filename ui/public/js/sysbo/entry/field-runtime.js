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
    const focusableBackingControl = control.getAttribute?.('aria-hidden') !== 'true'
      && !control.classList?.contains('visually-hidden')
      && control.tabIndex >= 0;
    if (focus && focusableBackingControl && typeof control.focus === 'function' && !control.disabled && control.type !== 'hidden') control.focus();
  };

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
    [...root.querySelectorAll('[data-duration-part]')].every((control) => !String(control.value ?? '').trim());

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
    ].filter(([, count]) => count > 0).map(([unit, count]) => `${count} ${unit}${count === 1 ? '' : 's'}`);
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
    const part = event.target instanceof Element ? event.target.closest('[data-duration-part]') : null;
    if (part instanceof HTMLInputElement) syncDurationFromParts(part);

    const versionPart = event.target instanceof Element ? event.target.closest('[data-version-part]') : null;
    if (versionPart instanceof HTMLInputElement) {
      const root = versionPart.closest('[data-version-field]');
      const canonical = root?.querySelector('[data-version-canonical-value]');
      if (root && canonical instanceof HTMLInputElement) {
        const parts = [...root.querySelectorAll('[data-version-part]')];
        const allEmpty = parts.every((control) => !String(control.value ?? '').trim());
        canonical.value = allEmpty
          ? ''
          : parts.map((control) => {
              const numeric = Number(control.value || 0);
              return String(Number.isFinite(numeric) && numeric >= 0 ? Math.trunc(numeric) : 0);
            }).join('.');
        publish(canonical, false);
      }
    }
  });

  const controlValue = (control, root) => {
    if (root?.matches('[data-enhanced-field-input][data-field-component="duration"]')) {
      return formatDuration(control.value);
    }
    if (control instanceof HTMLInputElement && control.type === 'checkbox') return control.checked ? 'true' : 'false';
    if (control instanceof HTMLSelectElement) return control.selectedOptions[0]?.textContent?.trim() || control.value;
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
    const option = [...control.options].find((candidate) => candidate.value === control.value) || null;
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
    const choice = [...root.querySelectorAll('[data-reference-choice]')]
      .find((candidate) => candidate instanceof HTMLButtonElement
        && String(candidate.dataset.referenceChoice || '') === control.value);
    root.querySelectorAll('[data-reference-choice]').forEach((candidate) => {
      const isSelected = candidate === choice;
      candidate.classList.toggle('active', isSelected);
      candidate.setAttribute('aria-selected', String(isSelected));
    });
    const toggle = root.querySelector('[data-reference-toggle]');
    if (toggle instanceof HTMLButtonElement) toggle.disabled = control.disabled;
    const selected = root.querySelector('[data-reference-selected]');
    if (selected) renderReferenceSelection(selected, control);
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
    const choice = [...root.querySelectorAll('[data-enum-choice]')]
      .find((candidate) => candidate instanceof HTMLButtonElement
        && String(candidate.dataset.enumChoice || '') === control.value);
    root.querySelectorAll('[data-enum-choice]').forEach((candidate) => {
      const selected = candidate === choice;
      candidate.classList.toggle('active', selected);
      candidate.setAttribute('aria-selected', String(selected));
    });
    const label = root.querySelector('[data-enum-selected-label]');
    const icon = root.querySelector('[data-enum-selected-icon]');
    const selectedOption = control.selectedOptions[0];
    let item = null;
    try { item = selectedOption?.dataset.enumItem ? JSON.parse(selectedOption.dataset.enumItem) : null; } catch { item = null; }
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
  const getFieldOption = (control) => {
    if (!(control instanceof HTMLSelectElement)) return undefined;
    const root = control.closest('[data-enhanced-field-input]');
    if (root?.dataset.fieldComponent !== 'enum') return undefined;
    const selectedOption = control.selectedOptions?.[0];
    const raw = selectedOption?.dataset?.enumItem;
    if (!raw) return undefined;
    try { return JSON.parse(raw); } catch { return undefined; }
  };

  const setFieldValue = (control, value, { emit = false, cause = {} } = {}) => {
    if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement)) return;
    const root = control.closest('[data-enhanced-field-input]');
    const component = root?.dataset.fieldComponent;
    if (component === 'duration') {
      setDurationValue(root, value, { emit, cause });
      return;
    }
    if (component === 'reference') setReferenceValue(control, value);
    else if (component === 'enum') setEnumValue(control, value);
    else if (control instanceof HTMLInputElement && control.type === 'checkbox') control.checked = Boolean(value);
    else control.value = value == null ? '' : String(value);
    if (emit) publish(control, false, cause);
  };

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
        try { await navigator.clipboard.writeText(value); } catch { /* Clipboard may be unavailable in insecure contexts. */ }
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
        window.dispatchEvent(new CustomEvent('manatos:ctx-viewer-select', {
          detail: { path: `ctx.page.page.fields.${fieldKey}`, expand: true },
        }));
        return;
      }
      case 'select-existing': {
        if (!(control instanceof HTMLSelectElement) || control.disabled) return;
        const selector = window.ManatOSRecordSelector;
        const template = root?.querySelector('[data-record-selector-template]');
        const ctxRuntime = window.ManatOS?.ctx;
        if (!selector?.open || !(template instanceof HTMLTemplateElement) || !ctxRuntime) return;

        const pagePath = selector.leafPagePath?.();
        const fieldKey = root?.dataset.referenceFieldKey || control.dataset.ctxField;
        const targetEntityKey = root?.dataset.referenceEntityKey || '';
        const sourceEntityKey = root?.dataset.referenceSourceEntityKey || '';
        const fieldLabelText = root?.dataset.referenceFieldLabel || fieldKey || 'related entry';
        if (!pagePath || !fieldKey || !targetEntityKey) return;

        const fieldContext = ctxRuntime.resolve?.(`${pagePath}.fields.${fieldKey}`);
        const source = Array.isArray(fieldContext?.options) ? fieldContext.options : [];
        if (!source.length) return;

        const currentEntry = ctxRuntime.resolve?.(`${pagePath}.entry`);
        const sourceRecordId = currentEntry && typeof currentEntry === 'object'
          ? String(currentEntry.id ?? '')
          : '';
        const entities = ctxRuntime.value?.entities;
        const targetContext = entities && typeof entities === 'object'
          ? Object.values(entities).find((entity) => entity?.key === targetEntityKey)
          : null;
        const targetName = targetContext?.metadata?.name || 'entry';
        const sourceContext = entities && typeof entities === 'object'
          ? Object.values(entities).find((entity) => entity?.key === sourceEntityKey)
          : null;
        const sourceEntityLabel = sourceContext?.metadata?.name || sourceEntityKey || 'entry';
        const sourcePrimaryField = sourceContext?.metadata?.primaryField || 'name';
        const sourceRecordName = currentEntry && typeof currentEntry === 'object'
          ? String(currentEntry[sourcePrimaryField] ?? currentEntry.name ?? '').trim()
          : '';

        selector.open({
          template,
          source,
          initialSelection: control.value || null,
          callingParams: {
            purpose: 'reference-field',
            presentationMode: 'entry',
            entityKey: targetEntityKey,
            selectionMode: 'single',
            sourceEntityKey,
            sourceRecordId: sourceRecordId || null,
            targetField: fieldKey,
            targetFieldLabel: fieldLabelText,
            targetEntityLabel: targetName,
            sourceEntityLabel,
            sourceRecordName: sourceRecordName || null,
            allowClear: !control.required,
          },
          eligibility: (candidate) => {
            const candidateId = String(candidate?.id ?? candidate?.value ?? '');
            if (sourceRecordId && sourceEntityKey === targetEntityKey && candidateId === sourceRecordId) {
              return {
                eligible: false,
                visible: true,
                reason: 'The current entry cannot reference itself.',
              };
            }
            return { eligible: true, visible: true, reason: '' };
          },
          onSelect: (candidate) => {
            const selectedId = candidate?.id ?? candidate?.value;
            if (selectedId == null || selectedId === '') return false;
            setReferenceValue(control, selectedId);
            publish(control, false, {
              source: 'record-selector',
              purpose: 'reference-field',
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
      const editablePart = durationRoot.querySelector('[data-duration-part]:not([readonly]):not([disabled])');
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
        control.value = control.type === 'date' ? localDate(new Date()) : localDateTime(new Date(), true);
        break;
      case 'now':
        if (!(control instanceof HTMLInputElement)) return;
        control.value = control.type === 'date' ? localDate(new Date()) : localDateTime(new Date(), false);
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
  document.querySelectorAll('[data-metadata-enum-select] select[data-enum-items]').forEach((control) => {
    if (control instanceof HTMLSelectElement) setEnumValue(control, control.value);
  });
  document.querySelectorAll('[data-metadata-reference-select] select').forEach((control) => {
    if (control instanceof HTMLSelectElement) setReferenceValue(control, control.value);
  });

  window.ManatOSFieldComponents = Object.freeze({
    publish,
    durationValue,
    setDurationValue,
    setFieldValue,
    getFieldOption,
    formatDuration,
  });
})();
