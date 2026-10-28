import {
  allSysBOMetadata,
  allSysBOUIMetadata,
  resolveMetadataText,
  resolveSysBOUIView,
  resolveSysBOUIRelatedCollection,
  type MetadataLanguage,
  type SysBOUIRelatedCollectionMetadata,
} from '@manatos/shared';
import { entryFieldOptions } from './EntryEditState.js';

/** Presentation-only action column for embedded related Lists. No entity field is created. */
export const UI_ENTRY_RELATED_VIEW_ACTION_FIELD = '__relatedView';
export function uiEntryRelatedViewActionColumn(language: MetadataLanguage) {
  return {
    field: UI_ENTRY_RELATED_VIEW_ACTION_FIELD,
    caption: language === 'EL' ? 'Προβολή' : 'View',
  };
}

/** Resolved collection contract shared by the two Entry hosts. No second data authority. */
export function uiEntryRelatedCollection(
  entityKey: string,
  key: string,
  viewKey?: string,
): SysBOUIRelatedCollectionMetadata | null {
  const ui = allSysBOUIMetadata[entityKey as keyof typeof allSysBOUIMetadata];
  if (!ui) return null;
  const collection = resolveSysBOUIView(ui, viewKey).metadata.record.relatedCollections?.[key];
  if (!collection) return null;
  const related =
    allSysBOUIMetadata[
      collection.relatedEntityKey ?? (collection.entityKey as keyof typeof allSysBOUIMetadata)
    ];
  return resolveSysBOUIRelatedCollection(collection, related);
}

/** Presentation-only formatter. System values use the browser's local timezone, not UTC input controls. */
export function uiEntrySummaryValue(
  value: unknown,
  format: string = 'text',
  language: MetadataLanguage = 'EN',
): string {
  if (value === undefined || value === null || value === '') return '—';
  if (format === 'date' || format === 'datetime' || format === 'datetime-elapsed') {
    const date = new Date(String(value));
    if (!Number.isFinite(date.getTime())) return '—';
    const locale = language === 'EL' ? 'el-GR' : 'en-US';
    const stamp = new Intl.DateTimeFormat(locale, {
      dateStyle: 'short',
      ...(format !== 'date' ? { timeStyle: 'short' as const } : {}),
    }).format(date);
    if (format !== 'datetime-elapsed') return stamp;
    const diff = Math.max(0, Date.now() - date.getTime());
    const amount = Math.floor(diff / 86400000);
    const elapsed =
      amount >= 1
        ? new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'short' }).format(
            -amount,
            'day',
          )
        : new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'short' }).format(
            -Math.max(1, Math.floor(diff / 3600000)),
            'hour',
          );
    return `${stamp} (${elapsed})`;
  }
  if (typeof value === 'object') {
    if ('name' in value && typeof value.name === 'string') return value.name;
    return '—';
  }
  return String(value);
}

export interface UiEntrySummaryRow {
  readonly field: string;
  readonly label: string;
  readonly text: string;
  readonly type: string;
}
export function uiEntrySummaryRows(
  entityKey: string,
  fields: readonly string[],
  record: Readonly<Record<string, unknown>> | null,
  language: MetadataLanguage,
  references: Readonly<Record<string, readonly Readonly<Record<string, unknown>>[]>> = {},
  viewKey?: string,
): readonly UiEntrySummaryRow[] {
  const metadata = allSysBOMetadata[entityKey as keyof typeof allSysBOMetadata];
  const ui = allSysBOUIMetadata[entityKey as keyof typeof allSysBOUIMetadata];
  if (!metadata || !ui || !record) return [];
  const overrides = resolveSysBOUIView(ui, viewKey).metadata.record.fieldOverrides;
  return fields.flatMap((key) => {
    const spec = metadata.fieldDefinition[key];
    if (!spec || spec.sensitive) return [];
    const format = overrides?.[key]?.presentation?.format ?? 'text';
    let value = record[key];
    if ((spec.type === 'reference' || format === 'name') && typeof value === 'string') {
      const actorId = value.toLowerCase();
      const match = Object.values(references)
        .flat()
        .find((row) => String(row.id ?? '').toLowerCase() === actorId);
      value = match?.name ?? match?.fullName ?? match?.fullname ?? value;
    }
    return [
      {
        field: key,
        label: resolveMetadataText(spec.label ?? key, language),
        text: uiEntrySummaryValue(value, format, language),
        type: spec.type,
      },
    ];
  });
}

