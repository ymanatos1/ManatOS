import type { SurfaceContext, SurfaceHost, SurfaceMode } from '../surface/contracts.js';

export interface PolicyDecision<TDetails = Readonly<Record<string, unknown>>> {
  readonly allowed: boolean;
  readonly reason?: string;
  readonly details?: TDetails;
}

export interface NavigationPolicyRequest {
  readonly parent: SurfaceContext | null;
  readonly childHost: SurfaceHost;
}

export interface RelationshipPolicyRequest {
  readonly sourceSurface: SurfaceContext;
  readonly sourceEntityKey?: string;
  readonly sourceRecordId?: string;
  readonly targetEntityKey: string;
  readonly targetField: string;
  readonly action: 'select-existing' | 'add-entry' | 'clear' | 'open-entry';
  readonly requestedMode?: SurfaceMode;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface RelationshipPolicyDetails {
  readonly targetEntityKey: string;
  readonly targetField: string;
  readonly mode: SurfaceMode;
  readonly returnOutcome: 'selected' | 'saved' | 'cleared' | 'completed';
  readonly constraints: Readonly<Record<string, unknown>>;
}

export interface SurfacePurposePolicyRequest {
  readonly surface: SurfaceContext;
  readonly purpose?: string;
}

export interface SurfacePurposePolicyDetails {
  readonly purpose: string | null;
  readonly allowedActions: readonly string[];
}
