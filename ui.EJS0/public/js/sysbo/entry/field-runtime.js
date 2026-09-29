/**
 * Progressive enhancement for canonical metadata-driven entity fields.
 *
 * Canonical semantic field values live in CTX. Native controls are physical
 * input/rendering adapters only: semantic field actions read their current value
 * from CTX, then publish any resulting mutation through the normal input pipeline.
 * Read-only controls keep their component menu for non-mutating inspection/copy actions.
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

  const fieldActionContext = (action, control, root) => {
    const runtime = window.ManatOS?.ctx;
    const pagePath = owningEntryPath(root) || owningEntryPath(control);
    const fieldKey =
      action?.dataset?.fieldKey || root?.dataset?.referenceFieldKey || control?.dataset?.ctxField;
    if (!runtime?.get || !pagePath || !fieldKey) return null;
    const field = runtime.get(`${pagePath}.data.fields.${fieldKey}`);
    if (!field || typeof field !== 'object') return null;
    return { runtime, pagePath, fieldKey, field, currentValue: field.value };
  };

  const canonicalCopyValue = (context, control, root) => {
    const value = context?.currentValue;
    if (root?.matches('[data-enhanced-field-input][data-field-component="duration"]')) {
      return formatDuration(value);
    }
    if (control instanceof HTMLInputElement && control.type === 'checkbox')
      return value === true ? 'true' : 'false';
    if (control instanceof HTMLSelectElement) {
      const option = context?.field?.option;
      const representation = option?.name ?? option?.label ?? option?.text;
      return String(representation ?? value ?? '');
    }
    return value == null ? '' : String(value);
  };

  const publishSemanticActionValue = (control, value, cause = {}) => {
    window.ManatOS?.fieldComponents?.setFieldValue?.(control, value, { emit: false });
    publish(control, false, cause);
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

  const appendReferencePresentation = (host, name, icons, ownerWorkspaceState = false) => {
    if (!(host instanceof Element)) return;
    host.replaceChildren();
    if (icons.length) {
      const iconGroup = document.createElement('span');
      iconGroup.className = 'metadata-entry-icons me-1';
      iconGroup.setAttribute('aria-hidden', 'true');
      icons.forEach((icon, index) => {
        const element = document.createElement('i');
        element.className = `bi bi-${String(icon).replace(/^bi-/, '')} metadata-entry-icon metadata-entry-icon-${index}`;
        iconGroup.append(element);
      });
      host.append(iconGroup);
    }
    host.append(document.createTextNode(name));
    host.classList.toggle('fst-italic', ownerWorkspaceState);
  };

  const syncReferenceOptionsFromCtx = (root, control) => {
    if (!(root instanceof HTMLElement) || !(control instanceof HTMLSelectElement)) return false;
    const pagePath = owningEntryPath(root) || owningEntryPath(control);
    const fieldKey = root.dataset.referenceFieldKey || control.dataset.ctxField;
    const ctxRuntime = window.ManatOS?.ctx;
    if (!pagePath || !fieldKey || !ctxRuntime) return false;
    const field = ctxRuntime.get?.(`${pagePath}.data.fields.${fieldKey}`);
    if (!Array.isArray(field?.options)) return false;

    const currentValue = String(field.value ?? '');
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = control.required ? 'Choose...' : 'None';
    const nativeOptions = [placeholder];
    for (const candidate of field.options) {
      if (!candidate || typeof candidate !== 'object') continue;
      const id = String(candidate.id ?? candidate.value ?? '');
      if (!id) continue;
      const presentation = window.ManatOS?.entryRepresentation?.projected?.(candidate, id) || {
        name: String(candidate.__entryName ?? candidate.label ?? candidate.name ?? id),
        icons: Array.isArray(candidate.__entryIcons) ? candidate.__entryIcons : [],
      };
      const option = document.createElement('option');
      option.value = id;
      option.textContent = String(presentation.name || id);
      option.dataset.entryName = String(presentation.name || id);
      option.dataset.entryIcons = JSON.stringify(presentation.icons || []);
      if (presentation.ownerWorkspaceState === true) option.dataset.ownerWorkspaceState = 'true';
      option.disabled = candidate.__referenceUnavailable === true && id !== currentValue;
      nativeOptions.push(option);
    }
    control.replaceChildren(...nativeOptions);
    control.value = currentValue;

    const menu = root.querySelector('.metadata-reference-select-menu');
    if (menu) {
      menu.replaceChildren();
      const addChoice = (id, name, icons = [], ownerWorkspaceState = false, disabled = false) => {
        const li = document.createElement('li');
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'dropdown-item';
        button.dataset.referenceChoice = id;
        button.setAttribute('role', 'option');
        button.disabled = disabled;
        button.setAttribute('aria-disabled', String(disabled));
        const selected = id === currentValue;
        button.classList.toggle('active', selected);
        button.setAttribute('aria-selected', String(selected));
        appendReferencePresentation(button, name, icons, ownerWorkspaceState);
        li.append(button);
        menu.append(li);
      };
      addChoice('', control.required ? 'Choose...' : 'None');
      for (const option of [...control.options].slice(1)) {
        addChoice(
          option.value,
          option.dataset.entryName || option.textContent?.trim() || option.value,
          referenceOptionIcons(option),
          option.dataset.ownerWorkspaceState === 'true',
          option.disabled,
        );
      }
    }
    reconcileReferenceToolActions(root, control);
    return true;
  };

  const renderReferenceSelection = (selected, control) => {
    if (!(selected instanceof Element) || !(control instanceof HTMLSelectElement)) return;
    const option =
      [...control.options].find((candidate) => candidate.value === control.value) || null;
    const name = option?.dataset.entryName || option?.textContent?.trim() || '';
    const icons = referenceOptionIcons(option);
    appendReferencePresentation(
      selected,
      name || (control.required ? 'Choose...' : 'None'),
      icons,
      option?.dataset.ownerWorkspaceState === 'true',
    );
  };

  const reconcileReferenceOwnerActions = (root, control) => {
    if (!(root instanceof HTMLElement) || !(control instanceof HTMLSelectElement)) return;
    const editOwned = root.querySelector('[data-field-input-action="edit-owned-entry"]');
    if (!(editOwned instanceof HTMLButtonElement)) return;
    const pagePath = owningEntryPath(root) || owningEntryPath(control);
    const ownerSurface = pagePath ? window.ManatOS?.ownerProviderForPath?.(pagePath) || null : null;
    const targetEntityKey = root.dataset.referenceEntityKey || '';
    const eligible = Boolean(ownerSurface?.canOwnEntity?.(targetEntityKey));
    const item = editOwned.closest('li');
    if (item instanceof HTMLElement) item.hidden = !eligible;
    editOwned.disabled = !eligible || !control.value;
    editOwned.setAttribute('aria-disabled', String(editOwned.disabled));
  };

  const reconcileReferenceToolActions = (root, control) => {
    if (!(root instanceof HTMLElement) || !(control instanceof HTMLSelectElement)) return;
    root.querySelectorAll('[data-field-action-requires-value="true"]').forEach((action) => {
      if (!(action instanceof HTMLButtonElement)) return;
      action.disabled = !control.value;
      action.setAttribute('aria-disabled', String(!control.value));
    });
    reconcileReferenceOwnerActions(root, control);
  };

  const setReferenceValue = (control, value) => {
    if (!(control instanceof HTMLSelectElement)) return;
    const requestedValue = value == null ? '' : String(value);
    const root = control.closest('[data-metadata-reference-select]');
    if (!root) {
      control.value = requestedValue;
      return;
    }
    // field.options is the canonical effective domain for normal and owned Entries.
    // Rebuild the physical adapter first so a legitimate semantic selection cannot
    // be coerced to empty merely because its <option> had not been materialized yet.
    syncReferenceOptionsFromCtx(root, control);
    if (requestedValue && ![...control.options].some((option) => option.value === requestedValue)) {
      const pagePath = owningEntryPath(root) || owningEntryPath(control);
      const fieldKey = root.dataset.referenceFieldKey || control.dataset.ctxField;
      const field =
        pagePath && fieldKey
          ? window.ManatOS?.ctx?.get?.(`${pagePath}.data.fields.${fieldKey}`)
          : null;
      const canonicalOption =
        field?.option && String(field.option.id ?? field.option.value ?? '') === requestedValue
          ? field.option
          : null;
      const option = document.createElement('option');
      option.value = requestedValue;
      option.textContent = String(
        canonicalOption?.name ?? canonicalOption?.label ?? canonicalOption?.text ?? requestedValue,
      );
      option.dataset.entryName = option.textContent;
      option.dataset.entryIcons = JSON.stringify(
        Array.isArray(canonicalOption?.__entryIcons) ? canonicalOption.__entryIcons : [],
      );
      if (canonicalOption?.__ownerWorkspaceState === true)
        option.dataset.ownerWorkspaceState = 'true';
      control.append(option);
    }
    control.value = requestedValue;
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
    reconcileReferenceToolActions(root, control);
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

  const setVersionValue = (root, control, value) => {
    if (!(root instanceof Element) || !(control instanceof HTMLInputElement)) return;
    const source = value == null ? '' : String(value).trim();
    const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(source);
    const parts = ['major', 'minor', 'patch'];
    root.querySelectorAll('[data-version-part]').forEach((partControl) => {
      if (!(partControl instanceof HTMLInputElement)) return;
      const index = parts.indexOf(partControl.dataset.versionPart || '');
      partControl.value = index >= 0 && match ? match[index + 1] : '';
    });
    control.value = source;
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
    if (control.closest('[data-picture-field]') && pictureRuntime?.projectScalarPictureValue) {
      pictureRuntime.projectScalarPictureValue(control, value);
      if (emit) publish(control, false, cause);
      return;
    }
    if (component === 'version') setVersionValue(root, control, value);
    else if (component === 'reference') setReferenceValue(control, value);
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
        const context = fieldActionContext(action, control, root);
        if (!context) return;
        const value = canonicalCopyValue(context, control, root);
        try {
          await navigator.clipboard.writeText(value);
        } catch {
          /* Clipboard may be unavailable in insecure contexts. */
        }
        return;
      }
      case 'revert': {
        if (action.disabled || isReadOnly(control)) return;
        const context = fieldActionContext(action, control, root);
        if (!context?.runtime?.updateField || context.field.dirty !== true) return;
        context.runtime.updateField(
          context.pagePath,
          context.fieldKey,
          context.field.originalValue,
          undefined,
          {
            source: 'field-tools',
            action: 'revert',
            triggerPath: `${context.pagePath}.data.fields.${context.fieldKey}.value`,
          },
        );
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
              path: `${window.ManatOS?.popup?.recordSelector?.leafPagePath?.() || 'ctx.ui.level'}.data.fields.${fieldKey}`,
              expand: true,
            },
          }),
        );
        return;
      }
      case 'view-entry': {
        if (!(control instanceof HTMLSelectElement)) return;
        const context = fieldActionContext(action, control, root);
        const recordId = context?.currentValue;
        if (recordId == null || recordId === '') return;
        const entryOpening = window.ManatOS?.entryOpening;
        const ctxRuntime = window.ManatOS?.ctx;
        if (!entryOpening?.open || !ctxRuntime) return;

        const targetEntityKey = root?.dataset.referenceEntityKey || '';
        const fieldKey = root?.dataset.referenceFieldKey || control.dataset.ctxField;
        if (!targetEntityKey || !fieldKey) return;

        const targetEntityLabel =
          root?.dataset.referenceEntityLabel || root?.dataset.referenceFieldLabel || 'Entry';
        const canonicalOption = context?.field?.option;
        const selectedEntryName = String(
          canonicalOption?.name || canonicalOption?.label || canonicalOption?.text || '',
        ).trim();
        const pagePath = owningEntryPath(root) || owningEntryPath(control);
        const ownerSurface = pagePath
          ? window.ManatOS?.ownerProviderForPath?.(pagePath) || null
          : null;
        const identity = String(recordId);
        const ownedTransfer =
          ownerSurface?.provideEntryIfPresent?.(targetEntityKey, identity) || null;
        const ownerDraft = Boolean(ownedTransfer && identity.startsWith('draft:'));
        entryOpening.open({
          host: 'popup',
          target: ownerDraft
            ? { entityKey: targetEntityKey }
            : { entityKey: targetEntityKey, recordId: identity },
          title: selectedEntryName
            ? `View ${targetEntityLabel} - ${selectedEntryName}`
            : `View ${targetEntityLabel}`,
          mode: 'view',
          purpose: 'view',
          presentation: { layout: 'entry' },
          ...(ownedTransfer
            ? {
                caller: { workspaceOwned: true },
                ...(ownerDraft ? { rules: { defaults: { id: identity } } } : {}),
              }
            : {}),
        });
        return;
      }
      case 'edit-owned-entry': {
        if (!(control instanceof HTMLSelectElement)) return;
        const context = fieldActionContext(action, control, root);
        const recordId = context?.currentValue;
        if (recordId == null || recordId === '') return;
        const entryOpening = window.ManatOS?.entryOpening;
        const ctxRuntime = window.ManatOS?.ctx;
        if (!entryOpening?.open || !ctxRuntime) return;

        const targetEntityKey = root?.dataset.referenceEntityKey || '';
        const fieldKey = root?.dataset.referenceFieldKey || control.dataset.ctxField;
        if (!targetEntityKey || !fieldKey) return;
        const pagePath = owningEntryPath(root) || owningEntryPath(control);
        const ownerSurface = pagePath
          ? window.ManatOS?.ownerProviderForPath?.(pagePath) || null
          : null;
        if (!ownerSurface || !ownerSurface.canOwnEntity?.(targetEntityKey)) return;

        const parentSurface = pagePath ? ctxRuntime.get?.(pagePath) : null;
        const parentCaller =
          parentSurface?.control?.invocation?.caller &&
          typeof parentSurface.control.invocation.caller === 'object'
            ? parentSurface.control.invocation.caller
            : {};
        const identity = String(recordId);
        const existingTransfer =
          ownerSurface.provideEntryIfPresent?.(targetEntityKey, identity) || null;
        const ownerDraft = Boolean(existingTransfer && identity.startsWith('draft:'));
        const targetEntityLabel =
          root?.dataset.referenceEntityLabel || root?.dataset.referenceFieldLabel || 'Entry';
        const canonicalOption = context?.field?.option;
        const selectedEntryName = String(
          canonicalOption?.name || canonicalOption?.label || canonicalOption?.text || '',
        ).trim();

        entryOpening.open({
          host: 'popup',
          target: ownerDraft
            ? { entityKey: targetEntityKey }
            : { entityKey: targetEntityKey, recordId: identity },
          title: selectedEntryName
            ? `Edit ${targetEntityLabel} - ${selectedEntryName}`
            : `Edit ${targetEntityLabel}`,
          mode: ownerDraft ? 'create' : 'edit',
          purpose: 'edit-owned-related-entry',
          presentation: { layout: 'entry' },
          caller: {
            ...parentCaller,
            workspaceOwned: true,
          },
          ...(ownerDraft ? { rules: { defaults: { id: identity } } } : {}),
          onSaved: () => {
            if (pagePath) setReferenceValue(control, context?.currentValue);
          },
        });
        return;
      }
      case 'add-entry': {
        if (!(control instanceof HTMLSelectElement) || control.disabled) return;
        const entryOpening = window.ManatOS?.entryOpening;
        const ctxRuntime = window.ManatOS?.ctx;
        if (!entryOpening?.open || !ctxRuntime) return;

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
        const resolvedEntry = pagePath ? ctxRuntime.get?.(`${pagePath}.data.entry.current`) : null;
        /*
         * Creating a referenced entry is valid even when no source-entry values
         * are required. Some relationships (for example Principal -> Parent) only
         * constrain the target UI. Do not make the popup depend on resolving an
         * otherwise-unneeded source entry; use it only when metadata mappings ask
         * for sourceField values.
         */
        const currentEntry =
          resolvedEntry && typeof resolvedEntry === 'object' ? resolvedEntry : {};

        const rules = window.ManatOS?.entryOpening?.composeCallerRules?.(
          createRelated,
          currentEntry,
        ) || { defaults: {}, uiOverrides: {} };

        const targetEntityLabel =
          root?.dataset.referenceEntityLabel || root?.dataset.referenceFieldLabel || 'Entry';
        const ownerSurface = pagePath
          ? window.ManatOS?.ownerProviderForPath?.(pagePath) || null
          : null;
        const externalOwnerSurface = ownerSurface?.canOwnEntity?.(targetEntityKey)
          ? ownerSurface
          : null;
        const parentSurface = pagePath ? ctxRuntime.get?.(pagePath) : null;
        const parentCaller =
          parentSurface?.control?.invocation?.caller &&
          typeof parentSurface.control.invocation.caller === 'object'
            ? parentSurface.control.invocation.caller
            : {};
        const draftIdentity = externalOwnerSurface
          ? `draft:${crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`
          : null;

        entryOpening.open({
          host: 'popup',
          target: { entityKey: targetEntityKey },
          title: `Add ${targetEntityLabel}`,
          mode: 'create',
          purpose: 'create',
          presentation: { layout: 'entry' },
          rules: draftIdentity
            ? { ...rules, defaults: { ...(rules.defaults || {}), id: draftIdentity } }
            : rules,
          ...(draftIdentity ? { caller: { ...parentCaller, workspaceOwned: true } } : {}),
          onSaved: (result) => {
            const id = String(result?.value || '');
            if (!id) return;
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

        const fieldContext = ctxRuntime.get?.(`${pagePath}.data.fields.${fieldKey}`);
        const source = Array.isArray(fieldContext?.options) ? fieldContext.options : [];
        // fields.<field>.options is the canonical effective option domain for an
        // entry field. It already reflects metadata plus caller/server restrictions.
        // resources.referenceData remains factual resource data for consumers such
        // as hierarchy/representation, but selectors must not choose between two
        // parallel catalogues for the same field.
        if (!source.length) return;

        const currentEntry = ctxRuntime.get?.(`${pagePath}.data.entry.current`);
        const sourceRecordId =
          currentEntry && typeof currentEntry === 'object' ? String(currentEntry.id ?? '') : '';
        const targetContext = ctxRuntime.entity?.(targetEntityKey) || null;
        const sourceContext = ctxRuntime.entity?.(sourceEntityKey) || null;
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

        const context = fieldActionContext(action, control, root);
        selector.open({
          template,
          source,
          initialSelection: context?.currentValue ?? null,
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
          onSelect: (surfaceResult) => {
            const candidate = surfaceResult?.value;
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
      case 'trim': {
        if (!(control instanceof HTMLInputElement)) return;
        const context = fieldActionContext(action, control, root);
        if (!context || typeof context.currentValue !== 'string') return;
        const next = context.currentValue.trim();
        if (Object.is(next, context.currentValue)) return;
        publishSemanticActionValue(control, next, {
          source: 'field-tools',
          action: 'trim',
          triggerPath: `${context.pagePath}.data.fields.${context.fieldKey}.value`,
        });
        return;
      }
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
      case 'toggle': {
        if (!(control instanceof HTMLInputElement) || control.type !== 'checkbox') return;
        const context = fieldActionContext(action, control, root);
        if (!context) return;
        publishSemanticActionValue(control, context.currentValue !== true, {
          source: 'field-tools',
          action: 'toggle',
          triggerPath: `${context.pagePath}.data.fields.${context.fieldKey}.value`,
        });
        return;
      }
      default:
        return;
    }

    publish(control);
  });

  /**
   * Native backing controls are physical input adapters for enhanced enum and
   * reference fields, never semantic value authority. A genuine browser/user
   * change enters the normal input pipeline and is committed to canonical CTX;
   * CTX projection then owns the accepted presentation state.
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

  // Server rendering already supplies the initial visible state. Reconcile each
  // entry surface through the same field-component functions when it is mounted;
  // this is required for same-document popup/embedded surfaces inserted after boot.
  const reconcileFieldPresentation = (root) => {
    root
      .querySelectorAll('[data-metadata-enum-select] select[data-enum-items]')
      .forEach((control) => {
        if (control instanceof HTMLSelectElement) setEnumValue(control, control.value);
      });
    root.querySelectorAll('[data-metadata-reference-select] select').forEach((control) => {
      if (!(control instanceof HTMLSelectElement)) return;
      const pagePath = owningEntryPath(control);
      const fieldKey = control.dataset.ctxField;
      const semanticValue =
        pagePath && fieldKey
          ? window.ManatOS?.ctx?.get?.(`${pagePath}.data.fields.${fieldKey}.value`)
          : undefined;
      setReferenceValue(control, semanticValue ?? control.value);
    });
    return true;
  };
  reconcileFieldPresentation(document);
  window.ManatOS?.entrySurfaces?.register?.('field-presentation', reconcileFieldPresentation);

  const refreshOwnedReferencePresentation = (pagePath) => {
    const targetPath = String(pagePath || '');
    if (!targetPath) return false;
    let refreshed = false;
    document.querySelectorAll('[data-metadata-reference-select] select').forEach((control) => {
      if (!(control instanceof HTMLSelectElement) || owningEntryPath(control) !== targetPath)
        return;
      const referenceRoot = control.closest('[data-metadata-reference-select]');
      if (!(referenceRoot instanceof HTMLElement)) return;
      setReferenceValue(
        control,
        window.ManatOS?.ctx?.get?.(`${targetPath}.data.fields.${control.dataset.ctxField}.value`),
      );
      refreshed = true;
    });
    return refreshed;
  };

  window.ManatOS = window.ManatOS || {};
  window.ManatOS.refreshOwnedReferencePresentation = refreshOwnedReferencePresentation;
  window.ManatOS.fieldComponents = Object.freeze({
    publish,
    durationValue,
    setDurationValue,
    setFieldValue,
    formatDuration,
  });
})();
