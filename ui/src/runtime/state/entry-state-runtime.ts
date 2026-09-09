import type { SurfaceEventSource } from '../surface/contracts.js';
import type { SurfaceEventRuntime } from '../events/surface-event-runtime.js';
import {
  DependencyRuntime,
  type UxCalculation,
  type ValueCalculation,
} from '../calculations/dependency-runtime.js';
import { FieldStateRuntime } from './field-state-runtime.js';

export interface EntryInitialization {
  readonly server?: Readonly<Record<string, unknown>>;
  readonly metadataDefaults?: Readonly<Record<string, unknown>>;
  readonly callerDefaults?: Readonly<Record<string, unknown>>;
  readonly callerOverrides?: Readonly<Record<string, unknown>>;
}

/**
 * Coordinates one V2 entry's fields, dependencies and initialization order.
 * Dependencies are wired before any defaults are applied, guaranteeing that
 * initialization and later interaction have identical reactive semantics.
 */
export class EntryStateRuntime {
  readonly fields: FieldStateRuntime;
  readonly dependencies: DependencyRuntime;
  readonly #surfaceId: string;
  readonly #events: SurfaceEventRuntime;

  constructor(surfaceId: string, events: SurfaceEventRuntime) {
    this.#surfaceId = surfaceId;
    this.#events = events;
    this.fields = new FieldStateRuntime(surfaceId, events);
    this.dependencies = new DependencyRuntime(surfaceId, this.fields, events);
  }

  defineField(name: string, originalValue: unknown = null): void {
    this.fields.define(name, originalValue);
  }

  addValueCalculation(calculation: ValueCalculation): void {
    this.dependencies.registerValue(calculation);
  }

  addUxCalculation(calculation: UxCalculation): void {
    this.dependencies.registerUx(calculation);
  }

  initialize(initialization: EntryInitialization): void {
    this.apply(initialization.server, 'server');
    this.apply(initialization.metadataDefaults, 'metadata-default');
    this.apply(initialization.callerDefaults, 'caller-default');
    this.apply(initialization.callerOverrides, 'caller-override');
    this.completeInitialization();
  }

  apply(values: Readonly<Record<string, unknown>> | undefined, source: SurfaceEventSource): void {
    this.#apply(values, source);
  }

  completeInitialization(): void {
    /*
     * Initialization is a baseline-building phase, not a user edit. Emit the
     * initialized event first so dependency calculations can deterministically
     * settle derived values, then commit that settled state as the clean
     * baseline. Full-page and popup hosts therefore observe the same final
     * dirty semantics without any presenter-specific reset.
     */
    const initialized = this.#events.emit({
      type: 'entry:initialized',
      surfaceId: this.#surfaceId,
      source: 'engine',
      payload: { values: this.fields.values() },
    });
    this.fields.commitBaseline();
    this.#events.emit({
      type: 'entry:baseline-committed',
      surfaceId: this.#surfaceId,
      source: 'engine',
      causeEventId: initialized.id,
      payload: { values: this.fields.values() },
    });
  }

  dispose(): void {
    this.dependencies.dispose();
  }

  #apply(values: Readonly<Record<string, unknown>> | undefined, source: SurfaceEventSource): void {
    for (const [field, value] of Object.entries(values ?? {})) {
      if (!this.fields.get(field)) continue;
      this.fields.setValue({ field, value, source });
    }
  }
}
