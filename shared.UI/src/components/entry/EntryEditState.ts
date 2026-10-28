import { createUiFieldBehavior } from '../fields/registry.js';
import {
  allSysBOMetadata,
  allSysBOUIMetadata,
  enumItemsForField,
  evaluateExpression,
  calculateEntryAggregatePolicy,
  staticEntryFieldUx,
  resolveSysBOUIView,
  resolveMetadataText,
  type MetadataLanguage,
  type SysBOUIFieldOverrideMetadata,
  type SysBOFieldMetadata,
  type SysBOEnumItemMetadata,
  type ManatOSRuntimeRootContext,
} from '@manatos/shared';

export interface UiEntryFieldState {
  readonly visible: boolean;
  readonly editable: boolean;
  readonly required: boolean;
  readonly dirty: boolean;
  readonly valid: boolean;
  readonly issues: readonly string[];
}
export type UiEntryFieldsState = Readonly<Record<string, UiEntryFieldState>>;
export type UiEntryFieldOptions = Readonly<
  Record<string, readonly Readonly<{ value: string; label: string; icon?: string }>[]>
>;

function comparable(value: unknown): string {
  return JSON.stringify(value) ?? String(value);
}

/** Ephemeral EJS0-compatible evaluation facts; never copied into CTX. */
export function entryEvaluationScope(
  record: Readonly<Record<string, unknown>>,
  mode: string,
  permissions: Readonly<Record<string, boolean>>,
  options: UiEntryFieldOptions = {},
): Record<string, unknown> {
  const fields = Object.fromEntries(
    Object.entries(record).map(([name, value]) => [
      name,
      {
        value,
        option: options[name]?.find((item) => item.value === String(value)) ?? null,
        options: options[name] ?? [],
      },
    ]),
  );
  return { ...record, fields, mode, permissions };
}

/** One mechanism for subsystem enum references and entity field-declared options.
 * A declared enum is authoritative; missing/broken enum definitions never fall
 * back to unrelated inline values. This projection is never owned by #data.
 */
export function resolveEntryOptions(
  field: Pick<SysBOFieldMetadata, 'type' | 'sensitive' | 'enum' | 'enumItems' | 'enumValues'>,
  language: MetadataLanguage,
): readonly Readonly<{ value: string; label: string; icon?: string }>[] {
  if (field.sensitive || field.type !== 'enum') return [];
  const items = enumItemsForField(field);
  const declared: readonly SysBOEnumItemMetadata[] = field.enum
    ? items
    : items.length
      ? items
      : (field.enumValues ?? []).map((value) => ({ value, label: value }));
  return declared.map((item) => ({
    ...item, // Policy expressions need canonical enum traits such as canHaveParent.
    value: String(item.value),
    label: resolveMetadataText(item.label ?? String(item.value), language),
    ...(item.icon ? { icon: item.icon } : {}),
  }));
}

export function entryFieldOptions(
  entityKey: string,
  fieldKey: string,
  language: MetadataLanguage,
): readonly Readonly<{ value: string; label: string; icon?: string }>[] {
  const entity = allSysBOMetadata[entityKey as keyof typeof allSysBOMetadata];
  const definition = (
    entity?.fieldDefinition as Readonly<Record<string, SysBOFieldMetadata>> | undefined
  )?.[fieldKey];
  return definition ? resolveEntryOptions(definition, language) : [];
}

/** Convenience for expression-policy evaluation only; NEVER publish to #data. */
export function entryAvailableOptions(
  entityKey: string,
  language: MetadataLanguage,
): UiEntryFieldOptions {
  const entity = allSysBOMetadata[entityKey as keyof typeof allSysBOMetadata];
  if (!entity) return {};
  return Object.fromEntries(
    Object.entries(entity.fieldDefinition)
      .filter(([, definition]) => !definition.sensitive && definition.type === 'enum')
      .map(([field]) => [field, entryFieldOptions(entityKey, field, language)]),
  );
}

