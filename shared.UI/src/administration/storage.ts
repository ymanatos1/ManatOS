/** API-safe storage metadata. The server never exposes encrypted secret envelopes. */
export interface UiStorageField {
  readonly key: string;
  readonly label: string;
  readonly description: string;
  readonly type: 'text' | 'path' | 'number' | 'password' | 'boolean' | 'select';
  readonly required: boolean;
  readonly requiredWhen?: { readonly key: string; readonly equals: string };
  readonly visibleWhen?: { readonly key: string; readonly equals: string };
  /** Responsive field width declared by the adapter, not the client. */
  readonly columnClass?: string;
  /** Present Boolean values as a checkbox when requested by adapter metadata. */
  readonly presentation?: 'checkbox';
  readonly defaultValue?: string;
  readonly suggestedValue?: string;
  readonly secret?: boolean;
  readonly options?: readonly { readonly value: string; readonly label: string }[];
}

export interface UiStorageTab {
  readonly id: string;
  readonly label: string;
  readonly fields: readonly UiStorageField[];
  readonly requiresConnection?: boolean;
  readonly requiresDatabase?: boolean;
  readonly requiresSchema?: boolean;
  readonly retainWhenConfiguredBy?: readonly string[];
}

export interface UiStorageTargetWorkflow {
  readonly connectionTest?: boolean;
  readonly databaseDiscovery?: boolean;
  readonly databasePreparation?: boolean;
  readonly databaseFieldKey?: string;
  readonly schemaPreparation?: boolean;
}

/** Effective native capability metadata resolved by the API across adapter families. */
export interface UiStorageCapability {
  readonly key: string;
  readonly category: string;
  readonly label: string;
  readonly description: string;
  readonly supported: boolean;
  readonly sourceId: string;
  readonly sourceName: string;
  readonly sourceKind: 'family' | 'adapter';
}

export interface UiStorageCapabilityGroup {
  readonly name: string;
  readonly capabilities: readonly UiStorageCapability[];
}

export interface UiStorageAdapter {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly familyPath: readonly string[];
  readonly logoUrl?: string;
  readonly runtimeAvailable: boolean;
  readonly tabs: readonly UiStorageTab[];
  readonly targetWorkflow?: UiStorageTargetWorkflow;
  readonly capabilities: readonly UiStorageCapability[];
}

export interface UiStorageConfiguration {
  readonly id: string;
  readonly name: string;
  readonly adapterId: string;
  readonly sequence: number;
  readonly stage: string;
  readonly status: string;
  readonly settings: Readonly<Record<string, string>>;
  readonly configuredSecretKeys: readonly string[];
}

export interface UiStorageDebugging {
  readonly apiStorageContextEnabled: boolean;
  readonly outputDirectory: string;
}

export interface UiStorageSnapshot {
  readonly currentConfigurationId: string;
  readonly selectedConfigurationId: string;
  readonly runningConfigurationId: string;
  readonly configurations: readonly UiStorageConfiguration[];
  readonly adapters: readonly UiStorageAdapter[];
  readonly debugging: UiStorageDebugging;
}

export interface UiStorageDraft {
  name: string;
  adapterId: string;
  stage: string;
  status: string;
  settings: Record<string, string>;
}

/**
 * Start with non-sensitive settings only. Secrets remain private to the editor and
 * are never copied into its CTX projection or its initial draft.
 */
export function createUiStorageDraft(
  adapter: UiStorageAdapter,
  configuration?: UiStorageConfiguration,
): UiStorageDraft {
  const settings: Record<string, string> = {};

  for (const tab of adapter.tabs) {
    for (const field of tab.fields) {
      if (field.secret) {
        continue;
      }

      settings[field.key] = configuration?.settings[field.key] ?? field.defaultValue ?? '';
    }
  }

  return {
    name: configuration?.name ?? '',
    adapterId: adapter.id,
    stage: configuration?.stage ?? 'configuration',
    status: configuration?.status ?? 'incomplete',
    settings,
  };
}

/** Visibility follows adapter metadata; missing prerequisites hide conditional fields. */
export function uiStorageFieldVisible(
  field: UiStorageField,
  values: Record<string, string>,
): boolean {
  if (!field.visibleWhen) {
    return true;
  }

  return values[field.visibleWhen.key] === field.visibleWhen.equals;
}

/** Requiredness uses the same in-draft values as visibility and presentation. */
export function uiStorageFieldRequired(
  field: UiStorageField,
  values: Record<string, string>,
): boolean {
  if (field.required) {
    return true;
  }

  if (!field.requiredWhen) {
    return false;
  }

  return values[field.requiredWhen.key] === field.requiredWhen.equals;
}

/** Group capabilities in API metadata order without discarding their support provenance. */
export function groupUiStorageCapabilities(
  capabilities: readonly UiStorageCapability[],
): UiStorageCapabilityGroup[] {
  const groups = new Map<string, UiStorageCapability[]>();

  for (const capability of capabilities) {
    const category = capability.category || 'Other';
    let group = groups.get(category);
    if (!group) {
      group = [];
      groups.set(category, group);
    }
    group.push(capability);
  }

  return [...groups].map(([name, items]) => ({ name, capabilities: items }));
}

/**
 * Allow the user to revisit a saved stage for inspection or editing.
 * This is navigation history, NOT evidence of a currently verified target.
 */
export function uiStorageSavedStepReached(
  configuration: Pick<UiStorageConfiguration, 'stage'> | null,
  stepId: string,
): boolean {
  if (!configuration) {
    return false;
  }

  const stages = ['configuration', 'connection', 'database', 'schema', 'data', 'complete'];
  const savedIndex = stages.indexOf(configuration.stage);
  const requestedIndex = stages.indexOf(stepId);

  return savedIndex >= 0 && requestedIndex >= 0 && savedIndex >= requestedIndex;
}
