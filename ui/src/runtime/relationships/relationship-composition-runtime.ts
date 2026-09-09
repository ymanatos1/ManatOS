import type { SysBOFieldMetadata } from '@manatos/shared';
import type { RelationshipCommandPayload } from '../commands/command-contracts.js';
import type { CommandRuntime } from '../commands/command-runtime.js';
import { RelationshipPolicy } from '../policies/relationship-policy.js';
import type { EntryStateRuntime } from '../state/entry-state-runtime.js';
import type { SurfaceContext, SurfaceInvocation, SurfaceMode } from '../surface/contracts.js';
import type { SurfaceResult } from '../surface/result-contracts.js';

interface AttachedEntry {
  readonly surface: SurfaceContext;
  readonly entry: EntryStateRuntime;
  readonly fields: ReadonlyMap<string, SysBOFieldMetadata>;
}

export interface RelationshipOpenResult {
  readonly childSurfaceId: string;
  readonly mode: SurfaceMode;
}

/** Host-neutral composition of reference-field workflows. */
export class RelationshipCompositionRuntime {
  readonly #entries = new Map<string, AttachedEntry>();
  readonly #pending = new Map<string, Readonly<{ sourceSurfaceId: string; targetField: string }>>();

  constructor(
    readonly commands: CommandRuntime,
    readonly policy = new RelationshipPolicy(),
  ) {
    this.commands.register<RelationshipCommandPayload, RelationshipOpenResult>(
      'relationship.add',
      (command) => this.#open(command.surfaceId, command.payload, 'add-entry'),
    );
    this.commands.register<RelationshipCommandPayload, RelationshipOpenResult>(
      'relationship.select',
      (command) => this.#open(command.surfaceId, command.payload, 'select-existing'),
    );
    this.commands.register<RelationshipCommandPayload, RelationshipOpenResult>(
      'relationship.open',
      (command) => this.#open(command.surfaceId, command.payload, 'open-entry'),
    );
    this.commands.register<RelationshipCommandPayload, SurfaceResult>(
      'relationship.clear',
      (command) => this.#clear(command.surfaceId, command.payload),
    );
  }

