import type { SysBOMetadata, SysBOUIMetadata, SysBOUITabContentMetadata } from '@manatos/shared';

/**
 * Declarative resource demand of one already-resolved entry ui-view.
 *
 * This plan is intentionally view-name agnostic. Resources are requested only
 * because the effective record composition consumes them; `main`, `quickView`,
 * `account` and future customer views all pass through the same discovery.
 */
export interface EntryResourcePlan {
  readonly fieldKeys: ReadonlySet<string>;
  readonly referenceFieldKeys: ReadonlySet<string>;
  readonly collectionKeys: ReadonlySet<string>;
  readonly componentKeys: ReadonlySet<string>;
  readonly actionKeys: ReadonlySet<string>;
}

const optionSourceKey = (value: unknown): string | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const sourceKey = (value as Readonly<Record<string, unknown>>).sourceKey;
  return typeof sourceKey === 'string' && sourceKey.trim() ? sourceKey.trim() : null;
};

/** Discover resource consumers recursively from the effective record composition. */
export function planEntryResources(
  boMetadata: SysBOMetadata<Record<string, unknown>>,
  metadata: SysBOUIMetadata,
  readOnly = metadata.record.readOnly === true,
): EntryResourcePlan {
  const fieldKeys = new Set<string>();
  const collectionKeys = new Set<string>();
  const componentKeys = new Set<string>();
  const actionKeys = new Set<string>();
  const relatedCollections = metadata.record.relatedCollections ?? {};

  const addCollectionBySourceKey = (sourceKey: string) => {
    for (const [collectionKey, collection] of Object.entries(relatedCollections)) {
      if ((collection.sourceKey ?? collectionKey) === sourceKey) collectionKeys.add(collectionKey);
    }
  };

  const visit = (content: readonly SysBOUITabContentMetadata[] | undefined): void => {
    for (const item of content ?? []) {
      if (item.kind === 'field') {
        fieldKeys.add(item.field);
        item.relatedFields?.forEach((fieldKey) => fieldKeys.add(fieldKey));
      } else if (item.kind === 'action') {
        actionKeys.add(item.action);
      } else if (item.kind === 'collection') {
        collectionKeys.add(item.collection);
      } else if (item.kind === 'column' || item.kind === 'inline') {
        visit(item.content);
      } else if (item.kind === 'component') {
        componentKeys.add(item.component.key);
        for (const [optionKey, optionValue] of Object.entries(item.component.options ?? {})) {
          if (optionKey.endsWith('Field') && typeof optionValue === 'string')
            fieldKeys.add(optionValue);
        }
        const sourceKey = optionSourceKey(item.component.options);
        if (sourceKey) addCollectionBySourceKey(sourceKey);
      }
    }
  };

  visit(metadata.record.content);
  for (const tab of metadata.record.tabs) {
    if (tab.visible === false) continue;
    visit(tab.content);
    if (tab.component) {
      componentKeys.add(tab.component.key);
      const sourceKey = optionSourceKey(tab.component.options);
      if (sourceKey) addCollectionBySourceKey(sourceKey);
    }
  }

  for (const [actionKey, action] of Object.entries(metadata.record.entryActions ?? {})) {
    if (action.visible === false) continue;
    if (readOnly && ['save', 'delete', 'command'].includes(action.kind)) continue;
    actionKeys.add(actionKey);
  }

  const referenceFieldKeys = new Set(
    [...fieldKeys].filter((fieldKey) => boMetadata.fieldDefinition[fieldKey]?.referenceBOKey),
  );

  return Object.freeze({
    fieldKeys,
    referenceFieldKeys,
    collectionKeys,
    componentKeys,
    actionKeys,
  });
}
