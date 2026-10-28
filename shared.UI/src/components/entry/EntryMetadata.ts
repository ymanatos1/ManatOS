import { sortReferenceRecords } from './sort-reference-records.js';
import { entryEvaluationScope, entryFieldOptions } from './EntryEditState.js';
import { createUiFieldBehavior } from '../fields/registry.js';
import {
  allSysBOMetadata,
  evaluateExpression,
  evaluateExpressionAsync,
  projectCalculatedRecord,
  type ExpressionCapabilityDelegate,
  prepareEntryRepresentation,
  entryPhotoField,
  allSysBOUIMetadata,
  resolveMetadataText,
  type MetadataLanguage,
  type SysBOUITabContentMetadata,
  resolveSysBOUIView,
  type SysBOUIMetadata,
  type SysBOFieldType,
  type SysBOUIFieldRepresentation,
  relationshipForField,
} from '@manatos/shared';

/** UI metadata preserved through to both framework renderers. */
export type UiEntryLayoutItem =
  | {
      readonly kind: 'field';
      readonly layoutId: string;
      readonly field: string;
      readonly span: number;
      readonly label?: string;
      readonly representation?: SysBOUIFieldRepresentation;
      readonly relatedFields?: readonly string[];
    }
  | { readonly kind: 'break' | 'spacer'; readonly span: number; readonly layoutId: string }
  | {
      readonly kind: 'summary';
      readonly span: number;
      readonly layoutId: string;
      readonly fields: readonly string[];
    }
  | {
      readonly kind: 'collection';
      readonly span: number;
      readonly layoutId: string;
      readonly reference: string;
    }
  | {
      readonly kind: 'deferred';
      readonly layoutId: string;
      readonly span: number;
      readonly sourceKind: 'collection' | 'action' | 'component';
      readonly reference: string;
    }
  | {
      readonly kind: 'column' | 'inline';
      readonly layoutId: string;
      readonly span: number;
      readonly content: readonly UiEntryLayoutItem[];
    };

export interface UiEntryFieldPresentation {
  readonly entityKey: string;
  readonly field: string;
  readonly language: MetadataLanguage;
  readonly label: string;
  readonly type: SysBOFieldType;
  readonly required: boolean;
  readonly readOnly: boolean;
  readonly visible: boolean;
  readonly dirty: boolean;
  readonly valid: boolean;
  readonly issues: readonly string[];
  readonly options?: readonly Readonly<{ value: string; label: string; icon?: string }>[];
  readonly text: string;
  readonly value: unknown;
  readonly icon?: string;
  readonly layoutId?: string;
  readonly imageUrl?: string;
  readonly relatedEntityKey?: string;
  /** Host-projected, API-derived read capability for the referenced entity. */
  readonly canViewRelated?: boolean;
  readonly canCreateRelated?: boolean;
  readonly canEditRelated?: boolean;
  readonly relatedCatalogueStatus?: 'unavailable' | 'unauthorized' | 'partial';
  readonly relatedName?: string;
  readonly relatedIcons?: readonly string[];
  readonly relatedPhotoUrl?: string;
  readonly relatedCandidates?: readonly Readonly<{
    id: string;
    name: string;
    icons: readonly string[];
    photoUrl?: string;
    unavailable: boolean;
    unavailableReason?: string;
  }>[];
  readonly contextPath?: string;
}

export interface UiEntryTab {
  readonly layoutMode: 'form' | 'details' | 'summary' | 'component' | 'debug-calculations';
  readonly id: string;
  readonly label: string;
  readonly fields: readonly string[];
  readonly icon?: string;
  readonly layout: readonly UiEntryLayoutItem[];
}

/** Only metadata-declared fields enter the generic Entry presentation. */
function fieldsIn(
  content: readonly SysBOUITabContentMetadata[] | undefined,
  output: string[],
): void {
  for (const item of content ?? []) {
    if (item.kind === 'field') output.push(item.field);
    else if (item.kind === 'column' || item.kind === 'inline') fieldsIn(item.content, output);
  }
}

