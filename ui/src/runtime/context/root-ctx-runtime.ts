import type { ManatOSContext } from '@manatos/shared';
import type { SurfaceEventRuntime } from '../events/surface-event-runtime.js';
import type { FieldStateRuntime } from '../state/field-state-runtime.js';
import type { SurfaceEventSource } from '../surface/contracts.js';
import type { SurfaceRuntime } from '../surface/surface-runtime.js';
import { projectUiCtx, type UiCtxProjection } from './surface-ctx-projection.js';

export const ROOT_CTX_EVENT_SURFACE_ID = '@ctx-root';

export type RootCtxAuthority = 'server-resolved' | 'ui-runtime';

export interface RootCtxMutablePathDefinition {
  readonly path: `ctx.${string}`;
  readonly owner: string;
  readonly authority: RootCtxAuthority;
  readonly description?: string;
}

export interface RootCtxMutationRequest {
  readonly path: `ctx.${string}`;
  readonly value: unknown;
  readonly owner: string;
  readonly source?: SurfaceEventSource;
  readonly causeEventId?: string | null;
}

export interface V2RootCtxProjection extends Pick<
  ManatOSContext,
  'system' | 'entities' | 'company' | 'user'
> {
  readonly ui: UiCtxProjection;
}

function pathMembers(path: `ctx.${string}`): readonly string[] {
  const members = path.split('.');
  if (members.shift() !== 'ctx' || !members.length || members.some((member) => !member)) {
    throw new Error(`Invalid V2 root CTX path: ${path}`);
  }
  return members;
}

function readPath(root: unknown, members: readonly string[]): unknown {
  let cursor = root;
  for (const member of members) {
    if (!cursor || typeof cursor !== 'object') return undefined;
    cursor = (cursor as Record<string, unknown>)[member];
  }
  return cursor;
}

/**
 * Return a new object tree with one path replaced. Existing/frozen ManatOS root
 * branches are never mutated in place; only containers on the changed path are
 * shallow-cloned. This keeps the V2 root runtime compatible with immutable
 * server-created context snapshots while giving mutable semantic facts a single
 * event-owning runtime.
 */
function replacePath(
  root: Record<string, unknown>,
  members: readonly string[],
  value: unknown,
): Record<string, unknown> {
  const [head, ...tail] = members;
  if (!head) return root;
  if (!tail.length) return { ...root, [head]: value };

  const existing = root[head];
  const child =
    existing && typeof existing === 'object' && !Array.isArray(existing)
      ? (existing as Record<string, unknown>)
      : {};
  return { ...root, [head]: replacePath(child, tail, value) };
}

/**
 * Authoritative V2 root CTX runtime.
 *
 * Root/global semantic state is deliberately not a free-form mutable object.
 * A path must first declare its owner and authority. Mutations then emit the
 * same canonical ctx:changing/ctx:changed events consumed by every V2 surface
 * dependency graph. The `ui` branch is projected from SurfaceRuntime and is not
 * separately writable.
 */
export class RootCtxRuntime {
  readonly #events: SurfaceEventRuntime;
  readonly #surfaces: SurfaceRuntime;
  readonly #fieldsBySurface: ReadonlyMap<string, FieldStateRuntime>;
  readonly #definitions = new Map<string, RootCtxMutablePathDefinition>();
  #semanticRoot: Record<string, unknown>;

  constructor(
    seed: Pick<ManatOSContext, 'system' | 'entities' | 'company' | 'user'>,
    surfaces: SurfaceRuntime,
    events: SurfaceEventRuntime,
    fieldsBySurface: ReadonlyMap<string, FieldStateRuntime> = new Map(),
  ) {
    this.#events = events;
    this.#surfaces = surfaces;
    this.#fieldsBySurface = fieldsBySurface;
    this.#semanticRoot = {
      system: seed.system,
      entities: seed.entities,
      company: seed.company,
      user: seed.user,
    };
  }

  registerMutable(definition: RootCtxMutablePathDefinition): void {
    if (definition.path === 'ctx.ui' || definition.path.startsWith('ctx.ui.')) {
      throw new Error(
        'V2 ctx.ui is SurfaceRuntime-owned and cannot be registered as root mutable state.',
      );
    }
    const existing = this.#definitions.get(definition.path);
    if (existing && existing.owner !== definition.owner) {
      throw new Error(
        `V2 root CTX path ${definition.path} is already owned by ${existing.owner}; ${definition.owner} cannot claim it.`,
      );
    }
    this.#definitions.set(definition.path, Object.freeze({ ...definition }));
  }

  definitions(): readonly RootCtxMutablePathDefinition[] {
    return [...this.#definitions.values()];
  }

  value(path: `ctx.${string}`): unknown {
    if (path === 'ctx.ui' || path.startsWith('ctx.ui.')) {
      return readPath(
        { ui: projectUiCtx(this.#surfaces, this.#fieldsBySurface) },
        pathMembers(path),
      );
    }
    return readPath(this.#semanticRoot, pathMembers(path));
  }

  set(request: RootCtxMutationRequest) {
    return this.setMany([request])[0] ?? null;
  }

  /**
   * Apply correlated root-state changes atomically before any ctx:changed event
   * is dispatched. This prevents expressions from observing half-updated pairs
   * such as currentPlatform/currentPlatformIndex.
   */
  setMany(requests: readonly RootCtxMutationRequest[]) {
    const changes = requests.flatMap((request) => {
      const definition = this.#definitions.get(request.path);
      if (!definition) {
        throw new Error(`V2 root CTX path is not registered as mutable: ${request.path}`);
      }
      if (definition.owner !== request.owner) {
        throw new Error(
          `V2 root CTX owner mismatch for ${request.path}: expected ${definition.owner}, received ${request.owner}.`,
        );
      }
      const members = pathMembers(request.path);
      const oldValue = readPath(this.#semanticRoot, members);
      return Object.is(oldValue, request.value) ? [] : [{ request, definition, members, oldValue }];
    });

    if (!changes.length) return [];

    const changingEvents = changes.map(({ request, definition, oldValue }) =>
      this.#events.emit({
        type: 'ctx:changing',
        surfaceId: ROOT_CTX_EVENT_SURFACE_ID,
        source: request.source ?? 'server',
        causeEventId: request.causeEventId ?? null,
        payload: {
          path: request.path,
          oldValue,
          newValue: request.value,
          owner: definition.owner,
          authority: definition.authority,
        },
      }),
    );

    for (const { request, members } of changes) {
      this.#semanticRoot = replacePath(this.#semanticRoot, members, request.value);
    }

    return changes.map(({ request, definition, oldValue }, index) =>
      this.#events.emit({
        type: 'ctx:changed',
        surfaceId: ROOT_CTX_EVENT_SURFACE_ID,
        source: request.source ?? 'server',
        causeEventId: request.causeEventId ?? changingEvents[index]?.id ?? null,
        payload: {
          path: request.path,
          oldValue,
          newValue: request.value,
          owner: definition.owner,
          authority: definition.authority,
        },
      }),
    );
  }

  snapshot(): V2RootCtxProjection {
    return {
      system: this.#semanticRoot.system as ManatOSContext['system'],
      entities: this.#semanticRoot.entities as ManatOSContext['entities'],
      company: this.#semanticRoot.company as ManatOSContext['company'],
      user: this.#semanticRoot.user as ManatOSContext['user'],
      ui: projectUiCtx(this.#surfaces, this.#fieldsBySurface),
    };
  }
}
