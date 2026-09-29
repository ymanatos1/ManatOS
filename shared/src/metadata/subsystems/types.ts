/** Stable subsystem ownership domain. Platform-owned subsystems name their platform id. */
export type ManatOSSubsystemOwner =
  Readonly<{ kind: 'manatos' }> | Readonly<{ kind: 'platform'; platformId: string }>;

/** Canonical subsystem definition. Entity membership is derived from BO metadata. */
export interface ManatOSSubsystemMetadata {
  key: string;
  name: string;
  label: string;
  description: string;
  owner: ManatOSSubsystemOwner;
}
