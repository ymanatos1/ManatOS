import type { MultilingualLiteral } from '../../multilingual/metadata/index.js';
/** Stable subsystem ownership domain. Platform-owned subsystems name their platform id. */
export type ManatOSSubsystemOwner =
  Readonly<{ kind: 'manatos' }> | Readonly<{ kind: 'platform'; platformId: string }>;

export interface ManatOSEnumValueMetadata {
  value: string;
  label?: string | MultilingualLiteral;
  icon?: string;
  tone?: 'primary' | 'secondary' | 'success' | 'danger' | 'warning' | 'info';
  toneStrength?: 'soft' | 'normal' | 'strong';
  readonly [property: string]: unknown;
}

/** Canonical enum definition contributed by exactly one subsystem. */
export interface ManatOSEnumMetadata {
  key: string;
  name: string;
  label: string;
  values: Readonly<Record<string, ManatOSEnumValueMetadata>>;
  /** Properties calculated uniformly for every enum value and evaluated on CTX projection/access. */
  calculatedProperties?: Readonly<Record<string, Readonly<{ expression: string }>>>;
}

/** Canonical subsystem definition. Entity membership is derived from BO metadata. */
export interface ManatOSSubsystemMetadata {
  key: string;
  name: string;
  label: string;
  description: string;
  owner: ManatOSSubsystemOwner;
  /** Canonical enums contributed by this subsystem. */
  enums?: Readonly<Record<string, ManatOSEnumMetadata>>;
}