/** Preserve structural layout without interpreting dynamic expressions in the browser. */
function staticSpan(value: unknown, fallback = 12): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 12
    ? value
    : fallback;
}
function resolveLayout(
  content: readonly SysBOUITabContentMetadata[] | undefined,
  entity: { fieldDefinition: Record<string, unknown> },
  prefix = '',
  defaultRepresentation?: SysBOUIFieldRepresentation,
): UiEntryLayoutItem[] {
  const items: UiEntryLayoutItem[] = [];
  for (const [index, item] of (content ?? []).entries()) {
    const layoutId = `${prefix}${index}`;
    if (item.kind === 'field') {
      if (!Object.hasOwn(entity.fieldDefinition, item.field)) continue;
      const fieldSpec = entity.fieldDefinition[item.field] as { sensitive?: boolean } | undefined;
      if (fieldSpec?.sensitive) continue;
      items.push({
        kind: 'field',
        layoutId,
        field: item.field,
        span: staticSpan(item.span),
        ...(item.label ? { label: item.label } : {}),
        ...((item.representation ?? defaultRepresentation)
          ? { representation: item.representation ?? defaultRepresentation }
          : {}),
        ...(item.relatedFields ? { relatedFields: item.relatedFields } : {}),
      });
    } else if (item.kind === 'break' || item.kind === 'spacer') {
      items.push({
        kind: item.kind,
        layoutId,
        span: item.kind === 'break' ? 12 : staticSpan(item.span),
      });
    } else if (item.kind === 'column' || item.kind === 'inline') {
      items.push({
        kind: item.kind,
        layoutId,
        span: staticSpan(item.kind === 'column' ? item.span : undefined),
        content: resolveLayout(item.content, entity, `${layoutId}-`, defaultRepresentation),
      });
    } else if (item.kind === 'collection') {
      items.push({ kind: 'collection', layoutId, span: 12, reference: item.collection });
    } else if (item.kind === 'component' && item.component.key === 'collection-editor') {
      // EJS0's collection-editor uses the same related collection source; keep its
      // declared grid span and reuse the canonical collection data ownership.
      const source = item.component.options?.['sourceKey'];
      if (typeof source === 'string' && source.length)
        items.push({
          kind: 'collection',
          layoutId,
          span: staticSpan(item.span),
          reference: source,
        });
    } else if (item.kind === 'action' || item.kind === 'component') {
      // Retain the canonical content declaration and its CTX owner. Unsupported
      // operations are visibly unavailable, never silently dropped or made clickable.
      items.push({
        kind: 'deferred',
        layoutId,
        span: 12,
        sourceKind: item.kind,
        reference: item.kind === 'action' ? item.action : item.component.key,
      });
    }
  }
  return items;
}

/** Apply the host-independent calculated-record projection before deriving Entry labels. */
export async function uiEntryProjectRecord(
  entityKey: string,
  record: Readonly<Record<string, unknown>>,
  capabilityDelegate?: ExpressionCapabilityDelegate,
): Promise<Readonly<Record<string, unknown>>> {
  const entity = allSysBOMetadata[entityKey as keyof typeof allSysBOMetadata];
  if (!entity) return record;
  const fields = Object.entries(entity.fieldDefinition)
    .filter(([, field]) => !field.sensitive && field.calculation?.expression)
    .map(([key, field]) => ({ key, calculation: field.calculation }));
  return projectCalculatedRecord(record, fields, (expression, step) => {
    const scope = entryEvaluationScope(step.record, 'edit', {});
    const caller = {
      source: 'renderer' as const,
      sourcePath: `entry.${entityKey}.${step.field.key}`,
      purpose: 'project Entry calculated field',
    };
    return capabilityDelegate
      ? evaluateExpressionAsync(
          expression,
          {
            owner: 'browser-entry',
            root: scope,
            scope,
            capabilities: ['pure', 'clock', 'ctx'],
            capabilityDelegate,
          },
          caller,
        )
      : evaluateExpression(expression, scope, scope, caller);
  });
}

export function uiEntryCaption(
  entityKey: string,
  record: Readonly<Record<string, unknown>> | null,
  language: MetadataLanguage = 'EN',
): string {
  const entity = allSysBOMetadata[entityKey as keyof typeof allSysBOMetadata];
  if (!entity) return '';
  const entityLabel = resolveMetadataText(entity.label, language);
  const entityGenitive = resolveMetadataText(entity.labelForms?.genitive ?? entity.label, language);
  let name = '';
  if (record) {
    try {
      name = prepareEntryRepresentation(entity, null)(record, { language }).name.trim();
    } catch {
      name = String(record[entity.primaryField] ?? '').trim();
    }
  }
  const template = resolveMetadataText(
    name ? '@CM.EditEntryCaption' : '@CM.EditEntryCaptionEmpty',
    language,
  );
  return template.replace(/\{(entity|entityGenitive|name)\}/g, (_match, key: string) =>
    key === 'entity' ? entityLabel : key === 'entityGenitive' ? entityGenitive : name,
  );
}

