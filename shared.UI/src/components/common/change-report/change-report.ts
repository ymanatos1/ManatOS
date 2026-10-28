import { resolveMetadataText, allSysBOMetadata, type MetadataLanguage } from '@manatos/shared';
import {
  uiEntryCaption,
  uiEntryFieldLabel,
  uiEntryFieldPresentation,
} from '../../entry/EntryMetadata.js';
import { entryFieldOptions, type UiEntryFieldOptions } from '../../entry/EntryEditState.js';

/** Read-only, framework-neutral hierarchical change report. Never a persistence plan. */
export interface UiChangeValue {
  readonly label: string;
  readonly icon?: string;
  readonly imageUrl?: string;
  readonly tone?: 'success' | 'warning' | 'danger' | 'secondary';
}
export interface UiChangeDetail {
  readonly key: string;
  readonly label: string;
  readonly from?: UiChangeValue;
  readonly to?: UiChangeValue;
  readonly value?: UiChangeValue;
}
export interface UiChangeNode {
  readonly id: string;
  readonly label: string;
  readonly icon?: string;
  readonly status?: string;
  readonly severity?: 'success' | 'warning' | 'danger';
  readonly count?: number;
  readonly expanded?: boolean;
  readonly details?: readonly UiChangeDetail[];
  readonly children?: readonly UiChangeNode[];
}
export interface UiChangeReport {
  /** Optional pre-rendered localized semantic views. These contain no raw record data. */
  readonly localized?: Partial<Readonly<Record<MetadataLanguage, UiChangeReport>>>;
  readonly kind: 'entry' | 'hierarchy' | 'recovery' | 'collection' | 'workspace';
  readonly summary: string;
  readonly count: number;
  readonly nodes: readonly UiChangeNode[];
}
export interface UiEntryReportInput {
  readonly entityKey: string;
  readonly original: Readonly<Record<string, unknown>>;
  readonly current: Readonly<Record<string, unknown>>;
  readonly language: MetadataLanguage;
  readonly caption?: string;
  readonly references?: Readonly<Record<string, readonly Readonly<Record<string, unknown>>[]>>;
  readonly fieldOptions?: UiEntryFieldOptions;
  readonly collections?: Readonly<
    Record<
      string,
      {
        readonly original?: readonly unknown[];
        readonly current?: readonly unknown[];
      }
    >
  >;
}

/** EJS0 semanticEqual semantics; CTX object member ordering is not meaningful. */
export function changeValuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object')
    return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => changeValuesEqual(value, right[index]))
    );
  }
  const a = left as Record<string, unknown>;
  const b = right as Record<string, unknown>;
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => Object.hasOwn(b, key) && changeValuesEqual(a[key], b[key]))
  );
}

function interpolated(
  key: string,
  language: MetadataLanguage,
  variables: Readonly<Record<string, string>>,
): string {
  return resolveMetadataText(`@CM.${key}`, language).replace(
    /\{([a-zA-Z]+)\}/g,
    (full, name: string) => variables[name] ?? full,
  );
}

function valueDescriptor(input: UiEntryReportInput, field: string, value: unknown): UiChangeValue {
  if (value === null || value === undefined || value === '')
    return { label: resolveMetadataText('@CM.NoneOption', input.language) };
  const id = input.current['id'];
  const presentation = uiEntryFieldPresentation(
    input.entityKey,
    field,
    value,
    input.language,
    undefined,
    typeof id === 'string' ? id : undefined,
    input.references,
    undefined,
    input.fieldOptions?.[field] ?? entryFieldOptions(input.entityKey, field, input.language),
  );
  const option = (
    input.fieldOptions?.[field] ?? entryFieldOptions(input.entityKey, field, input.language)
  ).find((item) => item.value === String(value));
  if (option) return { label: option.label, ...(option.icon ? { icon: option.icon } : {}) };
  if (presentation?.relatedName)
    return {
      label: presentation.relatedName,
      ...(presentation.relatedPhotoUrl ? { imageUrl: presentation.relatedPhotoUrl } : {}),
      ...(presentation.relatedIcons?.[0] ? { icon: presentation.relatedIcons[0] } : {}),
    };
  if (presentation?.type === 'boolean') {
    const positive = value === true || value === 'true';
    const key =
      field === 'emailVerified'
        ? positive
          ? 'Verified'
          : 'NotVerified'
        : field === 'enabled'
          ? positive
            ? 'Enabled'
            : 'Disabled'
          : positive
            ? 'Yes'
            : 'No';
    return {
      label: resolveMetadataText(`@CM.${key}`, input.language),
      icon: positive ? 'check-circle-fill' : 'dash-circle',
      tone: positive ? 'success' : 'secondary',
    };
  }
  if (presentation?.type === 'picture' || presentation?.type === 'pictures') {
    return {
      label: resolveMetadataText(
        presentation.type === 'picture' ? '@CM.Picture' : '@CM.Pictures',
        input.language,
      ),
      ...(presentation.imageUrl ? { imageUrl: presentation.imageUrl } : {}),
    };
  }
  if (presentation?.type === 'date' || presentation?.type === 'datetime') {
    const date = new Date(String(value));
    if (!Number.isNaN(date.getTime()))
      return {
        label: new Intl.DateTimeFormat(input.language === 'EL' ? 'el-GR' : 'en-GB', {
          dateStyle: 'medium',
          ...(presentation.type === 'datetime' ? { timeStyle: 'short' as const } : {}),
        }).format(date),
      };
  }
  if (presentation?.type === 'reference')
    return { label: resolveMetadataText('@CM.Unknown', input.language) };
  if (presentation?.type === 'email') return { label: String(value), icon: 'envelope' };
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
    return { label: String(value) };
  // Never render objects through JavaScript's [object Object] coercion.
  return {
    label: Array.isArray(value)
      ? interpolated('ChangesEntriesCount', input.language, { count: String(value.length) })
      : '…',
  };
}

