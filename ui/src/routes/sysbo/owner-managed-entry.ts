import createError from 'http-errors';
import type { Request } from 'express';
import type { SysBOMetadata } from '@manatos/shared';

export interface OwnerManagedEntryContext extends Readonly<Record<string, unknown>> {
  name: string;
  kind: string;
  mode: string;
  fields: Record<string, unknown>;
  entries: Record<string, unknown>[];
  entriesOriginal: Record<string, unknown>[];
  identityField: string;
}

function parseRows(value: unknown): Record<string, unknown>[] {
  if (typeof value !== 'string') return [];
  const parsed = JSON.parse(value);
  return Array.isArray(parsed)
    ? parsed.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
    : [];
}

/**
 * Resolve one entry directly from an owner-managed in-memory aggregate.
 * Persisted-record lookup is intentionally bypassed because the owner workspace
 * is the authoritative working copy until its aggregate commit succeeds.
 */
export function ownerManagedEntryFromRequest(
  req: Request,
  id: string,
): { item: Record<string, unknown>; parentOwnerContext: OwnerManagedEntryContext } {
  const entries = parseRows(req.body._ownerEntries);
  const entriesOriginal = parseRows(req.body._ownerEntriesOriginal);
  const fields = typeof req.body._ownerFields === 'string'
    ? JSON.parse(req.body._ownerFields) as Record<string, unknown>
    : {};
  const identityField = String(req.body._ownerIdentityField || 'id');
  const item = entries.find((candidate) => String(candidate[identityField] ?? '') === id);
  if (!item) throw createError(404, 'The requested owner-managed entry could not be found.');

  return {
    item,
    parentOwnerContext: {
      name: String(req.body._ownerName || 'organization'),
      kind: String(req.body._ownerKind || 'sysbo-hierarchy'),
      mode: String(req.body._ownerMode || 'edit'),
      fields,
      entries,
      entriesOriginal,
      identityField,
    },
  };
}

/**
 * Merge the posted child editor values back into the owner's working entries.
 * Only canonical, non-sensitive entity fields are accepted from the child form.
 */
export function mergeOwnerManagedEntryFromRequest(
  req: Request,
  metadata: SysBOMetadata<Record<string, unknown>>,
): {
  entries: Record<string, unknown>[];
  entriesOriginal: Record<string, unknown>[];
  focusedMemberId: string | null;
  mode: 'create' | 'edit';
} {
  const id = String(req.body.id ?? '');
  const identityField = String(req.body._ownerIdentityField || 'id');
  const entries = parseRows(req.body._ownerEntries);
  const entriesOriginal = parseRows(req.body._ownerEntriesOriginal);
  const edited = Object.fromEntries(
    Object.keys(metadata.fieldDefinition)
      .filter((key) => metadata.fieldDefinition[key]?.sensitive !== true && Object.prototype.hasOwnProperty.call(req.body, key))
      .map((key) => [key, req.body[key]]),
  );
  const nextEntries = entries.map((candidate) => String(candidate[identityField] ?? '') === id
    ? { ...candidate, ...edited, [identityField]: id }
    : { ...candidate });
  const focusedMemberId = String(req.body._ownerFocusedMemberId || id || '') || null;

  return {
    entries: nextEntries,
    entriesOriginal,
    focusedMemberId,
    mode: req.body._ownerMode === 'create' ? 'create' : 'edit',
  };
}
