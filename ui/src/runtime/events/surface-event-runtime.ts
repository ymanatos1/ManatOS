import type { SurfaceEventSource } from '../surface/contracts.js';

export type SurfaceEventType =
  | 'surface:creating'
  | 'surface:created'
  | 'surface:activating'
  | 'surface:activated'
  | 'surface:deactivating'
  | 'surface:closing'
  | 'surface:closed'
  | 'surface:disposed'
  | 'child:opening'
  | 'child:opened'
  | 'child:closing'
  | 'child:closed'
  | 'ctx:changing'
  | 'ctx:changed'
  | 'value:changing'
  | 'value:changed'
  | 'field-state:changed'
  | 'validation:changed'
  | 'entry:initialized'
  | 'entry:baseline-committed'
  | 'entry:dirty-changed'
  | 'entry:saving'
  | 'entry:deleting'
  | 'entry:saved'
  | 'entry:deleted'
  | 'selection:changing'
  | 'selection:changed'
  | 'command:executing'
  | 'command:executed'
  | 'command:failed';

export interface SurfaceEvent<TPayload = unknown> {
  readonly id: string;
  readonly sequence: number;
  readonly timestamp: number;
  readonly type: SurfaceEventType;
  readonly surfaceId: string;
  readonly source: SurfaceEventSource;
  readonly causeEventId: string | null;
  readonly payload: TPayload;
}

export interface EmitSurfaceEvent<TPayload = unknown> {
  readonly type: SurfaceEventType;
  readonly surfaceId: string;
  readonly source?: SurfaceEventSource;
  readonly causeEventId?: string | null;
  readonly payload: TPayload;
}

export type SurfaceEventHandler = (event: SurfaceEvent) => void;

/**
 * Per-UI-runtime event dispatcher.
 *
 * This is intentionally not a process-global singleton. A V2 runtime owns its
 * own subscriptions/history so tests, future browser sessions and comparison
 * runtimes cannot leak state into one another.
 */
export class SurfaceEventRuntime {
  readonly #handlers = new Map<SurfaceEventType | '*', Set<SurfaceEventHandler>>();
  readonly #history: SurfaceEvent[] = [];
  #sequence = 0;

  subscribe(type: SurfaceEventType | '*', handler: SurfaceEventHandler): () => void {
    const handlers = this.#handlers.get(type) ?? new Set<SurfaceEventHandler>();
    handlers.add(handler);
    this.#handlers.set(type, handlers);
    return () => {
      handlers.delete(handler);
      if (!handlers.size) this.#handlers.delete(type);
    };
  }

  emit<TPayload>(request: EmitSurfaceEvent<TPayload>): SurfaceEvent<TPayload> {
    const sequence = ++this.#sequence;
    const event: SurfaceEvent<TPayload> = Object.freeze({
      id: `evt-${sequence}`,
      sequence,
      timestamp: Date.now(),
      type: request.type,
      surfaceId: request.surfaceId,
      source: request.source ?? 'engine',
      causeEventId: request.causeEventId ?? null,
      payload: request.payload,
    });

    this.#history.push(event as SurfaceEvent);
    this.#dispatch(request.type, event as SurfaceEvent);
    this.#dispatch('*', event as SurfaceEvent);
    return event;
  }

  history(): readonly SurfaceEvent[] {
    return this.#history;
  }

  clearHistory(): void {
    this.#history.length = 0;
  }

  #dispatch(type: SurfaceEventType | '*', event: SurfaceEvent): void {
    for (const handler of this.#handlers.get(type) ?? []) handler(event);
  }
}