  attach(
    surface: SurfaceContext,
    entry: EntryStateRuntime,
    fields: readonly SysBOFieldMetadata[],
  ): () => void {
    if (this.#entries.has(surface.id))
      throw new Error(`V2 relationship entry already attached: ${surface.id}`);
    this.#entries.set(surface.id, {
      surface,
      entry,
      fields: new Map(fields.map((field) => [field.key, field])),
    });
    return () => this.#entries.delete(surface.id);
  }

  consumeChildResult(childSurfaceId: string): SurfaceResult | null {
    const route = this.#pending.get(childSurfaceId);
    const result = this.commands.takeResult(childSurfaceId);
    if (!route || !result) return result;
    this.#pending.delete(childSurfaceId);
    this.applyChildResult(route.sourceSurfaceId, route.targetField, result);
    return result;
  }

  applyChildResult(sourceSurfaceId: string, targetField: string, result: SurfaceResult): void {
    const attached = this.#requireEntry(sourceSurfaceId);
    if (!['selected', 'saved', 'cleared'].includes(result.outcome)) return;
    const value = result.outcome === 'cleared' ? null : (result.value ?? result.record?.id ?? null);
    attached.entry.fields.setValue({ field: targetField, value, source: 'relationship' });
  }

  #open(
    sourceSurfaceId: string,
    payload: RelationshipCommandPayload,
    action: 'add-entry' | 'select-existing' | 'open-entry',
  ): RelationshipOpenResult {
    const attached = this.#requireEntry(sourceSurfaceId);
    if (action === 'open-entry' && !payload.recordId)
      throw new Error('V2 relationship open requires recordId.');
    const field = this.#requireReferenceField(
      attached,
      payload.targetField,
      payload.targetEntityKey,
    );
    const decision = this.policy.evaluate({
      sourceSurface: attached.surface,
      ...(attached.surface.entityKey ? { sourceEntityKey: attached.surface.entityKey } : {}),
      ...(attached.surface.recordId ? { sourceRecordId: attached.surface.recordId } : {}),
      targetEntityKey: payload.targetEntityKey,
      targetField: payload.targetField,
      action,
      metadata: this.#policyMetadata(field, payload.metadata),
    });
    if (!decision.allowed || !decision.details)
      throw new Error(decision.reason ?? 'V2 relationship action denied by policy.');

    const child = this.commands.surfaces.open({
      parentId: attached.surface.id,
      host: 'popup',
      kind: action === 'select-existing' ? 'selector' : 'entry',
      mode: decision.details.mode,
      name: `${payload.targetField}-${action}`,
      scope: attached.surface.scope,
      entityKey: decision.details.targetEntityKey,
      ...(payload.recordId ? { recordId: payload.recordId } : {}),
      invocation: this.#invocation(attached, field, payload.targetField, action),
      ...(action === 'add-entry' ? { entry: { original: null, current: {} } } : {}),
    });
    this.#pending.set(child.id, { sourceSurfaceId, targetField: payload.targetField });
    return { childSurfaceId: child.id, mode: child.mode };
  }

  #clear(sourceSurfaceId: string, payload: RelationshipCommandPayload): SurfaceResult {
    const attached = this.#requireEntry(sourceSurfaceId);
    const field = this.#requireReferenceField(
      attached,
      payload.targetField,
      payload.targetEntityKey,
    );
    const decision = this.policy.evaluate({
      sourceSurface: attached.surface,
      targetEntityKey: payload.targetEntityKey,
      targetField: payload.targetField,
      action: 'clear',
      metadata: this.#policyMetadata(field, payload.metadata),
    });
    if (!decision.allowed) throw new Error(decision.reason ?? 'V2 relationship clear denied.');
    attached.entry.fields.setValue({
      field: payload.targetField,
      value: null,
      source: 'relationship',
    });
    return { outcome: 'cleared', surfaceId: sourceSurfaceId, value: null };
  }

  #invocation(
    attached: AttachedEntry,
    field: SysBOFieldMetadata,
    targetField: string,
    action: 'add-entry' | 'select-existing' | 'open-entry',
  ): SurfaceInvocation {
    const related = field.referenceSelection?.createRelated;
    const values = attached.entry.fields.values();
    const project = (
      mappings: Readonly<Record<string, Readonly<{ sourceField: string }>>> | undefined,
    ): Readonly<Record<string, unknown>> | undefined =>
      mappings
        ? Object.fromEntries(
            Object.entries(mappings).map(([target, mapping]) => [
              target,
              values[mapping.sourceField],
            ]),
          )
        : undefined;
    const defaults = action === 'add-entry' ? project(related?.defaults) : undefined;
    const overrides = action === 'add-entry' ? project(related?.fixedValues) : undefined;
    return {
      purpose: `relationship:${action}`,
      sourceSurfaceId: attached.surface.id,
      ...(attached.surface.entityKey ? { sourceEntityKey: attached.surface.entityKey } : {}),
      ...(attached.surface.recordId ? { sourceRecordId: attached.surface.recordId } : {}),
      ...(field.referenceBOKey ? { targetEntityKey: field.referenceBOKey } : {}),
      targetField,
      ...(action === 'select-existing' ? { selectionMode: 'single' as const } : {}),
      ...(defaults ? { defaults } : {}),
      ...(overrides ? { overrides } : {}),
      ...(related?.uiOverrides ? { uiOverrides: related.uiOverrides } : {}),
      ...(field.referenceSelection
        ? {
            parameters: {
              relationshipSelection: {
                ...(field.referenceSelection.filterExpression
                  ? { filterExpression: field.referenceSelection.filterExpression }
                  : {}),
                ...(field.referenceSelection.uniqueThrough
                  ? { uniqueThrough: field.referenceSelection.uniqueThrough }
                  : {}),
              },
            },
          }
        : {}),
    };
  }

  #policyMetadata(
    field: SysBOFieldMetadata,
    supplied: Readonly<Record<string, unknown>> | undefined,
  ): Readonly<Record<string, unknown>> {
    return {
      nullable: field.nullable !== false,
      allowCreate: true,
      allowSelect: true,
      ...(field.referenceSelection?.filterExpression
        ? { filterExpression: field.referenceSelection.filterExpression }
        : {}),
      ...(field.referenceSelection?.uniqueThrough
        ? { uniqueThrough: field.referenceSelection.uniqueThrough }
        : {}),
      ...(supplied ?? {}),
    };
  }

  #requireEntry(surfaceId: string): AttachedEntry {
    const attached = this.#entries.get(surfaceId);
    if (!attached) throw new Error(`No V2 relationship entry attached for surface ${surfaceId}.`);
    return attached;
  }

  #requireReferenceField(
    attached: AttachedEntry,
    fieldName: string,
    targetEntityKey: string,
  ): SysBOFieldMetadata {
    const field = attached.fields.get(fieldName);
    if (!field || field.type !== 'reference' || !field.referenceBOKey)
      throw new Error(`V2 relationship field is not a canonical reference: ${fieldName}`);
    if (field.referenceBOKey !== targetEntityKey)
      throw new Error(
        `V2 relationship target mismatch for ${fieldName}: expected ${field.referenceBOKey}, got ${targetEntityKey}.`,
      );
    return field;
  }
}
