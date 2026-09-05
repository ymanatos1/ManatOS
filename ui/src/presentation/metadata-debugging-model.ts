/**
 * Framework-neutral metadata Debugging model builder.
 *
 * This module deliberately owns expression discovery, provenance grouping and
 * hierarchical display-row construction outside EJS. The current server-rendered
 * UI is only one consumer; Apps Designer/Playground can reuse the same model.
 *
 * The types below are intentionally structural rather than concrete SysBO entity
 * types. The debugger needs to inspect canonical metadata, UI metadata and their
 * compiled mirrors, including forward-compatible/provenance properties which are
 * not all part of one single public metadata interface. Keeping those boundaries
 * typed as small inspectable shapes avoids `any` while preserving that flexibility.
 */

type UnknownRecord = Readonly<Record<string, unknown>>;

type DebugFieldStateProperty =
  | 'visible'
  | 'editable'
  | 'readOnly'
  | 'readonly'
  | 'required'
  | 'nullable'
  | 'enabled'
  | 'disabled';

interface DebugExpressionNode extends UnknownRecord {
  expression: string;
}

interface DebugCalculation extends UnknownRecord {
  expression?: string;
}

interface DebugFieldMetadata extends UnknownRecord {
  calculation?: DebugCalculation;
  inheritedFrom?: unknown;
}

interface DebugCanonicalMetadata extends UnknownRecord {
  fieldDefinition?: Readonly<Record<string, DebugFieldMetadata>>;
}

interface DebugTabMetadata extends UnknownRecord {
  id?: unknown;
  visible?: unknown;
}

interface DebugActionMetadata extends UnknownRecord {
  visible?: unknown;
  enabled?: unknown;
  disabledReason?: unknown;
}

interface DebugRelatedFieldMetadata extends UnknownRecord {
  expression?: unknown;
  presentation?: unknown;
}

interface DebugRelatedCollectionMetadata extends UnknownRecord {
  entityKey?: unknown;
  sourceKey?: unknown;
  fields?: Readonly<Record<string, DebugRelatedFieldMetadata>>;
}

interface DebugUIRecordMetadata extends UnknownRecord {
  tabs?: readonly DebugTabMetadata[];
  entryActions?: Readonly<Record<string, DebugActionMetadata>>;
  fieldOverrides?: Readonly<Record<string, UnknownRecord>>;
  relatedCollections?: Readonly<Record<string, DebugRelatedCollectionMetadata>>;
}

interface DebugUIMetadata extends UnknownRecord {
  record?: DebugUIRecordMetadata;
}

export interface MetadataDebuggingModelInput {
  debuggingTabEnabled: boolean;
  metadata: DebugCanonicalMetadata;
  metadataUI: DebugUIMetadata;
  compiledEntityContext: unknown;
  compiledEntityContextName: string | null;
  compiledUIRecord: unknown;
  ctxFields: unknown;
  ctxValue: (key: string) => unknown;
  dynamicUIValue: (value: unknown, scope: unknown, caller: UnknownRecord) => unknown;
  overrides: Readonly<Record<string, UnknownRecord>>;
  relatedCollections: Readonly<Record<string, DebugRelatedCollectionMetadata>>;
  relatedMetadataRegistry: Readonly<Record<string, DebugCanonicalMetadata>>;
  pageRelatedData: Readonly<Record<string, unknown>>;
  collectionValue: (
    row: unknown,
    collectionKey: string,
    collection: DebugRelatedCollectionMetadata,
    fieldKey: string,
    field: DebugRelatedFieldMetadata,
  ) => Readonly<{ raw?: unknown }>;
  relatedExpressionScope: (row: unknown, relatedMetadata: DebugCanonicalMetadata | undefined) => unknown;
  entryContextPath?: string;
}

export interface MetadataDebuggingRow {
  group: string;
  subgroup: string | null;
  detailGroup: string | null;
  name: string;
  formula: string;
  value: string;
  ast: unknown;
  definitionPath: string | null;
  valuePath: string | null;
}

export type MetadataDebuggingDisplayRow =
  | Readonly<{ type: 'group' | 'subgroup' | 'detail'; label: string }>
  | Readonly<{ type: 'path'; label: string; depth: number }>
  | Readonly<{ type: 'value'; row: MetadataDebuggingRow; displayName: string }>;

export interface MetadataDebuggingModel {
  entityDebuggingDisplayRows: MetadataDebuggingDisplayRow[];
  uiDebuggingDisplayRows: MetadataDebuggingDisplayRow[];
}

