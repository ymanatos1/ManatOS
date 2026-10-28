import {
  allSysBOUIMetadata,
  resolveMetadataText,
  resolveSysBOUIView,
  type MetadataLanguage,
} from '@manatos/shared';

export interface UiEntryUIViewOption {
  readonly key: string;
  readonly label: string;
  readonly available: boolean;
}

/** EJS0-compatible: switching views cannot silently change Entry editing authority. */
export function uiEntryUIViewOptions(
  entityKey: string,
  selectedKey: string,
  mode: 'view' | 'edit' | 'create',
  language: MetadataLanguage = 'EN',
): readonly UiEntryUIViewOption[] {
  const metadata = allSysBOUIMetadata[entityKey as keyof typeof allSysBOUIMetadata];
  if (!metadata) return [];
  const current = resolveSysBOUIView(metadata, selectedKey);
  const currentReadonly = mode === 'view' || current.metadata.record.readOnly === true;
  return Object.keys(metadata.uiViews ?? { [current.key]: current }).map((key) => {
    const view = resolveSysBOUIView(metadata, key);
    return {
      key,
      label: view.label ? resolveMetadataText(view.label, language) : key,
      available: currentReadonly === (mode === 'view' || view.metadata.record.readOnly === true),
    };
  });
}

export function uiEntryTabNavigationVisible(entityKey: string, viewKey?: string): boolean {
  const metadata = allSysBOUIMetadata[entityKey as keyof typeof allSysBOUIMetadata];
  return (
    !metadata ||
    resolveSysBOUIView(metadata, viewKey).metadata.record.tabNavigationVisible !== false
  );
}
