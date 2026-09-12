import type {
  FieldStateRuntime,
  FieldUxState,
  FieldValidationIssue,
} from '../state/field-state-runtime.js';
import type { SurfaceContext } from '../surface/contracts.js';
import type { SurfaceRuntime } from '../surface/surface-runtime.js';

export interface SurfaceCtxControlNode {
  readonly id: string;
  readonly host: SurfaceContext['host'];
  readonly kind: SurfaceContext['kind'];
  readonly mode: SurfaceContext['mode'];
  readonly name: string;
  readonly path: string;
  readonly scope: string;
  readonly invocation: SurfaceContext['invocation'];
  readonly presentation: SurfaceContext['presentation'];
  readonly state: SurfaceContext['state'];
  /** Universal surface-facts folder. Empty when the level currently publishes no facts. */
  readonly facts: Readonly<Record<string, unknown>>;
  readonly entityKey?: string;
  /** Canonical symbolic entity name used by ctx.entities (for example sysExtAuthProviders). */
  readonly entityName?: string;
  readonly recordId?: string;
}

export interface SurfaceCtxNode {
  readonly control: SurfaceCtxControlNode;
  readonly selection?: SurfaceContext['selection'];
  readonly row?: SurfaceContext['row'];
  /** Component-owned host-neutral read models published by the surface. */
  readonly resources?: Readonly<Record<string, unknown>>;
  /** Canonical entry runtime projection for entry surfaces. */
  readonly entry?: {
    readonly original: Readonly<Record<string, unknown>> | null;
    readonly current: Readonly<Record<string, unknown>>;
  };
  /** Canonical list runtime projection for list/selector surfaces. */
  readonly list?: {
    readonly originalEntries: readonly Readonly<Record<string, unknown>>[];
    readonly entries: readonly Readonly<Record<string, unknown>>[];
  };
  readonly fields?: Readonly<
    Record<
      string,
      {
        readonly value: unknown;
        readonly originalValue: unknown;
        readonly dirty: boolean;
        readonly valid: boolean;
        readonly validationIssues: readonly FieldValidationIssue[];
        readonly ux: Readonly<FieldUxState>;
      }
    >
  >;
  readonly level?: SurfaceCtxNode;
}

export interface UiCtxProjection {
  /** Root of the single currently displayed V2 UI chain. */
  readonly level: SurfaceCtxNode | null;
}

/**
 * Canonical CTX projection of the V2 surface runtime.
 *
 * The projection is depth-independent and preserves one semantic location for
 * host/kind/mode. Field values use the standard CTX `{ value }` shape so the
 * expression language can consume the canonical UI state without introducing a
 * second page/popup construction model.
 */
export function projectUiCtx(
  runtime: SurfaceRuntime,
  fieldsBySurface: ReadonlyMap<string, FieldStateRuntime> = new Map(),
): UiCtxProjection {
  const active = runtime.activeSurface();
  if (!active) return { level: null };

  // SurfaceRuntime may retain semantic ownership registries internally, but public CTX is
  // intentionally the currently displayed navigation chain. Navigation ancestry is therefore
  // authoritative here; semantic parentId/children must not leak into presentation topology.
  const chain: SurfaceContext[] = [];
  let cursor: SurfaceContext | null = active;
  while (cursor) {
    chain.unshift(cursor);
    cursor = cursor.navigationParentId ? runtime.find(cursor.navigationParentId) : null;
  }

  const project = (surface: SurfaceContext, child?: SurfaceCtxNode): SurfaceCtxNode => {
    const fieldRuntime = fieldsBySurface.get(surface.id);
    const fields = fieldRuntime
      ? Object.fromEntries(
          fieldRuntime.all().map((field) => [
            field.name,
            {
              value: field.value,
              originalValue: field.originalValue,
              dirty: field.dirty,
              valid: field.valid,
              validationIssues: field.validationIssues,
              ux: field.ux,
            },
          ]),
        )
      : undefined;

    const entry = surface.entry
      ? {
          original: surface.entry.original,
          // FieldStateRuntime is authoritative once an EntityEntryRuntime exists.
          // Falling back to the surface seed keeps the projection valid before
          // entry runtime construction and for non-field host-neutral consumers.
          current: fieldRuntime ? fieldRuntime.values() : surface.entry.current,
        }
      : undefined;
    const list = surface.list
      ? {
          originalEntries: surface.list.originalEntries,
          entries: surface.list.entries,
        }
      : undefined;

    return {
      control: {
        id: surface.id,
        host: surface.host,
        kind: surface.kind,
        mode: surface.mode,
        name: surface.name,
        path: surface.path,
        scope: surface.scope,
        invocation: surface.invocation,
        presentation: surface.presentation,
        state: surface.state,
        facts: surface.facts ?? {},
        ...(surface.entityKey ? { entityKey: surface.entityKey } : {}),
        ...(surface.entityName ? { entityName: surface.entityName } : {}),
        ...(surface.recordId ? { recordId: surface.recordId } : {}),
      },
      ...(surface.selection ? { selection: surface.selection } : {}),
      ...(surface.row ? { row: surface.row } : {}),
      ...(surface.resources ? { resources: surface.resources } : {}),
      ...(entry ? { entry } : {}),
      ...(list ? { list } : {}),
      ...(fields ? { fields } : {}),
      ...(child ? { level: child } : {}),
    };
  };

  let nested: SurfaceCtxNode | undefined;
  for (let index = chain.length - 1; index >= 0; index -= 1) {
    nested = project(chain[index]!, nested);
  }
  return { level: nested ?? null };
}

/** Derive the active V2 UI level from the authoritative nested CTX projection. */
export function currentUiLevel(ui: UiCtxProjection): SurfaceCtxNode | null {
  let level = ui.level;
  while (level?.level) level = level.level;
  return level;
}

/** Derive the root-to-current V2 UI level chain from the public CTX projection. */
export function traverseUiLevels(ui: UiCtxProjection): readonly SurfaceCtxNode[] {
  const levels: SurfaceCtxNode[] = [];
  let level = ui.level;
  while (level) {
    levels.push(level);
    level = level.level ?? null;
  }
  return levels;
}

/** Canonical CTX path of the deepest currently displayed V2 UI level. */
export function currentUiLevelPath(ui: UiCtxProjection): string | null {
  if (!ui.level) return null;
  let path = 'ctx.ui.level';
  let level = ui.level;
  while (level.level) {
    level = level.level;
    path += '.level';
  }
  return path;
}