const asRecord = (value: unknown): UnknownRecord | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : null;

const recordChild = (value: unknown, key: string): unknown => asRecord(value)?.[key];

const valueAtPath = (value: unknown, path: readonly (string | number)[]): unknown => {
  let current = value;
  for (const segment of path) {
    if (typeof segment === 'number') {
      if (!Array.isArray(current)) return undefined;
      current = current[segment];
      continue;
    }
    current = recordChild(current, segment);
  }
  return current;
};

const compiledAstAt = (value: unknown, path: readonly (string | number)[]): unknown =>
  recordChild(valueAtPath(value, path), 'ast') ?? null;

const debugValueText = (value: unknown): string => {
  // Debugging displays raw evaluator values rather than presentation labels.
  // Keeping null/undefined/empty-string distinct is important when inspecting
  // conditional calculations such as Root Principal.
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (value === '') return "''";
  if (Array.isArray(value)) {
    return value.length
      ? `[ ${value.map((entry) => debugValueText(entry)).join(', ')} ]`
      : '[]';
  }
  if (typeof value === 'string') return `'${value.replaceAll("'", "\\'")}'`;
  if (typeof value === 'object') {
    try { return JSON.stringify(value); } catch { return String(value); }
  }
  return String(value);
};

const expressionOf = (value: unknown): string | null => {
  const expression = asRecord(value)?.expression;
  return typeof expression === 'string' && expression.length > 0 ? expression : null;
};

const stringProperty = (value: unknown, key: string): string | null => {
  const candidate = asRecord(value)?.[key];
  return typeof candidate === 'string' ? candidate : null;
};


/**
 * Build the flat Debugging rows for a calculated CTX field collection.
 *
 * Purpose-built pages such as Account do not have canonical entry/UI metadata
 * to feed through buildMetadataDebuggingModel(), but they should still reuse
 * the same raw-value formatting and display-row contract rather than recreate
 * debugger presentation logic in EJS.
 */
export function buildCalculatedContextDebuggingRows(
  fields: unknown,
  valueForField: (key: string) => unknown,
  contextPath: string,
): MetadataDebuggingDisplayRow[] {
  const record = asRecord(fields);
  if (!record) return [];

  return Object.entries(record)
    .filter(([, field]) => typeof asRecord(field)?.expression === 'string')
    .map(([name, field]) => ({
      type: 'value' as const,
      displayName: name,
      row: {
        group: 'CTX',
        subgroup: null,
        detailGroup: null,
        name,
        formula: String(asRecord(field)?.expression ?? ''),
        value: debugValueText(valueForField(name)),
        ast: asRecord(field)?.ast ?? null,
        definitionPath: `${contextPath}.${name}`,
        valuePath: `${contextPath}.${name}`,
      },
    }));
}

