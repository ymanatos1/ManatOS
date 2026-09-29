/** Canonical UI source paths for persisted picture values. Pending pictures have no persisted source. */
const encoded = (value: unknown): string => encodeURIComponent(String(value ?? ''));

export function persistedScalarPictureSource(
  entityKey: unknown,
  identity: unknown,
  fieldKey: unknown,
  picture: Readonly<Record<string, unknown>> | null | undefined,
): string | null {
  if (!entityKey || !identity || !fieldKey || !picture || picture.pending === true) return null;
  return `/bo/${encoded(entityKey)}/${encoded(identity)}/picture/${encoded(fieldKey)}?revision=${encoded(picture.revision || '')}`;
}

export function persistedCollectionPictureSource(
  entityKey: unknown,
  identity: unknown,
  fieldKey: unknown,
  picture: Readonly<Record<string, unknown>> | null | undefined,
): string | null {
  if (!entityKey || !identity || !fieldKey || !picture?.id || picture.pending === true) return null;
  return `/bo/${encoded(entityKey)}/${encoded(identity)}/pictures/${encoded(fieldKey)}/${encoded(picture.id)}?revision=${encoded(picture.revision || '')}`;
}