/** Recompute fields from the record; state is derived, never a second value authority. */
export function deriveEntryFieldState(
  entityKey: string,
  original: Readonly<Record<string, unknown>>,
  current: Readonly<Record<string, unknown>>,
  mode: 'edit' | 'view' | 'create',
  permissions: Readonly<Record<string, boolean>>,
  options: UiEntryFieldOptions = entryAvailableOptions(entityKey, 'EN'),
  evaluationRoot?: ManatOSRuntimeRootContext,
  viewKey?: string,
): {
  readonly fields: UiEntryFieldsState;
  readonly aggregate: ReturnType<typeof calculateEntryAggregatePolicy>;
} {
  const entity = allSysBOMetadata[entityKey as keyof typeof allSysBOMetadata];
  const ui = allSysBOUIMetadata[entityKey as keyof typeof allSysBOUIMetadata];
  if (!entity || !ui)
    return {
      fields: {},
      aggregate: calculateEntryAggregatePolicy({ mode, fieldDirty: false, fieldValid: true }),
    };
  const view = resolveSysBOUIView(ui, viewKey).metadata.record;
  const overrides: Readonly<Record<string, SysBOUIFieldOverrideMetadata>> = view.fieldOverrides;
  const scope = entryEvaluationScope(current, mode, permissions, options);
  const evaluateBool = (
    rule: boolean | Readonly<{ expression: string }> | undefined,
    fallback: boolean,
    field: string,
  ): boolean => {
    if (rule === undefined) return fallback;
    if (typeof rule === 'boolean') return rule;
    try {
      // EJS0 exposes selected enum-option traits as `principalType.option` while
      // preserving scalar `principalType` comparisons. Resolve only option paths
      // through the canonical fields projection; no duplicate enum state in CTX.
      const expression = rule.expression.replace(
        /\b([A-Za-z_$][\w$]*)\.option(?=\b)/g,
        (match, key: string, offset: number, source: string) =>
          Object.hasOwn(options, key) && source[offset - 1] !== '.'
            ? `fields.${key}.option`
            : match,
      );
      return (
        evaluateExpression(expression, evaluationRoot ?? scope, scope, {
          source: 'renderer',
          sourcePath: `entry.field.${field}`,
          purpose: 'resolve Entry field policy',
        }) === true
      );
    } catch {
      return false;
    }
  };
  const fields: Record<string, UiEntryFieldState> = {};
  const permitted =
    (mode === 'create' ? permissions['create'] === true : permissions['update'] === true) &&
    mode !== 'view' &&
    view.readOnly !== true;
  for (const [key, definition] of Object.entries(entity.fieldDefinition)) {
    if (definition.sensitive) continue;
    const override = overrides[key];
    const staticUx = staticEntryFieldUx(
      mode,
      definition.readOnly === true ||
        definition.generated === true ||
        (definition.applicationManaged === true &&
          definition.type !== 'picture' &&
          definition.type !== 'pictures') ||
        (!!definition.calculation && override?.editable === undefined) ||
        !permitted,
      override,
    );
    const visible = evaluateBool(override?.visible, staticUx.visible, key);
    // The registered Field decides editability; Entry only applies record policy.
    const behavior = createUiFieldBehavior(entityKey, key);
    const editable =
      permitted &&
      behavior.editable &&
      staticUx.editable &&
      evaluateBool(override?.editable, true, key);
    const value = current[key];
    const issues = [
      ...behavior.validate(value, editable && definition.required === true, options[key] ?? []),
    ];
    fields[key] = {
      visible,
      editable,
      required: definition.required === true,
      dirty: comparable(value) !== comparable(original[key]),
      valid: issues.length === 0,
      issues,
    };
  }
  const aggregate = calculateEntryAggregatePolicy({
    mode,
    fieldDirty: Object.values(fields).some((field) => field.dirty),
    fieldValid: Object.values(fields).every((field) => field.valid),
  });
  return { fields, aggregate };
}

/** Apply a declared readOnlyValue when an editable field becomes locked.
 * This pure pre-projection transition uses the existing CTX-derived policy state;
 * the caller remains the sole writer of #data.current.
 */
export function reconcileEntryReadOnlyValues(
  entityKey: string,
  original: Readonly<Record<string, unknown>>,
  beforeFields: UiEntryFieldsState,
  changed: Readonly<Record<string, unknown>>,
  mode: 'edit' | 'view' | 'create',
  permissions: Readonly<Record<string, boolean>>,
  root?: ManatOSRuntimeRootContext,
): Readonly<Record<string, unknown>> {
  const ui = allSysBOUIMetadata[entityKey as keyof typeof allSysBOUIMetadata];
  if (!ui) return changed;
  const overrides = {
    ...ui.record.fieldOverrides,
    ...ui.uiViews?.[ui.defaultUIView ?? 'main']?.record?.fieldOverrides,
  };
  const transitions = Object.entries(overrides).filter(
    ([key, override]) =>
      override && Object.hasOwn(override, 'readOnlyValue') && beforeFields[key]?.editable,
  );
  if (!transitions.length) return changed;
  const changedFields = deriveEntryFieldState(
    entityKey,
    original,
    changed,
    mode,
    permissions,
    undefined,
    root,
  ).fields;
  let result: Record<string, unknown> | undefined;
  for (const [key, override] of transitions) {
    if (
      changedFields[key]?.editable ||
      comparable(changed[key]) === comparable(override.readOnlyValue)
    )
      continue;
    result ??= { ...changed };
    result[key] = override.readOnlyValue;
  }
  return result ?? changed;
}
