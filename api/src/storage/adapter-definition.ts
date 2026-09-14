/**
 * Declarative API/UI projection for one concrete storage adapter.
 *
 * Canonical family inheritance and native capabilities are resolved by the
 * storage registry before this projection is exposed to consumers.
 */
export type StorageAdapterFieldType =
  'text' | 'path' | 'number' | 'password' | 'boolean' | 'select';

export interface StorageAdapterFieldOption {
  value: string;
  label: string;
}

export interface StorageAdapterFieldDependency {
  key: string;
  equals: string;
}

export interface StorageAdapterFieldDefinition {
  key: string;
  label: string;
  description: string;
  type: StorageAdapterFieldType;
  required: boolean;
  /** Optional responsive Bootstrap grid span used by the generic editor. */
  columnClass?: string;
  /** Makes a field required only while another field has the given value. */
  requiredWhen?: StorageAdapterFieldDependency;
  /** Hides the field unless another field has the given value. */
  visibleWhen?: StorageAdapterFieldDependency;
  /** Optional engine-familiar visual treatment for the generic editor. */
  presentation?: 'checkbox';
  /** Default written into a new configuration editor and persisted when untouched. */
  defaultValue?: string;
  /** Suggested UI value that is not persisted until the Admin explicitly chooses it. */
  suggestedValue?: string;
  /** Secret values are encrypted before they enter system-settings.json. */
  secret?: boolean;
  options?: readonly StorageAdapterFieldOption[];
}

export interface StorageAdapterTabDefinition {
  id: string;
  label: string;
  fields: readonly StorageAdapterFieldDefinition[];
  /** Target-workflow prerequisite for operational actions on this stage. */
  requiresConnection?: boolean;
  /** Target-workflow prerequisite for operational actions on this stage. */
  requiresDatabase?: boolean;
  /** Target-workflow prerequisite for operational actions on this stage. */
  requiresSchema?: boolean;
  /**
   * Keep the tab visible/editable even while its prerequisite is not currently
   * ready when one of these persisted setting keys already has a value.
   */
  retainWhenConfiguredBy?: readonly string[];
}

export interface StorageAdapterTargetWorkflowDefinition {
  /** The API can establish an ephemeral connection without changing active storage. */
  connectionTest?: boolean;
  /** The API can discover databases/catalogs reachable by that connection. */
  databaseDiscovery?: boolean;
  /** The API can create a missing target database/catalog explicitly for an Admin. */
  databasePreparation?: boolean;
  /** Setting key containing the target database/catalog name. */
  databaseFieldKey?: string;
  /** Reserved for the subsequent desired-schema planner/migration implementation. */
  schemaPreparation?: boolean;
}

export interface StorageAdapterDefinition {
  id: string;
  name: string;
  description: string;
  /** Canonical runtime family identifier. Effective familyPath is resolved by the registry. */
  familyId: string;
  /** Hierarchical family names resolved from familyId for API/UI projection. */
  familyPath: readonly string[];
  /** UI-safe relative URL for the adapter's recognizable logo/icon. */
  logoUrl?: string;
  tabs: readonly StorageAdapterTabDefinition[];
  /**
   * True only when this build can use the adapter as the active business
   * datastore. Configuration may be available before the runtime adapter is.
   */
  runtimeAvailable: boolean;
  /** Optional Admin workflow against a target that need not be the active store. */
  targetWorkflow?: StorageAdapterTargetWorkflowDefinition;
  /** Effective native capabilities after family inheritance and adapter overrides. */
  capabilities: readonly import('./capabilities.js').StorageCapabilityValue[];
}

/** Adapter-owned source definition before registry family/capability resolution. */
export type StorageAdapterSourceDefinition = Omit<
  StorageAdapterDefinition,
  'familyPath' | 'capabilities'
> & {
  /** Native capability differences from the selected family, if any. */
  capabilityOverrides?: import('./capabilities.js').StorageCapabilityOverrides;
};
