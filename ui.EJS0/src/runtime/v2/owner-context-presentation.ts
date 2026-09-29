export interface UiOwnerContextPresentation {
  readonly label: string;
  readonly title: string;
}

type RecordValue = Readonly<Record<string, unknown>>;
const record = (value: unknown): RecordValue | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as RecordValue) : null;

/** Host-neutral projection of meaningful caller/persistence ownership for common chrome. */
export const ownerContextPresentation = (surface: unknown): UiOwnerContextPresentation | null => {
  const level = record(surface);
  const control = record(level?.control);
  const persistence = record(control?.persistence);
  if (!persistence) return null;
  const owner = record(persistence.owner);
  if (!owner) return null;
  const ownerName = String(owner.name || owner.kind || 'owner').trim();
  if (!ownerName) return null;
  const displayName = ownerName
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
  const label = `Owner: ${displayName}`;
  const boundary = record(persistence.ultimateBoundary);
  const aggregate = boundary?.kind === 'aggregate';
  return Object.freeze({
    label,
    title: aggregate
      ? `Changes saved here remain with ${displayName} until the owning aggregate is committed.`
      : `Changes saved here return to ${displayName}.`,
  });
};
