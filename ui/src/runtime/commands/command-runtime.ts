import type { SurfaceEventRuntime } from '../events/surface-event-runtime.js';
import type { SurfaceRuntime } from '../surface/surface-runtime.js';
import type { SurfaceResult } from '../surface/result-contracts.js';
import type {
  CloseSurfaceCommandPayload,
  CommandResult,
  OpenSurfaceCommandPayload,
  SurfaceCommand,
  SurfaceCommandName,
} from './command-contracts.js';

export type CommandHandler<TPayload = unknown, TValue = unknown> = (
  command: SurfaceCommand<TPayload>,
) => TValue | Promise<TValue>;

/**
 * Central V2 side-effect dispatcher.
 *
 * Policies decide whether/what is allowed; commands perform the side effect.
 * Components should request commands instead of wiring Save/Delete/Open/etc.
 * independently.
 */
export class CommandRuntime {
  readonly #handlers = new Map<SurfaceCommandName, CommandHandler>();
  readonly #results = new Map<string, SurfaceResult>();

  constructor(
    readonly surfaces: SurfaceRuntime,
    readonly events: SurfaceEventRuntime,
  ) {
    this.register<OpenSurfaceCommandPayload>('surface.open', (command) => {
      const parent = this.surfaces.find(command.surfaceId);
      if (!parent) {
        throw new Error(`V2 command source surface not found: ${command.surfaceId}`);
      }
      return this.surfaces.open({ ...command.payload.request, parentId: parent.id });
    });

    this.register<CloseSurfaceCommandPayload>('surface.close', (command) => {
      const result: SurfaceResult = {
        outcome: command.payload.result?.outcome ?? 'closed',
        surfaceId: command.surfaceId,
        ...(command.payload.result?.value !== undefined
          ? { value: command.payload.result.value }
          : {}),
        ...(command.payload.result?.record ? { record: command.payload.result.record } : {}),
        ...(command.payload.result?.metadata ? { metadata: command.payload.result.metadata } : {}),
      };
      this.#results.set(command.surfaceId, result);
      this.surfaces.close(command.surfaceId);
      return result;
    });

    this.register('surface.back', (command) => {
      const surface = this.surfaces.find(command.surfaceId);
      if (!surface) throw new Error(`V2 command source surface not found: ${command.surfaceId}`);
      const parentId = surface.parentId;
      const result: SurfaceResult = { outcome: 'cancelled', surfaceId: surface.id };
      this.#results.set(surface.id, result);
      this.surfaces.close(surface.id);
      return parentId ? this.surfaces.find(parentId) : null;
    });
  }

  register<TPayload = unknown, TValue = unknown>(
    name: SurfaceCommandName,
    handler: CommandHandler<TPayload, TValue>,
  ): void {
    if (this.#handlers.has(name)) throw new Error(`V2 command handler already registered: ${name}`);
    this.#handlers.set(name, handler as CommandHandler);
  }

  has(name: SurfaceCommandName): boolean {
    return this.#handlers.has(name);
  }

  result(surfaceId: string): SurfaceResult | null {
    return this.#results.get(surfaceId) ?? null;
  }

  takeResult(surfaceId: string): SurfaceResult | null {
    const result = this.#results.get(surfaceId) ?? null;
    this.#results.delete(surfaceId);
    return result;
  }

  async execute<TPayload = unknown, TValue = unknown>(
    command: SurfaceCommand<TPayload>,
  ): Promise<CommandResult<TValue>> {
    const handler = this.#handlers.get(command.name);
    if (!handler) throw new Error(`No V2 command handler registered for ${command.name}`);

    const event = this.events.emit({
      type: 'command:executing',
      surfaceId: command.surfaceId,
      source: 'command',
      causeEventId: command.causeEventId ?? null,
      payload: { name: command.name },
    });

    try {
      const value = (await handler(command as SurfaceCommand)) as TValue;
      const surfaceResult =
        value &&
        typeof value === 'object' &&
        'outcome' in (value as object) &&
        'surfaceId' in (value as object)
          ? (value as unknown as SurfaceResult)
          : undefined;
      this.events.emit({
        type: 'command:executed',
        surfaceId: command.surfaceId,
        source: 'command',
        causeEventId: event.id,
        payload: { name: command.name },
      });
      return {
        command: command.name,
        surfaceId: command.surfaceId,
        ...(value !== undefined ? { value } : {}),
        ...(surfaceResult ? { surfaceResult } : {}),
      };
    } catch (error) {
      this.events.emit({
        type: 'command:failed',
        surfaceId: command.surfaceId,
        source: 'command',
        causeEventId: event.id,
        payload: {
          name: command.name,
          message: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }
  }
}