export interface UiEntryRelatedView {
  readonly key: string;
  readonly label: string;
  readonly columns: readonly Readonly<{
    field: string;
    label: string;
    sourceField: string;
    format?: string;
  }>[];
  readonly layout: 'panel-list' | 'table-list';
}
export function uiEntryRelatedViews(
  collection: SysBOUIRelatedCollectionMetadata,
  language: MetadataLanguage,
): readonly UiEntryRelatedView[] {
  const views = collection.relatedListViews ?? {};
  const list = Object.keys(views).length
    ? Object.entries(views)
    : ([[collection.relatedListView ?? 'default', collection]] as const);
  return list.flatMap(([key, view]) => {
    const fields = view.fields ?? collection.fields;
    if (!fields) return [];
    const metadata =
      allSysBOMetadata[
        (collection.relatedEntityKey ?? collection.entityKey) as keyof typeof allSysBOMetadata
      ];
    return [
      {
        key,
        label: resolveMetadataText(view.label ?? key, language),
        layout: view.layout ?? collection.layout ?? 'table-list',
        columns: Object.entries(fields).map(([field, spec]) => ({
          field,
          sourceField: spec.sourceField ?? field,
          ...(spec.format ? { format: spec.format } : {}),
          label: resolveMetadataText(
            spec.label ?? metadata?.fieldDefinition[field]?.label ?? field,
            language,
          ),
        })),
      },
    ];
  });
}

export function uiEntryRelatedCell(
  collection: SysBOUIRelatedCollectionMetadata,
  row: Readonly<Record<string, unknown>>,
  field: string,
  language: MetadataLanguage,
  references: Readonly<Record<string, readonly Readonly<Record<string, unknown>>[]>> = {},
  sourceField: string = field,
  formatOverride?: string,
): string {
  const entityKey = collection.relatedEntityKey ?? collection.entityKey;
  const metadata = allSysBOMetadata[entityKey as keyof typeof allSysBOMetadata];
  const fieldSpec = metadata?.fieldDefinition[field];
  const value = row[sourceField];
  if (fieldSpec?.type === 'enum' && typeof value === 'string') {
    const option = entryFieldOptions(entityKey, field, language).find(
      (item) => item.value === value,
    );
    if (option) return option.label;
  }
  if (fieldSpec?.type === 'reference' && typeof value === 'string') {
    const match = Object.values(references)
      .flat()
      .find((item) => item.id === value);
    if (match) return String(match.name ?? match.fullName ?? value);
  }
  if (fieldSpec?.type === 'boolean')
    return value === true
      ? language === 'EL'
        ? 'Ενεργό'
        : 'Enabled'
      : language === 'EL'
        ? 'Ανενεργό'
        : 'Disabled';
  const format =
    formatOverride ??
    (fieldSpec?.type === 'date' ? 'date' : fieldSpec?.type === 'datetime' ? 'datetime' : 'text');
  return uiEntrySummaryValue(value, format, language);
}

/** Adapt related-view metadata to the canonical List Row/Cell presentation contract.
 * No second formatter, row store or List Surface is created. */
export function uiEntryRelatedListProjection(
  view: UiEntryRelatedView,
  rows: readonly Readonly<Record<string, unknown>>[],
): {
  columns: readonly import('../list/ListMetadata.js').UiListColumn[];
  rows: readonly Record<string, unknown>[];
} {
  return {
    columns: view.columns.map((column) => ({ field: column.field, caption: column.label })),
    rows: rows.map((source) => {
      const row: Record<string, unknown> = { ...source };
      for (const column of view.columns) row[column.field] = source[column.sourceField];
      return row;
    }),
  };
}
