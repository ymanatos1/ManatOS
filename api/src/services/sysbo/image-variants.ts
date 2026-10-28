import { allSysBOMetadata, apiPathFor, entryPhotoField } from '@manatos/shared';

export type ImageVariant = 'none' | 'thumbnail' | 'original';
export type ImageVariantMap = Record<
  string,
  Record<
    string,
    Record<
      string,
      Record<
        string,
        {
          url: string;
          revision: unknown;
        }
      >
    >
  >
>;

/** Ordinary business fields never change structure because an image rendition was requested. */
export function imageVariantMap(
  variant: ImageVariant,
  entityKey: string,
  records: readonly Readonly<Record<string, unknown>>[],
  references: Readonly<Record<string, readonly Readonly<Record<string, unknown>>[]>>,
): ImageVariantMap {
  const result: ImageVariantMap = Object.create(null);
  if (variant === 'none') return result;
  const append = (key: string, rows: readonly Readonly<Record<string, unknown>>[]): void => {
    const metadata = allSysBOMetadata[key as keyof typeof allSysBOMetadata];
    if (!metadata) return;
    const imageField = entryPhotoField(metadata);
    if (!imageField) return;
    for (const row of rows) {
      const id = row.id;
      const value = row[imageField];
      if (typeof id !== 'string' || !value || typeof value !== 'object' || Array.isArray(value))
        continue;
      const picture = value as Readonly<Record<string, unknown>>;
      if (picture.pending === true) continue;
      const entry = (result[key] ??= Object.create(null));
      const fields = (entry[id] ??= Object.create(null));
      const renditions = (fields[imageField] ??= Object.create(null));
      renditions[variant] = {
        url: `/api/v1/${apiPathFor(key)}/${encodeURIComponent(id)}/$picture/${encodeURIComponent(imageField)}?variant=${variant}&revision=${encodeURIComponent(String(picture.revision ?? ''))}`,
        revision: picture.revision ?? null,
      };
    }
  };
  append(entityKey, records);
  for (const [key, rows] of Object.entries(references)) append(key, rows);
  return result;
}

export function readImageVariant(value: unknown): ImageVariant | null {
  if (value === undefined) return null;
  return value === 'none' || value === 'thumbnail' || value === 'original' ? value : null;
}
