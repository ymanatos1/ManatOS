(() => {
  'use strict';

  const normalizeIcon = (value) => {
    const text = value == null ? '' : String(value).trim();
    return text ? text.replace(/^bi-/, '') : null;
  };

  const relationScopeFor = (config, row) => {
    const result = {};
    const definitions = config?.relationships || {};
    const referenceData = config?.referenceData || {};
    for (const [relationshipKey, definition] of Object.entries(definitions)) {
      const fieldKey = String(definition?.field || '');
      if (!fieldKey) continue;
      const value = row?.[fieldKey];
      const related = Array.isArray(referenceData[fieldKey])
        ? referenceData[fieldKey].find((candidate) => String(candidate?.id ?? candidate?.value ?? '') === String(value ?? ''))
        : null;
      if (related) result[relationshipKey] = related;
    }
    return result;
  };

  const scopeFor = (config, row) => {
    const scope = { ...row, relations: relationScopeFor(config, row) };
    for (const [key, ast] of Object.entries(config?.derived || {})) {
      scope[key] = { __manatosExpressionAst: ast, value: row?.[key] ?? null };
    }
    return scope;
  };

  const sourceValue = (config, source, row, fallback = null) => {
    if (!source) return fallback;
    const evaluator = window.ManatOS?.expression;
    if (source.ast && evaluator?.evaluateAstWithScope) {
      try { return evaluator.evaluateAstWithScope(source.ast, scopeFor(config, row)); }
      catch (error) { console.warn('[ManatOS entry representation]', error); }
    }
    if (source.field) return row?.[source.field] ?? fallback;
    return fallback;
  };

  const directTypeField = (config, metadata) => {
    const source = config?.type;
    if (!source) return '';
    if (source.field) return String(source.field);
    const expression = String(source.expression || '').trim();
    return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(expression) && metadata?.fieldDefinition?.[expression]
      ? expression
      : '';
  };

  const relationTypeRow = (config, row) => {
    const expression = String(config?.type?.expression || '').trim();
    const key = /^relations\.([A-Za-z_$][A-Za-z0-9_$]*)\./.exec(expression)?.[1];
    return key ? relationScopeFor(config, row)?.[key] ?? null : null;
  };

  const resolve = (config, row, options = {}) => {
    const metadata = options.metadata || {};
    const typeField = directTypeField(config, metadata);
    const typeValue = sourceValue(config, config?.type, row, typeField ? row?.[typeField] : null);
    const typeMetadata = typeField ? metadata?.fieldDefinition?.[typeField] : null;
    const enumItem = Array.isArray(typeMetadata?.enumItems)
      ? typeMetadata.enumItems.find((item) => String(item?.value ?? '') === String(typeValue ?? ''))
      : null;
    const relationRow = relationTypeRow(config, row);
    const referenceRow = typeField && typeMetadata?.type === 'reference' && Array.isArray(config?.referenceData?.[typeField])
      ? config.referenceData[typeField].find((candidate) => String(candidate?.id ?? candidate?.value ?? '') === String(row?.[typeField] ?? ''))
      : relationRow;
    const typeIcon = normalizeIcon(enumItem?.icon ?? referenceRow?.__entryIcon ?? referenceRow?.icon ?? referenceRow?.__entityIcon);
    const entityIcon = normalizeIcon(options.entityIcon);
    const iconConfig = config?.icon || {};
    const mode = String(iconConfig.mode || (typeIcon ? 'composed' : 'entity'));
    const icons = mode === 'fixed'
      ? [normalizeIcon(iconConfig.icon)].filter(Boolean)
      : mode === 'type'
        ? [typeIcon].filter(Boolean)
        : mode === 'composed'
          ? [entityIcon, typeIcon].filter(Boolean)
          : [entityIcon].filter(Boolean);

    return {
      name: String(sourceValue(config, config?.name, row, options.fallbackName ?? '') ?? ''),
      typeValue,
      typeName: enumItem?.label ?? referenceRow?.label ?? referenceRow?.name ?? (typeValue == null ? null : String(typeValue)),
      typeIcon,
      typeField,
      icons,
      iconConfig,
    };
  };

  window.ManatOS = window.ManatOS || {};
  window.ManatOS.entryRepresentation = Object.freeze({ resolve, sourceValue, scopeFor });
})();
