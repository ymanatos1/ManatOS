import type { UiInvocation } from './contracts.js';
import { semanticEqual } from './dirty.js';
import type { EntityEntrySurface } from './entity-entry-surface.js';

export const UI_ENTRY_RECOVERY_FORMAT = 'entry-semantic-delta-v2' as const;

/** Immutable information required to reopen the same semantic surface after interruption. */
export interface UiRecoveryOpeningDescriptor {
  readonly invocation: UiInvocation;
}

/**
 * Outage recovery contains semantic user changes only. It is deliberately not a
 * draft store: intentional workspace drafts have their own persistence/lifetime policy.
 */
export interface UiEntryRecoverySnapshot {
  readonly format: typeof UI_ENTRY_RECOVERY_FORMAT;
  readonly opening: UiRecoveryOpeningDescriptor;
  readonly changes: Readonly<Record<string, unknown>>;
  /** Changed parent-owned collections. Omitted collections remain at their reopened baseline. */
  readonly collections?: Readonly<Record<string, readonly Readonly<Record<string, unknown>>[]>>;
}

export function captureEntityEntryRecovery(
  surface: EntityEntrySurface,
): UiEntryRecoverySnapshot | null {
  const invocation = surface.level.invocation;
  if (!invocation || invocation.behavior?.recoverable === false || surface.mode === 'view') {
    return null;
  }

  const original = surface.canonicalOriginal();
  const current = surface.canonicalCurrent();
  const changes: Record<string, unknown> = {};
  for (const key of surface.fields.keys()) {
    if (!semanticEqual(original[key], current[key])) changes[key] = structuredClone(current[key]);
  }
  const collections: Record<string, readonly Readonly<Record<string, unknown>>[]> = {};
  for (const [key, collection] of surface.collections) {
    if (!semanticEqual(collection.original(), collection.current())) {
      collections[key] = structuredClone(collection.current());
    }
  }
  if (Object.keys(changes).length === 0 && Object.keys(collections).length === 0) return null;

  return {
    format: UI_ENTRY_RECOVERY_FORMAT,
    opening: { invocation: structuredClone(invocation) },
    changes,
    ...(Object.keys(collections).length ? { collections } : {}),
  };
}

export function applyEntityEntryRecovery(
  surface: EntityEntrySurface,
  snapshot: UiEntryRecoverySnapshot,
): void {
  if (snapshot.format !== UI_ENTRY_RECOVERY_FORMAT) {
    throw new Error(`Unsupported entry recovery format: ${String(snapshot.format)}`);
  }
  const invocation = surface.level.invocation;
  if (!invocation || snapshot.opening.invocation.entity !== invocation.entity) {
    throw new Error('Recovery snapshot does not target this entity entry.');
  }
  if (snapshot.opening.invocation.mode !== invocation.mode) {
    throw new Error('Recovery snapshot does not target this entry mode.');
  }

  for (const [key, value] of Object.entries(snapshot.changes)) {
    const field = surface.fields.get(key);
    if (!field) throw new Error(`Recovery snapshot contains unknown canonical field '${key}'.`);
    field.write(structuredClone(value), { source: 'entry-surface:outage-recovery' });
  }
  for (const [key, rows] of Object.entries(snapshot.collections ?? {})) {
    const collection = surface.collections.get(key);
    if (!collection) {
      throw new Error(`Recovery snapshot contains unknown canonical collection '${key}'.`);
    }
    collection.replace(structuredClone(rows), 'entry-surface:outage-recovery');
  }
  surface.dirty.refresh('entry-surface:outage-recovery');
  surface.validation.validate();
}