export function uiEntryFieldPresentation(
  entityKey: string,
  field: string,
  value: unknown,
  language: MetadataLanguage,
  labelOverride?: string,
  recordId?: string,
  references?: Readonly<Record<string, readonly Readonly<Record<string, unknown>>[]>>,
  state?: Readonly<{
    visible: boolean;
    editable: boolean;
    dirty: boolean;
    valid: boolean;
    issues: readonly string[];
  }>,
  options?: readonly Readonly<{ value: string; label: string }>[],
  catalogueStatus?: Readonly<Record<string, 'unavailable' | 'unauthorized' | 'partial'>>,
): UiEntryFieldPresentation | null {
  const entity = allSysBOMetadata[entityKey as keyof typeof allSysBOMetadata];
  const metadata = (
    entity?.fieldDefinition as
      | Record<
          string,
          {
            type: SysBOFieldType;
            label?: string;
            required?: boolean;
            readOnly?: boolean;
            sensitive?: boolean;
            inverseRelationship?: Readonly<{ objectKey: string; relationship: string }>;
          }
        >
      | undefined
  )?.[field];
  if (!metadata || metadata.sensitive) return null;
  const primitive =
    value === null || value === undefined
      ? ''
      : typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
        ? String(value)
        : '';
  // Field behavior remains the canonical formatter (enums, dates, phone, references).
  // Never turn a picture descriptor into JSON text.
  const text = metadata.type === 'picture' || metadata.type === 'pictures' ? '' : primitive;
  const relationship = entity ? relationshipForField(entity, field) : null;
  const relatedEntity =
    relationship?.relationship.references.objectKey ?? metadata.inverseRelationship?.objectKey;
  const relatedRow =
    relatedEntity && value !== null && value !== undefined
      ? references?.[relatedEntity]?.find(
          (row) => String(row.id ?? '').toLowerCase() === String(value).toLowerCase(),
        )
      : undefined;
  const relatedCandidates =
    relatedEntity && metadata.type === 'reference'
      ? sortReferenceRecords(references?.[relatedEntity] ?? []).flatMap((record) => {
          const availability = record.__referenceFieldAvailability;
          if (
            !availability ||
            typeof availability !== 'object' ||
            Array.isArray(availability) ||
            !Object.hasOwn(availability, field)
          )
            return [];
          const id = String(record.id ?? '');
          const target = allSysBOMetadata[relatedEntity as keyof typeof allSysBOMetadata];
          if (
            !target ||
            !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
          )
            return [];
          let name: string;
          let icons: string[];
          let photo: unknown;
          try {
            const representation = prepareEntryRepresentation(target, null)(record, { language });
            name = representation.name || id;
            icons = representation.icons
              .map((icon) => icon.replace(/^bi-/, ''))
              .filter((icon) => /^[a-z][a-z0-9-]*$/.test(icon));
            photo = representation.photo;
          } catch {
            name = String(record.name ?? id);
            icons = [];
          }
          const photoField = entryPhotoField(target);
          const photoUrl =
            photoField && photo && typeof photo === 'object' && !Array.isArray(photo)
              ? `/_manatos/auth/resources/picture/${encodeURIComponent(relatedEntity)}/${encodeURIComponent(id)}/${encodeURIComponent(photoField)}?variant=thumbnail&revision=${encodeURIComponent(String((photo as Readonly<Record<string, unknown>>).revision ?? ''))}`
              : undefined;
          return [
            {
              id,
              name,
              icons,
              ...(photoUrl ? { photoUrl } : {}),
              unavailable: (availability as Record<string, unknown>)[field] !== true,
              ...((record.__referenceFieldDisabledReason as Record<string, unknown> | undefined)?.[
                field
              ] === 'current-record'
                ? { unavailableReason: language === 'EL' ? 'Τρέχουσα εγγραφή' : 'Current record' }
                : (record.__referenceFieldDisabledReason as Record<string, unknown> | undefined)?.[
                      field
                    ] === 'already-linked'
                  ? { unavailableReason: language === 'EL' ? 'Ήδη συνδεδεμένη' : 'Already linked' }
                  : (
                        record.__referenceFieldDisabledReason as Record<string, unknown> | undefined
                      )?.[field] === 'catalogue-unavailable'
                    ? {
                        unavailableReason:
                          language === 'EL'
                            ? 'Απαιτείται έλεγχος μέσω λίστας'
                            : 'Browse list to verify eligibility',
                      }
                    : {}),
            },
          ];
        })
      : undefined;
  let relatedName: string | undefined;
  let relatedIcons: readonly string[] | undefined;
  let relatedPhotoUrl: string | undefined;
  if (relatedEntity && relatedRow) {
    const target = allSysBOMetadata[relatedEntity as keyof typeof allSysBOMetadata];
    if (target) {
      try {
        const display = prepareEntryRepresentation(target, null)(relatedRow, { language });
        relatedName = display.name;
        relatedIcons = display.icons
          .map((icon) => icon.replace(/^bi-/, ''))
          .filter((icon) => /^[a-z][a-z0-9-]*$/.test(icon));
        const photoField = entryPhotoField(target);
        const photo = display.photo;
        const referenceId = String(relatedRow.id ?? '');
        if (
          photoField &&
          photo &&
          typeof photo === 'object' &&
          !Array.isArray(photo) &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(referenceId)
        ) {
          relatedPhotoUrl = `/_manatos/auth/resources/picture/${encodeURIComponent(relatedEntity)}/${encodeURIComponent(referenceId)}/${encodeURIComponent(photoField)}?variant=thumbnail&revision=${encodeURIComponent(String((photo as Readonly<Record<string, unknown>>).revision ?? ''))}`;
        }
      } catch {
        relatedName = String(relatedRow.name ?? relatedRow.id ?? '');
      }
    }
  }
  const imageUrl =
    metadata.type === 'picture' &&
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    recordId &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(recordId)
      ? `/_manatos/auth/resources/picture/${encodeURIComponent(entityKey)}/${encodeURIComponent(recordId)}/${encodeURIComponent(field)}?variant=thumbnail&revision=${encodeURIComponent(String((value as Record<string, unknown>).revision ?? ''))}`
      : undefined;
  return {
    entityKey,
    field,
    language,
    label: resolveMetadataText(labelOverride ?? metadata.label ?? field, language),
    type: metadata.type,
    required: metadata.required === true,
    readOnly: state ? !state.editable : true,
    visible: state?.visible ?? true,
    dirty: state?.dirty ?? false,
    valid: state?.valid ?? true,
    issues: state?.issues ?? [],
    ...(metadata.type === 'enum'
      ? { options: options ?? entryFieldOptions(entityKey, field, language) }
      : {}),
    text,
    value,
    ...(imageUrl ? { imageUrl } : {}),
    ...(relatedEntity && metadata.type === 'reference' ? { relatedEntityKey: relatedEntity } : {}),
    ...(relatedEntity && catalogueStatus?.[relatedEntity]
      ? { relatedCatalogueStatus: catalogueStatus[relatedEntity] }
      : {}),
    ...(relatedName ? { relatedName } : {}),
    ...(relatedIcons?.length ? { relatedIcons } : {}),
    ...(relatedPhotoUrl ? { relatedPhotoUrl } : {}),
    ...(relatedCandidates ? { relatedCandidates } : {}),
  };
}

