import type { OpenSurfaceRequest } from '../surface/contracts.js';
import type { SurfaceResult } from '../surface/result-contracts.js';

export type SurfaceCommandName =
  | 'surface.open'
  | 'surface.close'
  | 'surface.back'
  | 'entry.save'
  | 'entry.delete'
  | 'relationship.add'
  | 'relationship.select'
  | 'relationship.clear'
  | 'relationship.open';

export interface SurfaceCommand<TPayload = unknown> {
  readonly name: SurfaceCommandName;
  readonly surfaceId: string;
  readonly payload: TPayload;
  readonly causeEventId?: string | null;
}

export interface OpenSurfaceCommandPayload {
  readonly request: OpenSurfaceRequest;
}

export interface CloseSurfaceCommandPayload {
  readonly result?: Omit<SurfaceResult, 'surfaceId'>;
}

export interface RelationshipCommandPayload {
  readonly targetEntityKey: string;
  readonly targetField: string;
  readonly recordId?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface CommandResult<TValue = unknown> {
  readonly command: SurfaceCommandName;
  readonly surfaceId: string;
  readonly value?: TValue;
  readonly surfaceResult?: SurfaceResult;
}
