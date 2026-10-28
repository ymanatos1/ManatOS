import { createUiFieldBehavior } from '../fields/registry.js';
import type { UiFieldOption } from '../fields/field-types.js';
import {
  allSysBOMetadata,
  allSysBOUIMetadata,
  resolveMetadataText,
  resolveSysBOUIListView,
  type MetadataLanguage,
  type SysBOUIMetadata,
} from '@manatos/shared';

export interface UiListColumn {
  readonly field: string;
  readonly caption: string;
  readonly sortable?: boolean;
  readonly filterable?: boolean;
}

interface FieldSpec {
  readonly label: string;
  readonly type: string;
}
interface EntitySpec {
  readonly pluralLabel?: string;
  readonly label: string;
  readonly fieldDefinition: Readonly<Record<string, FieldSpec>>;
}
interface UiEntitySpec {
  readonly list: {
    readonly common: {
      readonly visibleFields: readonly string[];
      readonly sortableFields: readonly string[];
      readonly filterFields: readonly string[];
    };
    readonly views: Readonly<Record<string, { readonly label: string }>>;
  };
}

/** Resolved List columns reuse canonical entity and view metadata. */
export function uiListResolvedColumns(
  entityKey: string,
  view = 'main',
  language: MetadataLanguage = 'EN',
): UiListColumn[] {
  const entity = (allSysBOMetadata as unknown as Readonly<Record<string, EntitySpec>>)[entityKey];
  const ui = (allSysBOUIMetadata as unknown as Readonly<Record<string, UiEntitySpec>>)[entityKey];
  if (!entity || !ui) return [];
  const viewMetadata = resolveSysBOUIListView(ui as unknown as SysBOUIMetadata, view).metadata;
  return viewMetadata.visibleFields
    .filter((field) => !!entity.fieldDefinition[field])
    .map((field) => ({
      field,
      caption: resolveMetadataText(entity.fieldDefinition[field]!.label, language),
      sortable: viewMetadata.sortableFields.includes(field),
      filterable: viewMetadata.filterFields.includes(field),
    }));
}

/** Canonical, metadata-driven filters shared by Page and Popup presentations. */
export interface UiListFilterField {
  readonly field: string;
  readonly caption: string;
  readonly type: string;
  readonly options: readonly UiFieldOption[];
}
export function uiListFilterFields(
  entityKey: string,
  language: MetadataLanguage = 'EN',
  view = 'main',
): UiListFilterField[] {
  const entity = (allSysBOMetadata as unknown as Readonly<Record<string, EntitySpec>>)[entityKey];
  const ui = (allSysBOUIMetadata as unknown as Readonly<Record<string, UiEntitySpec>>)[entityKey];
  if (!entity || !ui) return [];
  const viewMetadata = resolveSysBOUIListView(ui as unknown as SysBOUIMetadata, view).metadata;
  return viewMetadata.filterFields
    .filter((field) => !!entity.fieldDefinition[field])
    .map((field) => {
      const spec = entity.fieldDefinition[field]!;
      // Preserve every declared option capability (including icons), not only native select labels.
      const options = createUiFieldBehavior(entityKey, field).filterOptions(language);
      return {
        field,
        caption: resolveMetadataText(spec.label, language),
        type: spec.type,
        options,
      };
    });
}

/** Present all resolved fields: no demonstration column limit. */
export function uiListColumns(entityKey: string, language: MetadataLanguage, view = 'main') {
  return uiListResolvedColumns(entityKey, view, language);
}

export function uiListAvailableViews(
  entityKey: string,
  language: MetadataLanguage,
): Array<{ key: string; label: string }> {
  const ui = (allSysBOUIMetadata as unknown as Readonly<Record<string, UiEntitySpec>>)[entityKey];
  return Object.entries(ui?.list.views ?? {}).map(([key, view]) => ({
    key,
    label: resolveMetadataText(view.label, language),
  }));
}

export function uiListEntityLabel(entityKey: string, language: MetadataLanguage): string {
  const entity = (allSysBOMetadata as unknown as Readonly<Record<string, EntitySpec>>)[entityKey];
  return entity ? resolveMetadataText(entity.pluralLabel ?? entity.label, language) : entityKey;
}