/** Renderer-neutral EJS0-style read-only representation for a Field occurrence.
 * The represented value is derived from the same canonical Entry record in both
 * clients; native adapters cannot interpret field types independently. */
export function uiEntryReadOnlyRepresentation(
  field: UiEntryFieldPresentation,
  requested: SysBOUIFieldRepresentation,
  record: Readonly<Record<string, unknown>> | null = null,
  relatedFields: readonly string[] = [],
): Readonly<{
  kind: SysBOUIFieldRepresentation;
  text: string;
  href?: string;
  imageUrl?: string;
}> {
  const kind =
    requested === 'summary'
      ? field.type === 'boolean' || field.type === 'enum'
        ? 'badge'
        : field.type === 'reference'
          ? 'entry-link'
          : 'summary'
      : requested;
  const raw = field.value;
  const selected = field.options?.find((option) => option.value === String(raw));
  const value =
    field.type === 'boolean'
      ? raw === true
        ? field.language === 'EL'
          ? 'Ενεργό'
          : 'Enabled'
        : field.language === 'EL'
          ? 'Ανενεργό'
          : 'Disabled'
      : field.type === 'reference'
        ? (field.relatedName ?? field.text)
        : (selected?.label ?? field.text);
  const text =
    kind === 'period' && relatedFields.length
      ? [value, ...relatedFields.map((key) => String(record?.[key] ?? '—'))].join(' – ')
      : value || '—';
  const linkedId = field.type === 'reference' ? raw : record?.['id'];
  const identity =
    typeof linkedId === 'string' && /^[0-9a-f-]{36}$/i.test(linkedId) ? linkedId : null;
  const entity = field.type === 'reference' ? field.relatedEntityKey : field.entityKey;
  return {
    kind,
    text,
    ...(kind === 'portrait' && field.imageUrl ? { imageUrl: field.imageUrl } : {}),
    ...(kind === 'entry-link' && identity && entity && /^[a-zA-Z][a-zA-Z0-9-]*$/.test(entity)
      ? { href: `/bo/${encodeURIComponent(entity)}/${encodeURIComponent(identity)}` }
      : {}),
  };
}

