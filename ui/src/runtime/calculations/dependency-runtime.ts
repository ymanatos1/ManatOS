import { reactiveDependencyMatchesChange } from '@manatos/shared';
import type { SurfaceEvent, SurfaceEventRuntime } from '../events/surface-event-runtime.js';
import { ROOT_CTX_EVENT_SURFACE_ID } from '../context/root-ctx-runtime.js';
import type { FieldStateRuntime, FieldUxState } from '../state/field-state-runtime.js';
import { surfaceDependencyPath } from '../resolvers/expression-binding.js';

export type DependencyPath = string;

export function fieldValueDependency(field: string): DependencyPath {
  return `fields.${field}.value`;
}

export interface CalculationContext {
  readonly values: Readonly<Record<string, unknown>>;
  readonly event: SurfaceEvent;
  readonly changedPath: DependencyPath;
}

export interface ValueCalculation {
  readonly target: string;
  /**
   * Canonical CTX dependency paths. A bare field name is accepted as shorthand
   * and normalized internally to fields.<name>.value; the normalized path is the
   * sole dependency identity used by the runtime.
   */
  readonly dependsOn: readonly DependencyPath[];
  readonly calculate: (context: CalculationContext) => unknown;
}

export interface UxCalculation {
  readonly target: string;
  readonly property: keyof FieldUxState;
  readonly dependsOn: readonly DependencyPath[];
  readonly calculate: (context: CalculationContext) => boolean;
}

/**
 * Dependency-driven V2 calculation runtime.
 *
 * Internally every dependency is a canonical CTX path. Field value events are
 * projected to `fields.<field>.value`; semantic CTX mutations arrive directly
 * through `ctx:changed`. This allows one graph to drive calculated field values
 * and UX properties from both entry values and legitimate surface state.
 */
export class DependencyRuntime {
  readonly #fields: FieldStateRuntime;
  readonly #valueByDependency = new Map<DependencyPath, ValueCalculation[]>();
  readonly #uxByDependency = new Map<DependencyPath, UxCalculation[]>();
  readonly #unsubscribers: (() => void)[];
  readonly #activeTargets = new Set<string>();
  #initialized = false;

  constructor(surfaceId: string, fields: FieldStateRuntime, events: SurfaceEventRuntime) {
    this.#fields = fields;
    this.#unsubscribers = [
      events.subscribe('value:changed', (event) => {
        if (!this.#initialized) return;
        const field = (event.payload as { field?: unknown }).field;
        if (typeof field !== 'string') return;
        const path = fieldValueDependency(field);
        // Existing local dependencies remain source-compatible; owner-qualified
        // dependencies additionally let descendants subscribe to inherited fields.
        if (event.surfaceId === surfaceId) this.#recalculate(path, event);
        this.#recalculate(surfaceDependencyPath(event.surfaceId, path), event);
      }),
      events.subscribe('entry:initialized', (event) => {
        if (event.surfaceId !== surfaceId) return;
        this.#initialized = true;
        // Initialization may assign values equal to their original baseline, in
        // which case no value:changed event is emitted. Calculated fields must
        // nevertheless receive one deterministic first evaluation.
        const dependencies = new Set([
          ...this.#valueByDependency.keys(),
          ...this.#uxByDependency.keys(),
        ]);
        for (const dependency of dependencies) this.#recalculate(dependency, event);
      }),
      events.subscribe('ctx:changed', (event) => {
        const path = (event.payload as { path?: unknown }).path;
        if (typeof path !== 'string' || !path.length) return;

        if (event.surfaceId === ROOT_CTX_EVENT_SURFACE_ID) {
          this.#recalculate(path, event);
          return;
        }

        // A relative local dependency still listens to the current surface. The
        // owner-qualified identity is evaluated for every surface event so a
        // child expression inherited from any ancestor reacts to that ancestor.
        if (event.surfaceId === surfaceId) this.#recalculate(path, event);
        this.#recalculate(surfaceDependencyPath(event.surfaceId, path), event);
      }),
    ];
  }

  registerValue(calculation: ValueCalculation): void {
    this.#register(this.#valueByDependency, calculation.dependsOn, calculation);
  }

  registerUx(calculation: UxCalculation): void {
    this.#register(this.#uxByDependency, calculation.dependsOn, calculation);
  }

  dispose(): void {
    for (const unsubscribe of this.#unsubscribers) unsubscribe();
  }

  #canonicalPath(path: DependencyPath): DependencyPath {
    // Existing V2 slice-02 callers used bare field names. Keep that API source
    // compatible while ensuring the graph itself stores only canonical paths.
    return !path.includes('.') && this.#fields.get(path) ? fieldValueDependency(path) : path;
  }

  #register<T>(
    map: Map<DependencyPath, T[]>,
    dependencies: readonly DependencyPath[],
    item: T,
  ): void {
    for (const rawDependency of dependencies) {
      const dependency = this.#canonicalPath(rawDependency);
      const items = map.get(dependency) ?? [];
      items.push(item);
      map.set(dependency, items);
    }
  }

  #recalculate(changedPath: DependencyPath, cause: SurfaceEvent): void {
    const context: CalculationContext = {
      values: this.#fields.values(),
      event: cause,
      changedPath,
    };

    const matching = <T>(map: ReadonlyMap<DependencyPath, readonly T[]>): readonly T[] => {
      const items = new Set<T>();
      for (const [dependency, candidates] of map) {
        if (reactiveDependencyMatchesChange(dependency, changedPath))
          for (const candidate of candidates) items.add(candidate);
      }
      return [...items];
    };

    for (const calculation of matching(this.#valueByDependency)) {
      const targetKey = `value:${calculation.target}`;
      if (this.#activeTargets.has(targetKey)) continue;
      this.#activeTargets.add(targetKey);
      try {
        this.#fields.setValue({
          field: calculation.target,
          value: calculation.calculate(context),
          source: 'calculation',
          causeEventId: cause.id,
        });
      } finally {
        this.#activeTargets.delete(targetKey);
      }
    }

    for (const calculation of matching(this.#uxByDependency)) {
      const targetKey = `ux:${calculation.target}:${calculation.property}`;
      if (this.#activeTargets.has(targetKey)) continue;
      this.#activeTargets.add(targetKey);
      try {
        this.#fields.setUx(
          calculation.target,
          calculation.property,
          calculation.calculate({
            values: this.#fields.values(),
            event: cause,
            changedPath,
          }),
          'calculation',
          cause.id,
        );
      } finally {
        this.#activeTargets.delete(targetKey);
      }
    }
  }
}
