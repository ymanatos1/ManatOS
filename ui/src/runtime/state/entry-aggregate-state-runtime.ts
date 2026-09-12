import { calculateEntryAggregatePolicy, calculateEntryContributorAggregate } from '@manatos/shared';
import type { SurfaceEvent, SurfaceEventRuntime } from '../events/surface-event-runtime.js';
import type { SurfaceEventSource } from '../surface/contracts.js';
import type { SurfaceRuntime } from '../surface/surface-runtime.js';
import type { FieldStateRuntime } from './field-state-runtime.js';

export interface EntryStateContributor {
  readonly id: string;
  readonly dirty?: boolean;
  readonly valid?: boolean;
  readonly blocksPersistence?: boolean;
}

export interface EntryAggregateSnapshot {
  readonly dirty: boolean;
  readonly valid: boolean;
  readonly blocked: boolean;
  readonly saving: boolean;
  readonly deleting: boolean;
  readonly saveReady: boolean;
}

/**
 * Aggregates field/collection/child-editor state into canonical surface state.
 *
 * V2 deliberately does not let buttons inspect controls to infer Save state.
 * Any future collection or child editor contributes semantic state here; the
 * surface then exposes dirty/valid/blocked/saving/deleting through CTX and UI
 * actions may derive availability declaratively from those facts.
 */
export class EntryAggregateStateRuntime {
  readonly #surfaceId: string;
  readonly #surfaces: SurfaceRuntime;
  readonly #fields: FieldStateRuntime;
  readonly #events: SurfaceEventRuntime;
  readonly #contributors = new Map<string, EntryStateContributor>();
  readonly #unsubscribers: (() => void)[];
  #baselineCommitted = false;
  #snapshot: EntryAggregateSnapshot;

  constructor(surfaceId: string, surfaces: SurfaceRuntime, fields: FieldStateRuntime) {
    this.#surfaceId = surfaceId;
    this.#surfaces = surfaces;
    this.#fields = fields;
    this.#events = surfaces.events;
    this.#snapshot = this.#calculate();
    this.#unsubscribers = [
      this.#events.subscribe('value:changed', (event) => this.#onRelevant(event)),
      this.#events.subscribe('validation:changed', (event) => this.#onRelevant(event)),
      this.#events.subscribe('entry:baseline-committed', (event) => this.#onRelevant(event)),
    ];
    this.#sync(null);
  }

  snapshot(): EntryAggregateSnapshot {
    return this.#snapshot;
  }

  setContributor(contributor: EntryStateContributor, causeEventId?: string | null): void {
    this.#contributors.set(contributor.id, Object.freeze({ ...contributor }));
    this.#sync(causeEventId ?? null);
  }

  removeContributor(id: string, causeEventId?: string | null): void {
    if (!this.#contributors.delete(id)) return;
    this.#sync(causeEventId ?? null);
  }

  beginSave(source: SurfaceEventSource = 'command', causeEventId?: string | null): SurfaceEvent {
    if (!this.#snapshot.saveReady) throw new Error('V2 entry is not ready to save.');
    this.#surfaces.setState(this.#surfaceId, 'saving', true, source, causeEventId);
    const event = this.#events.emit({
      type: 'entry:saving',
      surfaceId: this.#surfaceId,
      source,
      causeEventId: causeEventId ?? null,
      payload: { values: this.#fields.values() },
    });
    this.#sync(event.id);
    return event;
  }

  saveFailed(source: SurfaceEventSource = 'command', causeEventId?: string | null): void {
    this.#surfaces.setState(this.#surfaceId, 'saving', false, source, causeEventId);
    this.#sync(causeEventId ?? null);
  }

  completeSave(source: SurfaceEventSource = 'server', causeEventId?: string | null): SurfaceEvent {
    this.#fields.commitBaseline();
    this.#surfaces.setState(this.#surfaceId, 'saving', false, source, causeEventId);
    const event = this.#events.emit({
      type: 'entry:saved',
      surfaceId: this.#surfaceId,
      source,
      causeEventId: causeEventId ?? null,
      payload: { values: this.#fields.values() },
    });
    this.#sync(event.id);
    return event;
  }

  beginDelete(source: SurfaceEventSource = 'command', causeEventId?: string | null): SurfaceEvent {
    const surface = this.#surfaces.find(this.#surfaceId);
    if (!surface) throw new Error(`V2 surface not found: ${this.#surfaceId}`);
    if (surface.mode === 'create') throw new Error('A new V2 entry cannot be deleted before save.');
    if (surface.state.saving || surface.state.deleting) {
      throw new Error('V2 entry persistence operation already in progress.');
    }
    this.#surfaces.setState(this.#surfaceId, 'deleting', true, source, causeEventId);
    const event = this.#events.emit({
      type: 'entry:deleting',
      surfaceId: this.#surfaceId,
      source,
      causeEventId: causeEventId ?? null,
      payload: {},
    });
    this.#sync(event.id);
    return event;
  }

  deleteFailed(source: SurfaceEventSource = 'command', causeEventId?: string | null): void {
    this.#surfaces.setState(this.#surfaceId, 'deleting', false, source, causeEventId);
    this.#sync(causeEventId ?? null);
  }

  completeDelete(
    source: SurfaceEventSource = 'server',
    causeEventId?: string | null,
  ): SurfaceEvent {
    this.#surfaces.setState(this.#surfaceId, 'deleting', false, source, causeEventId);
    const event = this.#events.emit({
      type: 'entry:deleted',
      surfaceId: this.#surfaceId,
      source,
      causeEventId: causeEventId ?? null,
      payload: {},
    });
    this.#sync(event.id);
    return event;
  }

  dispose(): void {
    for (const unsubscribe of this.#unsubscribers) unsubscribe();
  }

  #onRelevant(event: SurfaceEvent): void {
    if (event.surfaceId !== this.#surfaceId) return;
    if (event.type === 'entry:baseline-committed') this.#baselineCommitted = true;
    if (!this.#baselineCommitted) return;
    this.#sync(event.id);
  }

  #calculate(): EntryAggregateSnapshot {
    const surface = this.#surfaces.find(this.#surfaceId);
    if (!surface) throw new Error(`V2 surface not found: ${this.#surfaceId}`);
    const contributors = calculateEntryContributorAggregate([...this.#contributors.values()]);
    const { saving, deleting, loading } = surface.state;
    const policy = calculateEntryAggregatePolicy({
      mode: surface.mode,
      fieldDirty: this.#fields.all().some((field) => field.dirty),
      fieldValid: this.#fields.all().every((field) => field.valid),
      contributorDirty: contributors.dirty,
      contributorValid: contributors.valid,
      blocked: contributors.blocked,
      loading,
      saving,
      deleting,
    });
    return { ...policy, saving, deleting };
  }

  #sync(causeEventId: string | null): void {
    const next = this.#calculate();
    const previous = this.#snapshot;

    if (previous.dirty !== next.dirty) {
      this.#surfaces.setState(this.#surfaceId, 'dirty', next.dirty, 'engine', causeEventId);
      this.#events.emit({
        type: 'entry:dirty-changed',
        surfaceId: this.#surfaceId,
        source: 'engine',
        causeEventId,
        payload: { oldValue: previous.dirty, newValue: next.dirty },
      });
    }
    if (previous.valid !== next.valid) {
      this.#surfaces.setState(this.#surfaceId, 'valid', next.valid, 'engine', causeEventId);
    }
    if (previous.blocked !== next.blocked) {
      this.#surfaces.setState(this.#surfaceId, 'blocked', next.blocked, 'engine', causeEventId);
    }

    this.#snapshot = this.#calculate();
  }
}
