/**
 * Canonical semantic entity-entry opening contract.
 *
 * Callers describe target/mode/view/rules/presentation once. Host adapters use
 * this module to derive route/form transport; callers never author `_entry*`
 * transport fields or correlation tokens themselves.
 */
(() => {
  'use strict';

  const token = () => globalThis.crypto?.randomUUID?.() || `entry-${Date.now()}-${Math.random()}`;
  const object = (value) =>
    value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : {};

  const normalize = (input = {}) => {
    const target = object(input.target);
    const mode = ['create', 'edit', 'view'].includes(input.mode) ? input.mode : 'view';
    const uiViewKey = String(input.uiViewKey || input.uiView || '').trim() || null;
    const presentation = object(input.presentation);
    const behavior = object(input.behavior);
    const rules = object(input.rules);
    const defaults = object(rules.defaults);
    const uiOverrides = object(rules.uiOverrides);
    const entityKey = String(target.entityKey || input.entityKey || '').trim() || null;
    const recordId = target.recordId == null ? null : String(target.recordId);
    const correlationToken = String(input.token || '').trim() || token();
    const purpose = String(input.purpose || (mode === 'create' ? 'create' : 'view'));

    return Object.freeze({
      target: Object.freeze({
        entityKey,
        recordId,
        ...(target.url ? { url: String(target.url) } : {}),
      }),
      host: input.host === 'embedded' || input.host === 'page' ? input.host : 'popup',
      mode,
      uiViewKey,
      token: correlationToken,
      title: String(input.title || (mode === 'create' ? 'Add entry' : 'View entry')),
      presentation: Object.freeze({ layout: 'entry', ...presentation }),
      behavior: Object.freeze({ recoverable: behavior.recoverable !== false, ...behavior }),
      caller: Object.freeze(object(input.caller)),
      rules: Object.freeze({
        defaults: Object.freeze(defaults),
        uiOverrides: Object.freeze(uiOverrides),
      }),
      request: input.request ? { ...input.request, fields: object(input.request.fields) } : null,
      purpose,
      onSaved: typeof input.onSaved === 'function' ? input.onSaved : null,
      onClose: typeof input.onClose === 'function' ? input.onClose : null,
    });
  };

  const composeCallerRules = (declaration = {}, sourceValues = {}) => {
    const declared = object(declaration);
    const source = object(sourceValues);
    const defaults = {};
    const mappedValue = (mapping) => {
      if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) return undefined;
      if (Object.prototype.hasOwnProperty.call(mapping, 'value')) return mapping.value;
      const sourceField = mapping.sourceField;
      return sourceField && Object.prototype.hasOwnProperty.call(source, sourceField)
        ? source[sourceField]
        : undefined;
    };
    for (const [targetField, mapping] of Object.entries(object(declared.defaults))) {
      const value = mappedValue(mapping);
      if (value !== undefined) defaults[targetField] = value;
    }
    for (const [targetField, mapping] of Object.entries(object(declared.fixedValues))) {
      const value = mappedValue(mapping);
      if (value !== undefined) defaults[targetField] = value;
    }

    const uiOverrides = object(declared.uiOverrides);
    for (const targetField of Object.keys(object(declared.fixedValues))) {
      uiOverrides[targetField] = {
        ...object(uiOverrides[targetField]),
        editable: false,
        readOnlyValue: defaults[targetField] ?? null,
      };
    }
    return Object.freeze({
      defaults: Object.freeze(defaults),
      uiOverrides: Object.freeze(uiOverrides),
    });
  };

  const routeFor = (opening) => {
    if (opening.target.url) {
      const url = new URL(opening.target.url, window.location.origin);
      // `_entry*` fields are transport for the surface that produced the URL, not
      // semantic navigation state. A child opening must derive its own invocation
      // from `opening`; otherwise a parent's quick ui-view/mode can leak into it.
      for (const key of [...url.searchParams.keys()]) {
        if (key.startsWith('_entry')) url.searchParams.delete(key);
      }
      return url;
    }
    if (!opening.target.entityKey) throw new Error('Entry opening requires target.entityKey.');
    const base = `/bo/${encodeURIComponent(opening.target.entityKey)}`;
    if (opening.mode === 'create' && !opening.target.recordId)
      return new URL(`${base}/new`, location.origin);
    if (!opening.target.recordId)
      throw new Error('Existing entry opening requires target.recordId.');
    return new URL(`${base}/${encodeURIComponent(opening.target.recordId)}`, location.origin);
  };

  const transport = (input) => {
    const opening = normalize(input);
    const url = routeFor(opening);
    const fields = {
      ...(opening.request?.fields || {}),
      _entryHost: opening.host,
      _entryToken: opening.token,
      _entryMode: opening.mode,
      ...(opening.uiViewKey ? { _entryUIView: opening.uiViewKey } : {}),
      ...(opening.presentation.entryDensity === 'compact' ? { _entryDensity: 'compact' } : {}),
      ...(opening.behavior.recoverable === false ? { _entryRecoverable: '0' } : {}),
      ...(Object.keys(opening.rules.defaults).length
        ? { _entryDefaults: JSON.stringify(opening.rules.defaults) }
        : {}),
      ...(Object.keys(opening.rules.uiOverrides).length
        ? { _entryOverrides: JSON.stringify(opening.rules.uiOverrides) }
        : {}),
    };
    const method = String(opening.request?.method || 'GET').toUpperCase();
    if (method === 'GET') {
      for (const [key, value] of Object.entries(fields)) url.searchParams.set(key, String(value));
    }
    return Object.freeze({
      opening,
      url: `${url.pathname}${url.search}${url.hash}`,
      request: method === 'GET' ? null : { method, fields },
      invocation: Object.freeze({
        purpose: opening.purpose,
        ...(opening.uiViewKey ? { uiViewKey: opening.uiViewKey } : {}),
        ...(Object.keys(opening.caller).length ? { caller: opening.caller } : {}),
        rules: Object.freeze({
          values: Object.freeze(
            Object.fromEntries(
              Object.entries(opening.rules.defaults).map(([key, value]) => [
                key,
                { default: value },
              ]),
            ),
          ),
          fields: opening.rules.uiOverrides,
        }),
        presentation: opening.presentation,
        behavior: opening.behavior,
      }),
    });
  };

  const open = (input = {}) => {
    const opening = normalize(input);
    const runtimeHost = window.ManatOS?.uiHostV2;
    if (!runtimeHost?.openEntry) {
      throw new Error('Typed UI runtime entry opening is not available.');
    }
    return runtimeHost.openEntry(opening);
  };

  const openPage = (opening) => {
    const projected = transport(opening);
    if (projected.request) {
      throw new Error('Page entry navigation currently requires GET transport.');
    }
    window.location.assign(projected.url);
    return Object.freeze({ host: 'page', url: projected.url, opening: projected.opening });
  };

  window.ManatOS = window.ManatOS || {};
  window.ManatOS.entryPagePresenter = openPage;
  window.ManatOS.entryOpening = Object.freeze({
    normalize,
    composeCallerRules,
    transport,
    open,
  });
})();
