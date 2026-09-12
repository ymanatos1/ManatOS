import { reactiveDependencyMatchesChange } from '@manatos/shared';
import type { SurfaceEvent, SurfaceEventRuntime } from '../events/surface-event-runtime.js';
import { ROOT_CTX_EVENT_SURFACE_ID } from '../context/root-ctx-runtime.js';
import type { FieldStateRuntime, FieldUxState } from '../state/field-state-runtime.js';
import { surfaceDependencyPath } from '../resolvers/expression-binding.js';

export type DependencyPath = string;

export function fieldValueDependency(field: string): DependencyPath {
  return `fields.${field}.value`;
}

/**
 * Project one canonical runtime event into the dependency identities observable
 * from an owning surface. Local events expose both their concise local path and
 * their owner-qualified path; ancestor/sibling surface events expose only the
 * owner-qualified identity; root CTX events already carry an absolute `ctx.*`
 * path. Keeping this projection in one place prevents calculations, validation
 * and other reactive metadata consumers from drifting into subtly different
 * ownership semantics.
 */
export function dependencyChangePathsForEvent(
  ownerSurfaceId: string,
  event: SurfaceEvent,
): readonly DependencyPath[] {
  if (event.type === 'value:changed') {
    const field = (event.payload as { field?: unknown }).field;
    if (typeof field !== 'string') return [];
    const path = fieldValueDependency(field);
    return event.surfaceId === ownerSurfaceId
      ? [path, surfaceDependencyPath(event.surfaceId, path)]
      : [surfaceDependencyPath(event.surfaceId, path)];
  }

  if (event.type === 'ctx:changed') {
    const path = (event.payload as { path?: unknown }).path;
    if (typeof path !== 'string' || !path.length) return [];
    if (event.surfaceId === ROOT_CTX_EVENT_SURFACE_ID) return [path];
    return event.surfaceId === ownerSurfaceId
      ? [path, surfaceDependencyPath(event.surfaceId, path)]
      : [surfaceDependencyPath(event.surfaceId, path)];
  }

  return [];
}

/** Return true when a canonical runtime event can invalidate any dependency. */
export function reactiveEventMatchesDependencies(
  ownerSurfaceId: string,
  event: SurfaceEvent,
  dependencies: readonly DependencyPath[],
): boolean {
  const changedPaths = dependencyChangePathsForEvent(ownerSurfaceId, event);
  return dependencies.some((dependency) =>
    changedPaths.some((changedPath) => reactiveDependencyMatchesChange(dependency, changedPath)),
  );
}

export interface CalculationContext {
  readonly values: Readonly<Record<string, unknown>>;
  readonly event: SurfaceEvent;
  readonly changedPath: DependencyPath;
}

export interface ValueCalculation {
  readonly target: string;
  /** Canonical CTX dependency paths owned by the caller's resolved expression scope. */
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
        this.#recalculateEvent(surfaceId, event);
      }),
      events.subscribe('entry:initialized', (event) => {
        if (event.surfaceId !== surfaceId) return;
        this.#initialized = true;
        // Initialization may assign values equal to their original baseline, in
        // which case no value:changed event is emitted. Calculated fields must
        // nevertheless receive one deterministic first evaluation.
        this.#recalculateAll(event);
      }),
      events.subscribe('ctx:changed', (event) => {
        // CTX may change while a surface is still building its initialization
        // baseline. Do not evaluate metadata against that partial state; the
        // entry:initialized pass below deterministically evaluates every
        // registered dependency once the entry is complete.
        if (!this.#initialized) return;
        this.#recalculateEvent(surfaceId, event);
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

  #register<T>(
    map: Map<DependencyPath, T[]>,
    dependencies: readonly DependencyPath[],
    item: T,
  ): void {
    for (const dependency of dependencies) {
      const items = map.get(dependency) ?? [];
      items.push(item);
      map.set(dependency, items);
    }
  }

  #recalculateEvent(ownerSurfaceId: string, cause: SurfaceEvent): void {
    const changedPaths = dependencyChangePathsForEvent(ownerSurfaceId, cause);
    if (!changedPaths.length) return;
    this.#recalculateMatching(changedPaths, cause);
  }

  #recalculateAll(cause: SurfaceEvent): void {
    const dependencies = new Set([
      ...this.#valueByDependency.keys(),
      ...this.#uxByDependency.keys(),
    ]);
    this.#recalculateMatching([...dependencies], cause);
  }

  #recalculateMatching(changedPaths: readonly DependencyPath[], cause: SurfaceEvent): void {
    const matching = <T>(
      map: ReadonlyMap<DependencyPath, readonly T[]>,
    ): ReadonlyMap<T, DependencyPath> => {
      const items = new Map<T, DependencyPath>();
      for (const [dependency, candidates] of map) {
        const changedPath = changedPaths.find((path) =>
          reactiveDependencyMatchesChange(dependency, path),
        );
        if (!changedPath) continue;
        for (const candidate of candidates) {
          if (!items.has(candidate)) items.set(candidate, changedPath);
        }
      }
      return items;
    };

    for (const [calculation, changedPath] of matching(this.#valueByDependency)) {
      const targetKey = `value:${calculation.target}`;
      if (this.#activeTargets.has(targetKey)) continue;
      this.#activeTargets.add(targetKey);
      try {
        this.#fields.setValue({
          field: calculation.target,
          value: calculation.calculate({
            values: this.#fields.values(),
            event: cause,
            changedPath,
          }),
          source: 'calculation',
          causeEventId: cause.id,
        });
      } finally {
        this.#activeTargets.delete(targetKey);
      }
    }

    for (const [calculation, changedPath] of matching(this.#uxByDependency)) {
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
