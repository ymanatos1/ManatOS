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

  document.addEventListener('click', async (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const referenceChoice = target.closest('[data-reference-choice]');
    if (referenceChoice instanceof HTMLButtonElement) {
      const root = referenceChoice.closest('[data-metadata-reference-select]');
      const control = root?.querySelector('select[data-ctx-field]');
      if (!(control instanceof HTMLSelectElement) || control.disabled) return;
      control.value = referenceChoice.dataset.referenceChoice || '';
      root.querySelectorAll('[data-reference-choice]').forEach((choice) => {
        choice.classList.toggle('active', choice === referenceChoice);
        choice.setAttribute('aria-selected', String(choice === referenceChoice));
      });
      const selected = root.querySelector('[data-reference-selected]');
      if (selected) selected.innerHTML = referenceChoice.innerHTML;
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

  window.ManatOSFieldComponents = Object.freeze({
    publish,
    durationValue,
    setDurationValue,
    formatDuration,
  });
})();
