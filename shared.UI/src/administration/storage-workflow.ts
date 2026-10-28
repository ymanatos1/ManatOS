import {
  createUiStorageDraft,
  groupUiStorageCapabilities,
  uiStorageFieldRequired,
  uiStorageFieldVisible,
  uiStorageSavedStepReached,
  type UiStorageAdapter,
  type UiStorageCapabilityGroup,
  type UiStorageConfiguration,
  type UiStorageDraft,
  type UiStorageField,
  type UiStorageSnapshot,
  type UiStorageTab,
} from './storage.js';

export type UiStorageVerificationState = 'idle' | 'ready' | 'error';
export type UiStorageConnectionState = 'idle' | 'verified' | 'error';
export type UiStorageSchemaState = UiStorageVerificationState | 'changes-required';
export interface UiStorageWorkflowStatus {
  readonly stage: string;
  readonly status: string;
}

interface StorageOperationResult {
  readonly ok?: unknown;
  readonly database?: unknown;
  readonly databases?: unknown;
  readonly exists?: unknown;
  readonly ready?: unknown;
  readonly changes?: unknown;
}

/** The host handles CSRF, authentication and transport; the workflow never owns them. */
export interface UiStorageWorkflowTransport {
  storageTargetOperation<T>(
    operation: string,
    body: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<T>;
  addStorageConfiguration(
    body: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<UiStorageConfiguration>;
  updateStorageConfiguration(
    id: string,
    body: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<UiStorageConfiguration>;
}

const OVERVIEW: UiStorageTab = { id: 'configuration', label: 'Configuration', fields: [] };
const CAPABILITIES: UiStorageTab = { id: 'capabilities', label: 'Capabilities', fields: [] };

/**
 * One framework-independent authority for the Storage wizard's editable state.
 * NG/EJS renderers observe revisions and own native DOM/CTX bridges; neither
 * stores a competing draft, verification result, or secret replacement.
 * No secret value is exposed by draft, snapshot, or the CTX projection.
 */
export class UiStorageWorkflowController {
  readonly snapshot: UiStorageSnapshot;
  readonly readOnly: boolean;
  configuration: UiStorageConfiguration | null;
  draft: UiStorageDraft;
  busy = false;
  error = '';
  notice = '';
  connectionState: UiStorageConnectionState = 'idle';
  databaseState: UiStorageVerificationState = 'idle';
  schemaState: UiStorageSchemaState = 'idle';
  databases: readonly string[] = [];
  schemaChanges: readonly string[] = [];
  capabilityCategory = '';
  /** Mode is part of the workflow, never a competing Angular draft. */
  databaseMode: 'existing' | 'new' = 'new';

  private readonly secrets = new Map<string, string>();
  private readonly abort = new AbortController();
  private readonly observers = new Set<() => void>();
  private initialDraft: UiStorageDraft;
  private verificationDirty = false;
  private generation = 0;
  private alive = true;

  constructor(
    snapshot: UiStorageSnapshot,
    configuration: UiStorageConfiguration | null,
    readOnly: boolean,
    private readonly transport: UiStorageWorkflowTransport,
    private readonly onVerified: (tabId: string) => void = () => {},
    private readonly onSaved: () => void = () => {},
  ) {
    const adapter =
      snapshot.adapters.find((item) => item.id === configuration?.adapterId) ??
      snapshot.adapters[0];
    if (!adapter) throw new Error('Storage metadata has no adapters.');
    this.snapshot = snapshot;
    this.configuration = configuration;
    this.readOnly = readOnly;
    this.draft = createUiStorageDraft(adapter, configuration ?? undefined);
    const databaseKey = adapter.targetWorkflow?.databaseFieldKey;
    if (databaseKey && configuration?.settings[databaseKey]?.trim()) {
      this.databaseMode = 'existing';
    }
    this.initialDraft = this.copyDraft(this.draft);
  }

  subscribe(callback: () => void): () => void {
    this.observers.add(callback);
    return () => this.observers.delete(callback);
  }

  private changed(): void {
    if (this.alive) for (const observer of this.observers) observer();
  }

  get adapter(): UiStorageAdapter | undefined {
    return this.snapshot.adapters.find((item) => item.id === this.draft.adapterId);
  }

  get steps(): readonly UiStorageTab[] {
    return [OVERVIEW, ...(this.adapter?.tabs ?? []), CAPABILITIES];
  }

  get capabilityGroups(): UiStorageCapabilityGroup[] {
    return groupUiStorageCapabilities(this.adapter?.capabilities ?? []);
  }

  get activeCapabilityCategory(): string {
    return this.capabilityCategory || this.capabilityGroups[0]?.name || '';
  }

  get selectedCapabilities() {
    return (
      this.capabilityGroups.find((group) => group.name === this.activeCapabilityCategory)
        ?.capabilities ?? []
    );
  }

  get canCheckSchema(): boolean {
    const target = this.adapter?.targetWorkflow;
    return target?.databaseDiscovery || target?.databasePreparation
      ? this.databaseState === 'ready'
      : this.connectionState === 'verified';
  }

  get workflow(): UiStorageWorkflowStatus {
    const draft = this.draft;
    const adapter = this.adapter;
    if (!adapter || !draft.name.trim()) return { stage: 'configuration', status: 'incomplete' };

    // Saved stage is inspection history, not newly verified live readiness.
    if (this.configuration && !this.verificationDirty) {
      return { stage: draft.stage, status: draft.status };
    }
    if (!this.fieldsValid()) return { stage: 'configuration', status: 'incomplete' };

    const target = adapter.targetWorkflow;
    if (target?.connectionTest && this.connectionState !== 'verified') {
      return {
        stage: 'connection',
        status: this.connectionState === 'error' ? 'error' : 'incomplete',
      };
    }
    if (
      (target?.databaseDiscovery || target?.databasePreparation) &&
      this.databaseState !== 'ready'
    ) {
      return { stage: 'database', status: this.databaseState === 'error' ? 'error' : 'incomplete' };
    }
    if (target?.schemaPreparation && this.schemaState !== 'ready') {
      return { stage: 'schema', status: this.schemaState === 'error' ? 'error' : 'incomplete' };
    }
    return { stage: 'complete', status: 'ready' };
  }

  hasUnsavedChanges(): boolean {
    if ([...this.secrets.values()].some(Boolean)) return true;
    if (
      this.draft.adapterId !== this.initialDraft.adapterId ||
      this.draft.name !== this.initialDraft.name
    )
      return true;
    const keys = new Set([
      ...Object.keys(this.draft.settings),
      ...Object.keys(this.initialDraft.settings),
    ]);
    for (const key of keys) {
      if ((this.draft.settings[key] ?? '') !== (this.initialDraft.settings[key] ?? '')) return true;
    }
    return false;
  }

  /** A different adapter means new metadata and invalid previous verification. */
  switchAdapter(id: string): void {
    if (this.readOnly || this.configuration || this.busy || !this.alive) return;
    const adapter = this.snapshot.adapters.find((item) => item.id === id);
    if (!adapter || adapter.id === this.draft.adapterId) return;
    const name = this.draft.name;
    this.secrets.clear();
    this.resetVerification();
    this.draft = { ...createUiStorageDraft(adapter), name };
    this.capabilityCategory = '';
    this.databaseMode = 'new';
    this.verificationDirty = true;
    this.changed();
  }

  rename(name: string): void {
    if (this.readOnly || this.busy || !this.alive) return;
    this.draft = { ...this.draft, name };
    this.changed();
  }

  value(field: UiStorageField): string {
    return field.secret
      ? (this.secrets.get(field.key) ?? '')
      : (this.draft.settings[field.key] ?? '');
  }

  configured(field: UiStorageField): boolean {
    return Boolean(field.secret && this.configuration?.configuredSecretKeys.includes(field.key));
  }

  visible(field: UiStorageField): boolean {
    return uiStorageFieldVisible(field, this.draft.settings);
  }

  required(field: UiStorageField): boolean {
    return uiStorageFieldRequired(field, this.draft.settings);
  }

  edit(field: UiStorageField, value: string): void {
    if (this.readOnly || this.busy || !this.alive) return;
    if (field.secret) {
      this.secrets.set(field.key, value);
    } else {
      this.draft = { ...this.draft, settings: { ...this.draft.settings, [field.key]: value } };
    }
    this.verificationDirty = true;
    this.invalidateAfterField(field);
    this.changed();
  }

  selectCapabilityCategory(category: string): void {
    if (!this.capabilityGroups.some((group) => group.name === category)) return;
    this.capabilityCategory = category;
    this.changed();
  }

  stepById(id: string): UiStorageTab | undefined {
    return this.steps.find((step) => step.id === id);
  }

  stepAccessible(step: UiStorageTab): boolean {
    if (this.readOnly) return true;
    if (!this.verificationDirty && uiStorageSavedStepReached(this.configuration, step.id))
      return true;
    if (step.retainWhenConfiguredBy?.some((key) => Boolean(this.draft.settings[key]?.trim())))
      return true;
    if (step.requiresConnection && this.connectionState !== 'verified') return false;
    if (step.requiresDatabase && this.databaseState !== 'ready') return false;
    if (step.requiresSchema && this.schemaState !== 'ready') return false;
    return true;
  }

  stepNeedsCurrentVerification(step: UiStorageTab): boolean {
    return Boolean(
      (step.requiresConnection && this.connectionState !== 'verified') ||
      (step.requiresDatabase && this.databaseState !== 'ready') ||
      (step.requiresSchema && this.schemaState !== 'ready'),
    );
  }

  get databaseField(): UiStorageField | undefined {
    const key = this.adapter?.targetWorkflow?.databaseFieldKey;
    return key
      ? this.adapter?.tabs
          .find((tab) => tab.id === 'database')
          ?.fields.find((field) => field.key === key)
      : undefined;
  }

  selectDatabaseMode(mode: 'existing' | 'new'): void {
    if (
      this.readOnly ||
      this.busy ||
      !this.alive ||
      this.databaseMode === mode ||
      !this.databaseField
    )
      return;
    this.databaseMode = mode;
    // A selected existing target must be explicitly chosen from the inspected catalog.
    // A new target is typed by the user, never silently inherited from an existing name.
    this.edit(this.databaseField, '');
  }

  selectDiscoveredDatabase(value: string): void {
    const field = this.databaseField;
    if (this.databaseMode !== 'existing' || !field || (value && !this.databases.includes(value)))
      return;
    this.edit(field, value);
  }

  /** UI affordances and imperative callers use the same stage prerequisites. */
  canOperate(name: string): boolean {
    if (this.readOnly || this.busy || !this.alive || !this.adapter) return false;
    const target = this.adapter.targetWorkflow;
    const connectionValid = this.stepFieldsValid('connection');
    if (name === 'test-connection') return target?.connectionTest === true && connectionValid;
    if (name === 'databases')
      return Boolean(
        target?.databaseDiscovery &&
        connectionValid &&
        (!target.connectionTest || this.connectionState === 'verified'),
      );
    if (name === 'database/inspect' || name === 'database/prepare') {
      if (
        !(target?.databaseDiscovery || target?.databasePreparation) ||
        (target.connectionTest && this.connectionState !== 'verified') ||
        !connectionValid ||
        !this.stepFieldsValid('database')
      )
        return false;
      if (!this.databaseField || !this.value(this.databaseField).trim()) return false;
      if (
        this.databaseMode === 'existing' &&
        !this.databases.includes(this.value(this.databaseField))
      )
        return false;
      return (
        name === 'database/inspect' ||
        (target?.databasePreparation === true && this.databaseMode === 'new')
      );
    }
    if (name === 'schema/inspect' || name === 'schema/prepare')
      return Boolean(
        target?.schemaPreparation &&
        this.canCheckSchema &&
        connectionValid &&
        this.stepFieldsValid('database'),
      );
    return false;
  }

  private stepFieldsValid(tabId: string): boolean {
    for (const field of this.adapter?.tabs.find((tab) => tab.id === tabId)?.fields ?? []) {
      if (!this.visible(field)) continue;
      const value = field.secret
        ? this.secrets.get(field.key) || (this.configured(field) ? '[configured]' : '')
        : (this.draft.settings[field.key] ?? '');
      if (this.required(field) && !value.trim()) return false;
      if (value && field.type === 'number' && !Number.isFinite(Number(value))) return false;
    }
    return true;
  }

  /** One bounded operation at a time; edit/disposal generations reject stale results. */
  async operation(name: string): Promise<void> {
    if (!this.canOperate(name)) return;
    const generation = this.generation;
    this.verificationDirty = true;
    this.busy = true;
    this.error = '';
    this.notice = '';
    this.changed();
    try {
      const result = await this.transport.storageTargetOperation<StorageOperationResult>(
        name,
        this.targetPayload(),
        this.abort.signal,
      );
      if (!this.alive || generation !== this.generation) return;
      if (name === 'databases' && !Array.isArray(result?.databases)) {
        throw new Error('Database discovery returned an invalid catalogue.');
      }
      this.acceptOperationResult(name, result);
      if (
        name === 'database/prepare' &&
        result.exists === true &&
        this.matchesSelectedDatabase(result) &&
        this.adapter?.targetWorkflow?.databaseDiscovery
      ) {
        // EJS0 parity: server preparation alone is not discovery evidence.
        const catalog = await this.transport.storageTargetOperation<StorageOperationResult>(
          'databases',
          this.targetPayload(),
          this.abort.signal,
        );
        if (!this.alive || generation !== this.generation) return;
        if (!Array.isArray(catalog?.databases)) {
          throw new Error('Database discovery returned an invalid catalogue.');
        }
        const names = catalog.databases.filter(
          (value): value is string => typeof value === 'string',
        );
        this.databases = names;
        const requested = this.databaseField ? this.value(this.databaseField).trim() : '';
        const matched = names.find(
          (value) => value.localeCompare(requested, undefined, { sensitivity: 'accent' }) === 0,
        );
        this.databaseState = matched ? 'ready' : 'error';
        if (matched) {
          this.databaseMode = 'existing';
          this.notice = 'Database available.';
        } else {
          this.error = 'Prepared database was not found in the refreshed catalogue.';
          this.notice = '';
        }
      }
      const tabId =
        name === 'test-connection'
          ? 'connection'
          : name.startsWith('database') || name === 'databases'
            ? 'database'
            : name.startsWith('schema/')
              ? 'schema'
              : null;
      if (tabId && this.stepById(tabId) && this.operationVerified(name, result)) {
        this.onVerified(tabId);
      }
    } catch (error) {
      if (!this.alive || generation !== this.generation || this.abort.signal.aborted) return;
      this.recordOperationFailure(name, error);
    } finally {
      if (this.alive && generation === this.generation) {
        this.busy = false;
        this.changed();
      }
    }
  }

  /** Save configuration only; selection for API restart is a separate page action. */
  async save(): Promise<void> {
    const draft = this.draft;
    if (this.readOnly || !draft.name.trim() || !this.adapter || this.busy || !this.alive) return;
    this.busy = true;
    this.error = '';
    this.changed();
    try {
      const body = {
        name: draft.name.trim(),
        adapterId: draft.adapterId,
        settings: this.requestSettings(),
        ...this.workflow,
      };
      const saved = this.configuration
        ? await this.transport.updateStorageConfiguration(
            this.configuration.id,
            body,
            this.abort.signal,
          )
        : await this.transport.addStorageConfiguration(body, this.abort.signal);
      if (!this.alive) return;
      this.configuration = saved;
      this.secrets.clear();
      this.verificationDirty = false;
      const adapter = this.adapter;
      if (adapter) {
        this.draft = createUiStorageDraft(adapter, saved);
        this.initialDraft = this.copyDraft(this.draft);
      }
      this.changed();
      this.onSaved();
    } catch (error) {
      if (this.alive && !this.abort.signal.aborted) this.error = this.reason(error);
    } finally {
      if (this.alive) {
        this.busy = false;
        this.changed();
      }
    }
  }

  /** Per-field CTX projections contain no replacement secret text. */
  secretPresent(field: UiStorageField): boolean {
    return this.configured(field) || Boolean(this.secrets.get(field.key));
  }

  dispose(): void {
    if (!this.alive) return;
    this.alive = false;
    ++this.generation;
    this.abort.abort();
    this.secrets.clear();
    this.observers.clear();
  }

  private copyDraft(value: UiStorageDraft): UiStorageDraft {
    return { ...value, settings: { ...value.settings } };
  }

  private fieldsValid(): boolean {
    for (const step of this.adapter?.tabs ?? []) {
      if (!this.stepFieldsValid(step.id)) return false;
    }
    return true;
  }

  private invalidateAfterField(field: UiStorageField): void {
    const step = this.adapter?.tabs.find((tab) =>
      tab.fields.some((item) => item.key === field.key),
    );
    if (step?.id !== 'database' && step?.id !== 'schema') {
      this.resetVerification();
      return;
    }
    ++this.generation;
    if (step.id === 'database') {
      this.databaseState = 'idle';
    }
    this.schemaState = 'idle';
    this.schemaChanges = [];
    this.notice = '';
    this.error = '';
  }

  private resetVerification(): void {
    ++this.generation;
    this.connectionState = 'idle';
    this.databaseState = 'idle';
    this.schemaState = 'idle';
    this.databases = [];
    this.schemaChanges = [];
    this.notice = '';
    this.error = '';
  }

  private requestSettings(): Record<string, string> {
    const values = { ...this.draft.settings };
    for (const [key, value] of this.secrets) if (value) values[key] = value;
    return values;
  }

  private targetPayload(): Record<string, unknown> {
    const databaseField = this.adapter?.targetWorkflow?.databaseFieldKey ?? 'database';
    return {
      ...(this.configuration ? { configurationId: this.configuration.id } : {}),
      adapterId: this.draft.adapterId,
      settings: this.requestSettings(),
      database: this.draft.settings[databaseField] ?? '',
    };
  }

  private matchesSelectedDatabase(result: StorageOperationResult): boolean {
    const key = this.adapter?.targetWorkflow?.databaseFieldKey ?? 'database';
    const selected = this.draft.settings[key]?.trim();
    return Boolean(
      selected &&
      typeof result.database === 'string' &&
      result.database.localeCompare(selected, undefined, { sensitivity: 'accent' }) === 0,
    );
  }

  private operationVerified(name: string, result: StorageOperationResult): boolean {
    if (name === 'test-connection') return result.ok === true;
    if (name === 'databases') return this.databaseState === 'ready';
    if (name.startsWith('database/'))
      return (
        result.exists === true &&
        this.matchesSelectedDatabase(result) &&
        this.databaseState === 'ready'
      );
    if (name.startsWith('schema/'))
      return (
        result.ready === true &&
        (!this.databaseField || this.matchesSelectedDatabase(result)) &&
        this.schemaState === 'ready'
      );
    return false;
  }

  private acceptOperationResult(name: string, result: StorageOperationResult): void {
    if (name === 'test-connection') {
      this.connectionState = result.ok === true ? 'verified' : 'error';
      this.databaseState = 'idle';
      this.schemaState = 'idle';
      this.notice = result.ok === true ? 'Connection verified.' : '';
      if (result.ok !== true) this.error = 'Connection verification failed.';
    } else if (name === 'databases') {
      const names = Array.isArray(result.databases)
        ? result.databases.filter((value): value is string => typeof value === 'string')
        : [];
      const field = this.adapter?.targetWorkflow?.databaseFieldKey ?? 'database';
      this.databases = names;
      if (
        names.some(
          (value) =>
            value.localeCompare(this.draft.settings[field] ?? '', undefined, {
              sensitivity: 'accent',
            }) === 0,
        )
      )
        this.databaseMode = 'existing';
      const savedName = this.draft.settings[field] ?? '';
      const discovered = names.find(
        (value) => value.localeCompare(savedName, undefined, { sensitivity: 'accent' }) === 0,
      );
      this.databaseState = discovered ? 'ready' : savedName ? 'error' : 'idle';
      if (savedName && !discovered) {
        this.error = 'Configured database was not found in the refreshed catalogue.';
      }
      this.schemaState = 'idle';
      this.notice = 'Database catalogue loaded.';
    } else if (name.startsWith('database/')) {
      const exists = result.exists === true && this.matchesSelectedDatabase(result);
      this.databaseState = exists ? 'ready' : 'error';
      this.schemaState = 'idle';
      this.notice = exists ? 'Database available.' : '';
      if (!exists) this.error = 'The selected database was not confirmed by the server.';
    } else if (name.startsWith('schema/')) {
      const ready =
        result.ready === true && (!this.databaseField || this.matchesSelectedDatabase(result));
      this.schemaState = ready ? 'ready' : 'changes-required';
      this.schemaChanges = Array.isArray(result.changes)
        ? result.changes
            .map((item) =>
              item && typeof item === 'object' && 'description' in item
                ? String(item.description)
                : '',
            )
            .filter(Boolean)
        : [];
      this.notice = ready ? 'Schema ready.' : 'Schema changes required.';
    }
  }

  private recordOperationFailure(name: string, error: unknown): void {
    if (name === 'test-connection') this.connectionState = 'error';
    else if (name === 'databases' || name.startsWith('database/')) this.databaseState = 'error';
    else this.schemaState = 'error';
    this.error = this.reason(error);
  }

  private reason(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
