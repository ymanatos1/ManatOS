import type {
  ResolvedSysBOUIView,
  SysBOUIEntryViewMetadata,
  SysBOUIMetadata,
  SysBOUIRecordMetadata,
  SysBOUIRecordViewMetadata,
} from './types.js';

export const DEFAULT_SYSBO_UI_VIEW_KEY = 'main';
export const DEFAULT_SYSBO_UI_VIEW_TYPE = 'full';

function composedFieldOverrides(
  common: SysBOUIRecordMetadata['fieldOverrides'],
  contribution: SysBOUIRecordViewMetadata['fieldOverrides'],
): SysBOUIRecordMetadata['fieldOverrides'] {
  const contributed = Object.fromEntries(
    Object.entries(contribution ?? {}).map(([key, selected]) => {
      const base = common[key] ?? {};
      return [
        key,
        {
          ...base,
          ...selected,
          ...((base.presentation || selected.presentation) && {
            presentation: { ...base.presentation, ...selected.presentation },
          }),
        },
      ];
    }),
  );

  return {
    ...common,
    ...contributed,
  };
}

function composedRecord(
  common: SysBOUIRecordMetadata,
  contribution: Readonly<SysBOUIRecordViewMetadata> | undefined,
): SysBOUIRecordMetadata {
  if (!contribution) return common;

  return {
    ...common,
    ...(typeof contribution.readOnly === 'boolean' ? { readOnly: contribution.readOnly } : {}),
    ...(contribution.tabs ? { tabs: contribution.tabs } : {}),
    ...(typeof contribution.tabNavigationVisible === 'boolean'
      ? { tabNavigationVisible: contribution.tabNavigationVisible }
      : {}),
    ...(contribution.content ? { content: contribution.content } : {}),
    fieldOverrides: {
      ...common.fieldOverrides,
      ...composedFieldOverrides(common.fieldOverrides, contribution.fieldOverrides),
    },
    ...((common.entryActions || contribution.actionOverrides) && {
      entryActions: Object.fromEntries(
        Object.entries(common.entryActions ?? {}).map(([key, action]) => [
          key,
          {
            ...action,
            ...(contribution.actionOverrides?.[key] ?? {}),
            ...(contribution.readOnly === true &&
            (action.kind === 'save' || action.kind === 'delete')
              ? { visible: false }
              : {}),
          },
        ]),
      ),
    }),
    ...((common.relatedCollections || contribution.relatedCollections) && {
      relatedCollections: {
        ...(common.relatedCollections ?? {}),
        ...(contribution.relatedCollections ?? {}),
      },
    }),
  };
}

function implicitMainView(): SysBOUIEntryViewMetadata {
  return { viewType: DEFAULT_SYSBO_UI_VIEW_TYPE };
}

/**
 * Compose one concrete entity-entry UI view from canonical entity UI metadata.
 *
 * Resolution deliberately keeps the first-generation contract permissive:
 * common record metadata may coexist with view-specific contributions, and the
 * resolver combines them without forcing metadata authors to decide too early
 * which properties must live at which layer. Arrays supplied by a concrete
 * view replace their common counterpart; keyed maps compose by key. Field-level
 * overrides also compose by field, so a view can change only `editable` without
 * losing a common picture editor, label, or other presentation declaration.
 */
export function resolveSysBOUIView(
  metadata: SysBOUIMetadata,
  requestedKey?: string | null,
): ResolvedSysBOUIView {
  const defaultKey = metadata.defaultUIView ?? DEFAULT_SYSBO_UI_VIEW_KEY;
  const key = requestedKey || defaultKey;
  const declaredViews = metadata.uiViews;
  const view =
    declaredViews?.[key] ??
    (!declaredViews && key === DEFAULT_SYSBO_UI_VIEW_KEY ? implicitMainView() : undefined);

  if (!view) {
    throw new Error(`Unknown UI view '${key}' for entity '${metadata.key}'.`);
  }

  const effectiveMetadata: SysBOUIMetadata = {
    ...metadata,
    record: composedRecord(metadata.record, view.record),
  };

  return {
    key,
    viewType: view.viewType,
    ...(view.label ? { label: view.label } : {}),
    metadata: effectiveMetadata,
  };
}