export interface UiEntryFieldTool {
  readonly id:
    | 'copy'
    | 'revert'
    | 'inspect-ctx'
    | 'trim'
    | 'clear'
    | 'zero'
    | 'today'
    | 'now'
    | 'duration-zero'
    | 'view'
    | 'edit'
    | 'add'
    | 'select';
  readonly icon: string;
  readonly label: string;
  readonly enabled: boolean;
  readonly visible?: boolean;
}

/**
 * Field tools follow each concrete registered Field's capability contract.
 * The Entry Surface owns mutation; tools supply availability and native labels.
 */
export function uiEntryFieldTools(
  field: UiEntryFieldPresentation,
  options: { inspectCtx?: boolean } = {},
): readonly UiEntryFieldTool[] {
  const capabilities = createUiFieldBehavior(field.entityKey, field.field).control.tools;
  const label = (key: string): string => resolveMetadataText(`@CM.${key}`, field.language);
  const selected = field.value !== null && field.value !== undefined && field.value !== '';
  const related = field.type === 'reference' && Boolean(field.relatedEntityKey);
  const definitions: Readonly<Record<UiEntryFieldTool['id'], UiEntryFieldTool>> = {
    copy: { id: 'copy', icon: 'copy', label: label('FieldToolCopy'), enabled: true },
    revert: {
      id: 'revert',
      icon: 'arrow-counterclockwise',
      label: label('FieldToolRevert'),
      enabled: field.dirty && !field.readOnly,
    },
    'inspect-ctx': {
      id: 'inspect-ctx',
      icon: 'bug',
      label: label('FieldToolInspect'),
      enabled: true,
    },
    trim: {
      id: 'trim',
      icon: 'text-indent-left',
      label: label('FieldToolTrim'),
      enabled: !field.readOnly,
    },
    clear: {
      id: 'clear',
      icon: field.type === 'reference' ? 'x-circle' : 'eraser',
      label:
        field.type === 'reference'
          ? label('FieldToolClearSelection')
          : field.type === 'duration'
            ? label('FieldToolClearDuration')
            : label('FieldToolClearValue'),
      enabled: !field.readOnly,
    },
    zero: { id: 'zero', icon: '0-circle', label: label('FieldToolZero'), enabled: !field.readOnly },
    today: {
      id: 'today',
      icon: 'calendar-check',
      label: field.type === 'datetime' ? label('FieldToolTodayMidnight') : label('FieldToolToday'),
      enabled: !field.readOnly,
    },
    now: { id: 'now', icon: 'clock', label: label('FieldToolNow'), enabled: !field.readOnly },
    view: {
      id: 'view',
      icon: 'eye',
      label: label('FieldToolView'),
      enabled: selected && field.canViewRelated === true,
    },
    edit: {
      id: 'edit',
      icon: 'pencil-square',
      label: label('FieldToolEdit'),
      enabled: selected && field.canEditRelated === true,
    },
    add: {
      id: 'add',
      icon: 'plus-circle',
      label: label('FieldToolAdd'),
      enabled: !field.readOnly && field.canCreateRelated === true,
      visible: field.canCreateRelated !== false,
    },
    select: {
      id: 'select',
      icon: 'database-check',
      label: label('FieldToolSelect'),
      enabled: !field.readOnly && field.canViewRelated === true,
    },
    'duration-zero': {
      id: 'duration-zero',
      icon: '0-circle',
      label: label('FieldToolZeroDuration'),
      enabled: !field.readOnly,
    },
  };
  // EJS0 renders Inspect only for developer tools. It never shows the action
  // permanently disabled in an ordinary Field Tools menu.
  const common = capabilities.filter(
    (id) => id !== 'clear' && (id !== 'inspect-ctx' || options.inspectCtx === true),
  );
  const actions: readonly UiEntryFieldTool['id'][] = related
    ? [
        ...common,
        'view',
        ...(field.canEditRelated === true ? ['edit' as const] : []),
        'add',
        'select',
        ...(!field.required && capabilities.includes('clear') ? ['clear' as const] : []),
      ]
    : capabilities.filter((id) => id !== 'inspect-ctx' || options.inspectCtx === true);
  return actions.map((id) => definitions[id]);
}

