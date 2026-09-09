import type { SurfaceContext } from '../surface/contracts.js';
import type { SurfaceRuntime } from '../surface/surface-runtime.js';

export interface HierarchyWorkspaceRuntimeOptions<T extends Readonly<Record<string, unknown>>> {
  readonly surface: SurfaceContext;
  readonly surfaces: SurfaceRuntime;
  readonly idField: keyof T & string;
  readonly parentField: keyof T & string;
  readonly rootField?: keyof T & string;
  readonly complete: (
    entries: readonly T[],
  ) => Readonly<{ complete: boolean; reason?: string | null }>;
}

/**
 * Host-neutral owner runtime for hierarchy/organization workspaces.
 *
 * The workspace owns one mutable working graph and one immutable baseline. Child
 * entry/selector surfaces are ordinary V2 descendants; they never become a
 * second persistence owner. Aggregate persistence therefore remains a single
 * command boundary at the workspace owner.
 */
export class HierarchyWorkspaceRuntime<T extends Readonly<Record<string, unknown>>> {
  #entries: T[];
  readonly #originalEntries: readonly T[];

  constructor(readonly options: HierarchyWorkspaceRuntimeOptions<T>) {
    if (options.surface.kind !== 'hierarchy' || options.surface.host !== 'page') {
      throw new Error(
        `HierarchyWorkspaceRuntime requires a page hierarchy surface: ${options.surface.id}`,
      );
    }
    this.#entries = [...((options.surface.list?.entries ?? []) as T[])];
    this.#originalEntries = Object.freeze([
      ...((options.surface.list?.originalEntries ?? []) as T[]).map(
        (entry) => Object.freeze({ ...entry }) as T,
      ),
    ]);
    this.#syncState('engine');
  }

  entries(): readonly T[] {
    return this.#entries;
  }

  originalEntries(): readonly T[] {
    return this.#originalEntries;
  }

  replace(entries: readonly T[], source: 'user' | 'relationship' | 'reset' = 'user'): void {
    this.#entries = this.#withCalculatedRoot(entries);
    if (this.options.surface.list)
      this.options.surface.list.entries = Object.freeze([...this.#entries]);
    this.#syncState(source);
  }

  upsert(entry: T, source: 'user' | 'relationship' = 'user'): void {
    const id = String(entry[this.options.idField] ?? '');
    const next = this.#entries.filter(
      (candidate) => String(candidate[this.options.idField] ?? '') !== id,
    );
    next.push(entry);
    this.replace(next, source);
  }

  remove(recordId: string): void {
    this.replace(
      this.#entries.filter(
        (entry) => String(entry[this.options.idField] ?? '') !== String(recordId),
      ),
      'relationship',
    );
  }

  reset(): void {
    this.replace(this.#originalEntries, 'reset');
  }

  isDirty(): boolean {
    const normalized = (rows: readonly T[]) =>
      [...rows]
        .map((row) => ({ ...row }))
        .sort((a, b) =>
          String(a[this.options.idField] ?? '').localeCompare(
            String(b[this.options.idField] ?? ''),
          ),
        );
    return (
      JSON.stringify(normalized(this.#entries)) !==
      JSON.stringify(normalized(this.#originalEntries))
    );
  }

  completion(): Readonly<{ complete: boolean; reason?: string | null }> {
    return this.options.complete(this.#entries);
  }

  #syncState(source: 'engine' | 'user' | 'relationship' | 'reset'): void {
    const completion = this.completion();
    this.options.surfaces.setState(this.options.surface.id, 'dirty', this.isDirty(), source);
    this.options.surfaces.setState(this.options.surface.id, 'valid', completion.complete, source);
  }

  #withCalculatedRoot(entries: readonly T[]): T[] {
    const rootField = this.options.rootField;
    if (!rootField) return entries.map((entry) => ({ ...entry }) as T);
    const idField = this.options.idField;
    const parentField = this.options.parentField;
    const cloned = entries.map((entry) => ({ ...entry }) as Record<string, unknown>);
    const byId = new Map(cloned.map((row) => [String(row[idField] ?? ''), row]));
    const rootFor = (row: Record<string, unknown>) => {
      const directParent = row[parentField];
      if (directParent == null || String(directParent) === '') return null;
      let cursorId = String(directParent);
      const visited = new Set([String(row[idField] ?? '')]);
      while (cursorId) {
        if (visited.has(cursorId)) return null;
        visited.add(cursorId);
        const cursor = byId.get(cursorId);
        if (!cursor) return cursorId;
        const parent = cursor[parentField];
        if (parent == null || String(parent) === '') return String(cursor[idField] ?? cursorId);
        cursorId = String(parent);
      }
      return null;
    };
    return cloned.map((row) => ({ ...row, [rootField]: rootFor(row) }) as T);
  }
}
