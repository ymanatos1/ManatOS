import { allSysBOUIMetadata, type SysBOUIPictureEditorMetadata } from '@manatos/shared';

export interface PictureEditorPolicy {
  readonly maxSourceBytes: number;
  readonly cropAspectRatio: number;
  readonly cropModes: readonly ('proportional' | 'free')[];
  readonly outputSize: number;
  readonly outputContentType: 'image/jpeg' | 'image/png' | 'image/webp';
  readonly outputQuality: number;
}
export interface PreparedPicture {
  readonly contentType: string;
  readonly dataBase64: string;
  readonly size: number;
}
export interface PendingPictureDescriptor {
  readonly revision: string;
  readonly id: string;
  readonly contentType: string;
  readonly size: number;
  readonly pending: true;
}

/** Metadata is the sole authority; the editor is not an entity-specific form. */
export function pictureEditorPolicy(entityKey: string, field: string): PictureEditorPolicy {
  const entity = allSysBOUIMetadata[entityKey as keyof typeof allSysBOUIMetadata];
  const ui = entity?.uiViews?.[entity.defaultUIView ?? 'main']?.record;
  const overrides = (ui?.fieldOverrides?.[field] ?? entity?.record.fieldOverrides?.[field])
    ?.presentation?.pictureEditor as SysBOUIPictureEditorMetadata | undefined;
  const bound = (value: number | undefined, fallback: number, min: number, max: number) =>
    typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
      ? value
      : fallback;
  const cropModes = overrides?.cropModes?.filter(
    (mode) => mode === 'free' || mode === 'proportional',
  );
  return {
    maxSourceBytes: bound(overrides?.maxSourceBytes, 20_000_000, 1, 100_000_000),
    cropAspectRatio: bound(overrides?.cropAspectRatio, 1, 0.05, 20),
    cropModes: cropModes?.length ? cropModes : ['proportional', 'free'],
    outputSize: bound(overrides?.outputSize, 768, 64, 4096),
    outputContentType: overrides?.outputContentType ?? 'image/jpeg',
    outputQuality: bound(overrides?.outputQuality, 0.9, 0.01, 1),
  };
}

export function assertPictureSource(
  file: { size: number; type: string },
  policy: PictureEditorPolicy,
): void {
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type))
    throw new Error('Choose a JPEG, PNG, WebP or GIF picture.');
  if (!Number.isSafeInteger(file.size) || file.size <= 0 || file.size > policy.maxSourceBytes)
    throw new Error(`Picture must be at most ${Math.round(policy.maxSourceBytes / 1_000_000)} MB.`);
}

export function pendingPictureDescriptor(
  prepared: PreparedPicture,
  id: string,
): PendingPictureDescriptor {
  if (!/^pending:[0-9a-z-]+$/i.test(id)) throw new Error('Invalid pending picture identity.');
  return {
    id,
    revision: id,
    contentType: prepared.contentType,
    size: prepared.size,
    pending: true,
  };
}

/** Private bytes are intentionally excluded from semantic #data.current. */
export class PicturePendingResources {
  private readonly items = new Map<string, PreparedPicture>();
  add(descriptor: PendingPictureDescriptor, data: PreparedPicture): void {
    this.items.set(descriptor.id, data);
  }
  get(id: string): PreparedPicture | undefined {
    return this.items.get(id);
  }
  remove(id: string): void {
    this.items.delete(id);
  }
  ids(): readonly string[] {
    return [...this.items.keys()];
  }
  clear(): void {
    this.items.clear();
  }
}