export interface UiEntryVisibilityContext {
  readonly mode: 'edit' | 'view' | 'create';
  readonly permissions: Readonly<Record<string, boolean>>;
  readonly record?: Readonly<Record<string, unknown>> | null;
  readonly viewKey?: string;
}

/** Evaluate declarative visibility through the canonical restricted evaluator. */
function entryTabVisible(
  tab: { id: string; visible?: boolean | { expression: string } },
  context: UiEntryVisibilityContext,
): boolean {
  if (tab.visible === undefined) return true;
  if (typeof tab.visible === 'boolean') return tab.visible;
  const scope = entryEvaluationScope(context.record ?? {}, context.mode, context.permissions);
  try {
    return (
      evaluateExpression(tab.visible.expression, scope, scope, {
        source: 'renderer',
        sourcePath: `entry.tabs.${tab.id}.visible`,
        purpose: 'evaluate Entry tab visibility',
      }) === true
    );
  } catch {
    return false; // fail closed, never elevate visibility when evaluation fails
  }
}

export function uiEntryTabs(
  entityKey: string,
  language: MetadataLanguage = 'EN',
  context: UiEntryVisibilityContext = { mode: 'view', permissions: {} },
): UiEntryTab[] {
  const entity = allSysBOMetadata[entityKey as keyof typeof allSysBOMetadata];
  const ui = allSysBOUIMetadata[entityKey as keyof typeof allSysBOUIMetadata] as
    SysBOUIMetadata | undefined;
  if (!entity || !ui) return [];
  const tabs = resolveSysBOUIView(ui, context.viewKey).metadata.record.tabs;
  const result = tabs
    .filter((tab) => entryTabVisible(tab, context))
    .sort((a, b) => a.order - b.order)
    .map((tab) => {
      const fields: string[] = [];
      fieldsIn(tab.content, fields);
      return {
        id: tab.id,
        layoutMode: tab.layout ?? 'form',
        label: resolveMetadataText(tab.label, language),
        ...(tab.icon && /^[a-z0-9-]+$/i.test(tab.icon) ? { icon: tab.icon } : {}),
        fields: [...new Set(fields)].filter(
          (field) =>
            Object.hasOwn(entity.fieldDefinition, field) &&
            !entity.fieldDefinition[field]?.sensitive,
        ),
        layout:
          tab.layout === 'summary'
            ? [
                {
                  kind: 'summary' as const,
                  layoutId: `summary-${tab.id}`,
                  span: 12,
                  fields: [...new Set(fields)].filter(
                    (field) =>
                      Object.hasOwn(entity.fieldDefinition, field) &&
                      !entity.fieldDefinition[field]?.sensitive,
                  ),
                },
                ...resolveLayout(tab.content, entity, '', tab.representation).filter(
                  (item) => item.kind === 'collection',
                ),
              ]
            : resolveLayout(tab.content, entity, '', tab.representation),
      };
    });
  return result.length
    ? result
    : [
        {
          id: 'general',
          layoutMode: 'form' as const,
          label: language === 'EL' ? 'Γενικά' : 'General',
          fields: [entity.primaryField],
          layout: [{ kind: 'field', layoutId: '0', field: entity.primaryField, span: 12 }],
        },
      ];
}

export function uiEntryFieldLabel(
  entityKey: string,
  field: string,
  language: MetadataLanguage,
): string {
  const entity = allSysBOMetadata[entityKey as keyof typeof allSysBOMetadata];
  const fieldSpec = (entity?.fieldDefinition as Record<string, { label?: string }> | undefined)?.[
    field
  ];
  return fieldSpec?.label ? resolveMetadataText(fieldSpec.label, language) : field;
}