export function buildMetadataDebuggingModel(input: MetadataDebuggingModelInput): MetadataDebuggingModel {
  const {
    debuggingTabEnabled, metadata, metadataUI, compiledEntityContext, compiledEntityContextName, compiledUIRecord,
    ctxFields, ctxValue, dynamicUIValue, overrides, relatedCollections,
    relatedMetadataRegistry, pageRelatedData, collectionValue, relatedExpressionScope, entryContextPath = 'ctx.page.page',
  } = input;

  const debuggingRows: MetadataDebuggingRow[] = [];


  /*
   * `detailGroup` is optional provenance/classification beneath the semantic
   * category/subcategory. This lets the debugger distinguish values declared
   * by the entity, inherited values (when metadata exposes that provenance),
   * and UI-only calculated values without knowing any concrete SysBO.
   */
  const addDebugRow = (
    group: string,
    subgroup: string | null,
    name: string,
    formula: unknown,
    value: unknown,
    ast: unknown = null,
    detailGroup: string | null = null,
    definitionPath: string | null = null,
    valuePath: string | null = null,
  ) => {
    if (!debuggingTabEnabled || typeof formula !== 'string' || !formula) return;
    debuggingRows.push({
      group,
      subgroup,
      detailGroup,
      name,
      formula,
      value: debugValueText(value),
      ast,
      definitionPath,
      valuePath,
    });
  };

  const collectDynamicExpressions = (
    group: string,
    subgroup: string | null,
    prefix: string,
    source: unknown,
    compiled: unknown,
    scope: unknown = ctxFields,
    detailGroup: string | null = null,
  ) => {
    const sourceRecord = asRecord(source);
    if (!sourceRecord) return;

    for (const [key, child] of Object.entries(sourceRecord)) {
      const name = prefix ? `${prefix}.${key}` : key;
      const childExpression = expressionOf(child);
      if (childExpression) {
        const caller = {
          source: 'debugging-tab',
          sourcePath: name,
          targetPath: name,
          purpose: 'inspect calculated property',
        } as const;
        const debugValue = Array.isArray(scope)
          ? scope.map((currentScope) => dynamicUIValue(child, currentScope, caller))
          : dynamicUIValue(child, scope, caller);

        addDebugRow(
          group,
          subgroup,
          name,
          childExpression,
          debugValue,
          Array.isArray(scope) ? null : compiledAstAt(compiled, [key]),
          detailGroup,
        );
        continue;
      }

      if (asRecord(child)) {
        collectDynamicExpressions(
          group,
          subgroup,
          name,
          child,
          recordChild(compiled, key),
          scope,
          detailGroup,
        );
      }
    }
  };

  if (debuggingTabEnabled) {
    /*
     * ENTITY is reserved for calculations belonging to the entity itself,
     * rather than to one of its fields. This scan deliberately excludes field
     * collections; they are classified beneath ENTITY FIELDS below.
     */
    const entityMetadataForDebug = Object.fromEntries(
      Object.entries(metadata).filter(([key]) => key !== 'fieldDefinition'),
    );
    collectDynamicExpressions(
      'ENTITY',
      null,
      '',
      entityMetadataForDebug,
      recordChild(compiledEntityContext, 'metadata'),
      ctxFields,
    );

    /*
     * Renderable calculated values are canonical fieldDefinition entries. The
     * normalized form architecture therefore has no parallel "UI-defined field"
     * catalogue. Provenance for canonical field calculations is limited to the
     * declared/inherited distinction below; presentation-only UI expressions are
     * inventoried separately under the UI group.
     */

    /*
     * Canonical field calculations are value-source metadata on ordinary typed
     * fields. Read-only authoritative calculations and editable assisted
     * calculations therefore share one debugging path. Keep
     * these visible as FIELD CALCULATIONS so DEBUG reflects the same canonical
     * metadata that drives the metadata-form/evaluator runtime, without knowing any specific component or
     * entity such as License/date-duration-range.
     */
    for (const [fieldKey, fieldMetadata] of Object.entries(metadata.fieldDefinition ?? {})) {
      const calculationExpression = expressionOf(fieldMetadata.calculation);
      if (!calculationExpression) continue;
      addDebugRow(
        'ENTITY FIELDS',
        'FIELD CALCULATIONS',
        `${fieldKey}.calculation`,
        calculationExpression,
        ctxValue(fieldKey),
        compiledAstAt(compiledEntityContext, ['metadata', 'fieldDefinition', fieldKey, 'calculation']),
        fieldMetadata.inheritedFrom ? 'INHERITED FIELDS' : 'DECLARED FIELDS',
        compiledEntityContextName
          ? `ctx.entities.${compiledEntityContextName}.metadata.fieldDefinition.${fieldKey}.calculation.expression`
          : null,
        `${entryContextPath}.entry.${fieldKey}`,
      );
    }

    /*
     * Field-state calculations belong under FIELD OTHER. This separates the
     * field's calculated value from calculations controlling visibility,
     * editability/read-only state, required/nullable state, etc.
     */
    const fieldStatePropertyNames = new Set<DebugFieldStateProperty>([
      'visible', 'editable', 'readOnly', 'readonly', 'required', 'nullable', 'enabled', 'disabled',
    ]);
    for (const [fieldKey, fieldMetadata] of Object.entries(metadata.fieldDefinition ?? {})) {
      for (const propertyName of fieldStatePropertyNames) {
        const property = fieldMetadata[propertyName];
        const expression = expressionOf(property);
        if (!expression) continue;
        addDebugRow(
          'ENTITY FIELDS',
          'FIELD OTHER',
          `fieldDefinition.${fieldKey}.${propertyName}`,
          expression,
          dynamicUIValue(property, ctxFields, {
            source: 'debugging-tab',
            sourcePath: `fieldDefinition.${fieldKey}.${propertyName}`,
            targetPath: `fields.${fieldKey}.${propertyName}`,
            purpose: 'inspect calculated field property',
          }),
          compiledAstAt(compiledEntityContext, ['metadata', 'fieldDefinition', fieldKey, propertyName]),
          fieldMetadata.inheritedFrom ? 'INHERITED FIELDS' : 'DECLARED FIELDS',
        );
      }
    }

    for (const [fieldKey, override] of Object.entries(overrides)) {
      for (const propertyName of fieldStatePropertyNames) {
        const property = override[propertyName];
        const expression = expressionOf(property);
        if (!expression) continue;
        addDebugRow(
          'ENTITY FIELDS',
          'FIELD OTHER',
          `fieldOverrides.${fieldKey}.${propertyName}`,
          expression,
          dynamicUIValue(property, ctxFields, {
            source: 'debugging-tab',
            sourcePath: `fieldOverrides.${fieldKey}.${propertyName}`,
            targetPath: `fields.${fieldKey}.${propertyName}`,
            purpose: 'inspect calculated field property',
          }),
          compiledAstAt(compiledUIRecord, ['fieldOverrides', fieldKey, propertyName]),
          'UI OVERRIDES',
        );
      }
    }

    for (const [collectionKey, collection] of Object.entries(relatedCollections)) {
      const entityKey = stringProperty(collection, 'entityKey');
      if (!entityKey) continue;
      const relatedMetadata = relatedMetadataRegistry[entityKey];
      const sourceKey = stringProperty(collection, 'sourceKey') ?? collectionKey;
      const rows = Array.isArray(pageRelatedData[sourceKey]) ? pageRelatedData[sourceKey] : [];
      for (const [fieldKey, field] of Object.entries(collection.fields ?? {})) {
        const formula = expressionOf(field) ?? expressionOf(relatedMetadata?.fieldDefinition?.[fieldKey]?.calculation);
        if (!formula) continue;
        const values = rows.map((row) => collectionValue(row, collectionKey, collection, fieldKey, field).raw);
        addDebugRow(
          'RELATED ENTITY',
          null,
          `${collectionKey}.${fieldKey}`,
          formula,
          values,
          null,
        );
      }
    }

    /*
     * UI is one top-level group. TABS deliberately comes first, followed by
     * field presentation, related presentation and actions.
     */
    const tabs = metadataUI.record?.tabs ?? [];
    for (let index = 0; index < tabs.length; index += 1) {
      const tab = tabs[index];
      if (!tab) continue;
      const visibleExpression = expressionOf(tab.visible);
      const tabId = typeof tab.id === 'string' ? tab.id : String(index);
      if (!visibleExpression) continue;
      addDebugRow(
        'UI',
        'TABS',
        `tabs.${tabId}.visible`,
        visibleExpression,
        dynamicUIValue(tab.visible, ctxFields, {
          source: 'debugging-tab',
          sourcePath: `tabs.${tabId}.visible`,
          targetPath: `tabs.${tabId}.visible`,
          purpose: 'inspect tab visibility calculation',
        }),
        compiledAstAt(compiledUIRecord, ['tabs', index, 'visible']),
      );
    }

    /* Field-state properties were already classified under FIELD OTHER. */
    const uiFieldOverrides: Record<string, UnknownRecord> = {};
    for (const [fieldKey, override] of Object.entries(overrides)) {
      uiFieldOverrides[fieldKey] = Object.fromEntries(
        Object.entries(override).filter(([key]) => !fieldStatePropertyNames.has(key as DebugFieldStateProperty)),
      );
    }
    collectDynamicExpressions(
      'UI',
      'FIELDS',
      'fieldOverrides',
      uiFieldOverrides,
      recordChild(compiledUIRecord, 'fieldOverrides'),
    );

    for (const [collectionKey, collection] of Object.entries(relatedCollections)) {
      const entityKey = stringProperty(collection, 'entityKey');
      if (!entityKey) continue;
      const sourceKey = stringProperty(collection, 'sourceKey') ?? collectionKey;
      const rows = Array.isArray(pageRelatedData[sourceKey]) ? pageRelatedData[sourceKey] : [];
      const relatedMetadata = relatedMetadataRegistry[entityKey];
      const expressionScopes = rows.map((row) => relatedExpressionScope(row, relatedMetadata));
      for (const [fieldKey, field] of Object.entries(collection.fields ?? {})) {
        collectDynamicExpressions(
          'UI',
          'RELATED',
          `relatedCollections.${collectionKey}.fields.${fieldKey}.presentation`,
          field.presentation,
          valueAtPath(compiledUIRecord, ['relatedCollections', collectionKey, 'fields', fieldKey, 'presentation']),
          expressionScopes,
        );
      }
    }

    for (const [actionKey, action] of Object.entries(metadataUI.record?.entryActions ?? {})) {
      for (const propertyKey of ['visible', 'enabled', 'disabledReason'] as const) {
        const dynamicValue = action[propertyKey];
        const expression = expressionOf(dynamicValue);
        if (!expression) continue;

        addDebugRow(
          'UI',
          'ACTIONS',
          `entryActions.${actionKey}.${propertyKey}`,
          expression,
          dynamicUIValue(dynamicValue, ctxFields, {
            source: 'debugging-tab',
            sourcePath: `entryActions.${actionKey}.${propertyKey}`,
            targetPath: `entryActions.${actionKey}.${propertyKey}`,
            purpose: `inspect action ${propertyKey} calculation`,
          }),
          compiledAstAt(compiledUIRecord, ['entryActions', actionKey, propertyKey]),
        );
      }
    }
  }

  /*
   * Convert raw calculation rows into a compact hierarchy for display. Repeated
   * dotted prefixes become headings automatically while single-use prefixes stay
   * collapsed into the leaf label. No SysBO-specific path names are known here.
   */
  const buildDebuggingDisplayRows = (sourceRows: MetadataDebuggingRow[]): MetadataDebuggingDisplayRow[] => {
    const displayRows: MetadataDebuggingDisplayRow[] = [];
    const orderedUnique = <T,>(values: T[]): T[] => [...new Set(values)];
    const commonPrefixLength = (
      rows: readonly { row: MetadataDebuggingRow; segments: string[] }[],
      fromIndex: number,
    ) => {
      if (!rows.length) return fromIndex;
      let index = fromIndex;
      while (true) {
        const segment = rows[0]?.segments[index];
        if (segment === undefined) return index;
        if (rows.some((row) => row.segments[index] !== segment)) return index;
        index += 1;
      }
    };

    const appendDebugNameTree = (
      rows: readonly { row: MetadataDebuggingRow; segments: string[] }[],
      fromIndex = 0,
      depth = 1,
    ) => {
      if (!rows.length) return;

      if (rows.length === 1) {
        const only = rows[0];
        if (!only) return;
        displayRows.push({
          type: 'value',
          row: only.row,
          displayName: only.segments.slice(fromIndex).join('.'),
        });
        return;
      }

      const commonEnd = commonPrefixLength(rows, fromIndex);
      if (commonEnd > fromIndex) {
        const first = rows[0];
        if (!first) return;
        displayRows.push({
          type: 'path',
          label: first.segments.slice(fromIndex, commonEnd).join('.'),
          depth,
        });
        appendDebugNameTree(rows, commonEnd, depth + 1);
        return;
      }

      const bySegment = new Map<string, { row: MetadataDebuggingRow; segments: string[] }[]>();
      for (const row of rows) {
        const segment = row.segments[fromIndex] ?? '';
        const branch = bySegment.get(segment);
        if (branch) branch.push(row);
        else bySegment.set(segment, [row]);
      }

      for (const branchRows of bySegment.values()) {
        if (branchRows.length === 1) {
          const only = branchRows[0];
          if (!only) continue;
          displayRows.push({
            type: 'value',
            row: only.row,
            displayName: only.segments.slice(fromIndex).join('.'),
          });
        } else {
          appendDebugNameTree(branchRows, fromIndex, depth);
        }
      }
    };

    for (const group of orderedUnique(sourceRows.map((row) => row.group))) {
      displayRows.push({ type: 'group', label: group });
      const groupRows = sourceRows.filter((row) => row.group === group);

      for (const subgroup of orderedUnique(groupRows.map((row) => row.subgroup ?? ''))) {
        const subgroupRows = groupRows.filter((row) => (row.subgroup ?? '') === subgroup);
        if (subgroup) displayRows.push({ type: 'subgroup', label: subgroup });

        for (const detailGroup of orderedUnique(subgroupRows.map((row) => row.detailGroup ?? ''))) {
          const detailRows = subgroupRows.filter((row) => (row.detailGroup ?? '') === detailGroup);
          if (detailGroup) displayRows.push({ type: 'detail', label: detailGroup });

          appendDebugNameTree(
            detailRows.map((row) => ({ row, segments: row.name.split('.').filter(Boolean) })),
          );
        }
      }
    }

    return displayRows;
  };

  return {
    entityDebuggingDisplayRows: buildDebuggingDisplayRows(debuggingRows.filter((row) => row.group !== 'UI')),
    uiDebuggingDisplayRows: buildDebuggingDisplayRows(debuggingRows.filter((row) => row.group === 'UI')),
  };
}