/** Semantic Entry changes, including related-collection summaries; extensible node schema covers hierarchy/recovery. */
export function entryChangeReport(input: UiEntryReportInput): UiChangeReport {
  const metadata = allSysBOMetadata[input.entityKey as keyof typeof allSysBOMetadata];
  // Never include undeclared or sensitive fields, even if a caller passes a raw record.
  const declared = metadata?.fieldDefinition as
    Readonly<Record<string, { sensitive?: boolean }>> | undefined;
  const keys = [...new Set([...Object.keys(input.original), ...Object.keys(input.current)])].filter(
    (key) => declared?.[key] && declared[key].sensitive !== true,
  );
  const changes = keys.filter((key) => !changeValuesEqual(input.original[key], input.current[key]));
  const collections = Object.entries(input.collections ?? {}).filter(
    ([, collection]) => !changeValuesEqual(collection.original ?? [], collection.current ?? []),
  );
  const children: UiChangeNode[] = [];
  if (changes.length)
    children.push({
      id: 'fields',
      label: resolveMetadataText('@CM.ChangesFields', input.language),
      icon: 'pencil-square',
      count: changes.length,
      expanded: true,
      details: changes.map((field) => ({
        key: field,
        label: uiEntryFieldLabel(input.entityKey, field, input.language),
        from: valueDescriptor(input, field, input.original[field]),
        to: valueDescriptor(input, field, input.current[field]),
      })),
    });
  if (collections.length)
    children.push({
      id: 'collections',
      label: resolveMetadataText('@CM.ChangesRelatedCollections', input.language),
      icon: 'list-ul',
      count: collections.length,
      expanded: true,
      children: collections.map(([key, collection]) => ({
        id: `collection:${key}`,
        label: key,
        icon: 'list-check',
        status: `${collection.original?.length ?? 0} → ${collection.current?.length ?? 0}`,
      })),
    });
  const count = changes.length + collections.length;
  return {
    kind: 'entry',
    count,
    summary: interpolated(
      count === 1 ? 'ChangesCountOneEntry' : 'ChangesCountEntry',
      input.language,
      { count: String(count) },
    ),
    nodes: [
      {
        id: 'entry',
        label: input.caption ?? uiEntryCaption(input.entityKey, input.original, input.language),
        count,
        expanded: true,
        icon: 'pencil-square',
        children,
      },
    ],
  };
}

/** Prepare both localized, sanitized report presentations at the source.
 * The popup can switch languages without accessing original/current business records.
 */
export function entryChangeReportLocalized(input: UiEntryReportInput): UiChangeReport {
  const build = (language: MetadataLanguage): UiChangeReport =>
    entryChangeReport({
      ...input,
      language,
      caption: undefined,
      fieldOptions: input.fieldOptions, // optional contextual values, never copies of canonical enums
    });
  const english = build('EN');
  const greek = build('EL');
  const localized = { EN: english, EL: greek };
  return { ...localized[input.language], localized };
}

/** Return the appropriate read-only presentation without mutating CTX or the source. */
export function localizedChangeReport(
  report: UiChangeReport,
  language: MetadataLanguage,
): UiChangeReport {
  return report.localized?.[language] ?? report;
}

/** The outer report hosts accept other typed producer reports without knowing their domain. */
export function changeReportCount(report: UiChangeReport): number {
  return report.count;
}
