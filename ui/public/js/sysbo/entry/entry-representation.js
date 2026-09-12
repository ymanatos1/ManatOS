(() => {
  'use strict';

  const normalizeIcon = (value) => {
    const text = value == null ? '' : String(value).trim();
    return text ? text.replace(/^bi-/, '') : null;
  };

  const relationRowFor = (config, row, relationshipKey) => {
    const definition = config?.relationships?.[relationshipKey];
    const fieldKey = String(definition?.field || '');
    if (!fieldKey) return null;
    const value = row?.[fieldKey];
    const candidates = config?.referenceData?.[fieldKey];
    return Array.isArray(candidates)
      ? candidates.find(
          (candidate) => String(candidate?.id ?? candidate?.value ?? '') === String(value ?? ''),
        ) || null
      : null;
  };

  const expressionSources = (config) => {
    const sources = new Set();
    for (const source of [config?.name, config?.type, config?.description, config?.status]) {
      if (typeof source?.expression === 'string' && source.expression)
        sources.add(source.expression);
    }
    for (const calculation of Object.values(config?.calculations || {})) {
      if (typeof calculation?.source === 'string' && calculation.source)
        sources.add(calculation.source);
    }
    return [...sources];
  };

  const prepare = async (config) => {
    const evaluator = window.ManatOS?.expression;
    if (!evaluator?.loadAstForSource) return;
    await Promise.all(
      expressionSources(config).map((source) => evaluator.loadAstForSource(source)),
    );
  };

  const sourceValue = (config, source, row, fallback = null, ownerPath = null) => {
    if (!source) return fallback;
    const evaluator = window.ManatOS?.expression;
    if (source.expression && ownerPath && evaluator?.evaluateAstAt) {
      try {
        const ast = evaluator.astForSource?.(source.expression) ?? null;
        if (ast) return evaluator.evaluateAstAt(ast, ownerPath);
      } catch (error) {
        console.warn('[ManatOS entry representation]', error);
      }
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
    return key ? relationRowFor(config, row, key) : null;
  };

  const resolve = (config, row, options = {}) => {
    const metadata = options.metadata || {};
    const typeField = directTypeField(config, metadata);
    const ownerPath = typeof options.ownerPath === 'string' ? options.ownerPath : null;
    const typeValue = sourceValue(
      config,
      config?.type,
      row,
      typeField ? row?.[typeField] : null,
      ownerPath,
    );
    const typeMetadata = typeField ? metadata?.fieldDefinition?.[typeField] : null;
    const enumItem = Array.isArray(typeMetadata?.enumItems)
      ? typeMetadata.enumItems.find((item) => String(item?.value ?? '') === String(typeValue ?? ''))
      : null;
    const relationRow = relationTypeRow(config, row);
    const referenceRow =
      typeField &&
      typeMetadata?.type === 'reference' &&
      Array.isArray(config?.referenceData?.[typeField])
        ? config.referenceData[typeField].find(
            (candidate) =>
              String(candidate?.id ?? candidate?.value ?? '') === String(row?.[typeField] ?? ''),
          )
        : relationRow;
    const typeIcon = normalizeIcon(
      enumItem?.icon ??
        referenceRow?.__entryIcon ??
        referenceRow?.icon ??
        referenceRow?.__entityIcon,
    );
    const entityIcon = normalizeIcon(options.entityIcon);
    const iconConfig = config?.icon || {};
    const mode = String(iconConfig.mode || (typeIcon ? 'composed' : 'entity'));
    const icons =
      mode === 'fixed'
        ? [normalizeIcon(iconConfig.icon)].filter(Boolean)
        : mode === 'type'
          ? [typeIcon].filter(Boolean)
          : mode === 'composed'
            ? [entityIcon, typeIcon].filter(Boolean)
            : [entityIcon].filter(Boolean);

    return {
      name: String(
        sourceValue(config, config?.name, row, options.fallbackName ?? '', ownerPath) ?? '',
      ),
      typeValue,
      typeName:
        enumItem?.label ??
        referenceRow?.label ??
        referenceRow?.name ??
        (typeValue == null ? null : String(typeValue)),
      typeIcon,
      typeField,
      icons,
      iconConfig,
    };
  };

  window.ManatOS = window.ManatOS || {};
  window.ManatOS.entryRepresentation = Object.freeze({ prepare, resolve, sourceValue });
})();
