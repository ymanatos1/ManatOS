import type { SysBOUIComponentMetadata, SysBOUIMetadata } from '@manatos/shared';

export interface CollectionEditorDescriptor {
  sourceKey: string;
  label: string;
  itemFieldKeys: readonly string[];
}

const optionObject = (value: unknown): Readonly<Record<string, unknown>> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : null;

/**
 * Discover every metadata-declared collection editor without knowing the owning
 * entity or the related business objects it edits.
 *
 * The same discovery contract is shared by related-resource loading and Save
 * persistence so a reusable collection editor cannot render successfully while
 * depending on a second, entity-specific write path.
 */
export function collectionEditorDescriptors(
  metadata?: SysBOUIMetadata,
): readonly CollectionEditorDescriptor[] {
  const descriptors = new Map<string, CollectionEditorDescriptor>();

  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }

    const node = value as Readonly<Record<string, unknown>>;
    const component = optionObject(node.component) as Readonly<SysBOUIComponentMetadata> | null;
    if (component?.key === 'collection-editor') {
      const options = optionObject(component.options);
      const sourceKey = typeof options?.sourceKey === 'string' ? options.sourceKey.trim() : '';
      if (sourceKey) {
        const itemFields = Array.isArray(options?.itemFields) ? options.itemFields : [];
        const itemFieldKeys = itemFields
          .map((field) => optionObject(field)?.key)
          .filter((key): key is string => typeof key === 'string' && key.length > 0);
        const label =
          typeof options?.label === 'string' && options.label.trim()
            ? options.label.trim()
            : sourceKey;
        descriptors.set(sourceKey, { sourceKey, label, itemFieldKeys });
      }
    }

    Object.values(node).forEach(visit);
  };

  visit(metadata?.record);
  return [...descriptors.values()];
}

/** Source keys whose related-resource rows are owned by an editable collection. */
export function collectionEditorSourceKeys(metadata?: SysBOUIMetadata): ReadonlySet<string> {
  return new Set(collectionEditorDescriptors(metadata).map(({ sourceKey }) => sourceKey));
}
