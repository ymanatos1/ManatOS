import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { ValidationAppError } from '@manatos/shared';

import type { SecretsEncryptionService } from './security/secrets-encryption-service.js';
import type {
  StorageAdapterDefinition,
  StorageAdapterFieldDefinition,
} from './storage/adapter-definition.js';
import { storageAdapterRegistry } from './storage/adapter-registry.js';
import { IN_MEMORY_JSON_ADAPTER_ID } from './storage/adapters/in-memory-json/definition.js';

export { IN_MEMORY_JSON_ADAPTER_ID } from './storage/adapters/in-memory-json/definition.js';
export { SQL_SERVER_ADAPTER_ID } from './storage/adapters/relational/server-rdbms/sql-server/definition.js';
export { MARIADB_ADAPTER_ID } from './storage/adapters/relational/server-rdbms/mariadb/definition.js';
export { POSTGRESQL_ADAPTER_ID } from './storage/adapters/relational/server-rdbms/postgresql/definition.js';
export { SQLITE_ADAPTER_ID } from './storage/adapters/relational/embedded-rdbms/sqlite/definition.js';
export type {
  StorageAdapterDefinition,
  StorageAdapterFieldDefinition,
  StorageAdapterTabDefinition,
} from './storage/adapter-definition.js';

export type StorageConfigurationStage =
  '' | 'configuration' | 'connection' | 'database' | 'schema' | 'data' | 'complete';

export type StorageConfigurationStatus = '' | 'incomplete' | 'ready' | 'error';

export interface StorageConfigurationRecord {
  id: string;
  name: string;
  adapterId: string;
  /** Canonical persisted display/selection order. */
  sequence: number;
  /** Last saved preparation stage; maintained by the storage workflow. */
  stage: StorageConfigurationStage;
  /**
   * Last saved intrinsic readiness. Runtime Current/Selected presentation is
   * overlaid separately and is never persisted into this record.
   */
  status: StorageConfigurationStatus;
  /** Secret fields are stored here only as encrypted envelopes. */
  settings: Record<string, string>;
}

export interface StorageConfigurationAdminRecord extends StorageConfigurationRecord {
  /** Secret setting keys that already have an encrypted value at rest. */
  configuredSecretKeys: string[];
}

export interface StorageConfigurationCandidate {
  configurationId?: string | undefined;
  adapterId?: string | undefined;
  settings?: Record<string, unknown> | undefined;
}

export interface StorageSettingsDocument {
  currentConfigurationId: string;
  configurations: StorageConfigurationRecord[];
  debugging: StorageDebuggingSettings;
}

export interface StorageDebuggingSettings {
  /** Capture API/storage CTX snapshots for post-request inspection. */
  apiStorageContextEnabled: boolean;
  /** Process-relative or absolute directory used by the snapshot writer. */
  outputDirectory: string;
}

export interface SystemSettingsDocument {
  version: 1;
  storage: StorageSettingsDocument;
}

export const DEFAULT_STORAGE_CONFIGURATION_ID = 'default-json';
export const DEFAULT_API_STORAGE_DEBUG_DIRECTORY = '../data/logs/api/';

/** A successful target check is short-lived evidence, never a persisted UI assertion. */
const STORAGE_VERIFICATION_TTL_MS = 30 * 60 * 1000;
const MAX_STORAGE_VERIFICATIONS = 512;

function defaultStorageConfiguration(defaultDataFile: string): StorageConfigurationRecord {
  const dataFile = defaultDataFile || '../data/database.json';
  return {
    id: DEFAULT_STORAGE_CONFIGURATION_ID,
    name: 'Default local JSON',
    adapterId: IN_MEMORY_JSON_ADAPTER_ID,
    sequence: 0,
    stage: 'complete',
    status: 'ready',
    settings: {
      dataFile,
      binaryRoot: `${dirname(dataFile)}/images`.replaceAll('\\', '/'),
    },
  };
}

function defaultDocument(defaultDataFile: string): SystemSettingsDocument {
  const configuration = defaultStorageConfiguration(defaultDataFile);
  return {
    version: 1,
    storage: {
      currentConfigurationId: configuration.id,
      configurations: [configuration],
      debugging: {
        apiStorageContextEnabled: false,
        outputDirectory: DEFAULT_API_STORAGE_DEBUG_DIRECTORY,
      },
    },
  };
}

function allFields(definition: StorageAdapterDefinition): readonly StorageAdapterFieldDefinition[] {
  return definition.tabs.flatMap((tab) => tab.fields);
}

function normalizeScalar(field: StorageAdapterFieldDefinition, raw: unknown): string {
  const value = String(raw ?? '').trim();
  if (!value) return '';
  if (field.type === 'number' && !Number.isFinite(Number(value))) {
    throw new ValidationAppError(`${field.label} must be a number.`);
  }
  if (field.type === 'boolean' && value !== 'true' && value !== 'false') {
    throw new ValidationAppError(`${field.label} must be true or false.`);
  }
  if (field.type === 'select' && field.options?.length) {
    if (!field.options.some((option) => option.value === value)) {
      throw new ValidationAppError(`${field.label} has an invalid value.`);
    }
  }
  return value;
}

/**
 * Small bootstrap/system-settings store that exists independently of the
 * selected business datastore. The API creates and repairs it at startup.
 */
export class SystemSettingsStore {
  private readonly filePath: string;
  private document!: SystemSettingsDocument;
  /** Configuration actually serving this API process; fixed for the process lifetime. */
  private runningConfigurationId = '';
  private readonly verificationKey = randomBytes(32);
  private readonly verifiedTargets = new Map<string, number>();

  constructor(
    filePath: string,
    private readonly defaultDataFile: string,
    private readonly secretsEncryption: SecretsEncryptionService,
  ) {
    this.filePath = resolve(process.cwd(), filePath);
  }

  async initialize(): Promise<void> {
    try {
      const raw = JSON.parse(
        await readFile(this.filePath, 'utf8'),
      ) as Partial<SystemSettingsDocument>;
      const defaultDoc = defaultDocument(this.defaultDataFile);
      const rawStorage = raw.storage;
      const configurations = Array.isArray(rawStorage?.configurations)
        ? rawStorage.configurations
            .map((entry, index) => {
              const migrated = {
                ...entry,
                sequence: Number.isFinite(Number((entry as StorageConfigurationRecord).sequence))
                  ? Number((entry as StorageConfigurationRecord).sequence)
                  : index,
              };

              try {
                return this.normalizeConfiguration(migrated, undefined, true);
              } catch {
                return null;
              }
            })
            .filter((entry): entry is StorageConfigurationRecord => entry !== null)
            .sort((a, b) => a.sequence - b.sequence)
            .map((entry, index) => ({ ...entry, sequence: index }))
        : [];
      if (!configurations.length) configurations.push(...defaultDoc.storage.configurations);

      let currentConfigurationId = String(rawStorage?.currentConfigurationId ?? '');
      const selected = configurations.find((entry) => entry.id === currentConfigurationId);
      const selectedDefinition = selected ? storageAdapterRegistry.get(selected.adapterId) : null;
      if (!selected || !selectedDefinition?.runtimeAvailable) {
        const defaultConfiguration = configurations.find(
          (entry) =>
            entry.id === DEFAULT_STORAGE_CONFIGURATION_ID &&
            storageAdapterRegistry.get(entry.adapterId).runtimeAvailable,
        );
        const firstRunnable = configurations.find(
          (entry) => storageAdapterRegistry.get(entry.adapterId).runtimeAvailable,
        );
        currentConfigurationId = (defaultConfiguration ??
          firstRunnable ??
          defaultDoc.storage.configurations[0])!.id;
      }

      const runningConfiguration = configurations.find(
        (entry) => entry.id === currentConfigurationId,
      );
      if (runningConfiguration) {
        // A configuration that successfully booted this API is authoritative
        // evidence of readiness, including documents created before these
        // persisted workflow fields existed.
        runningConfiguration.stage = 'complete';
        runningConfiguration.status = 'ready';
      }

      this.document = {
        version: 1,
        storage: {
          currentConfigurationId,
          configurations,
          debugging: this.normalizeStorageDebugging(rawStorage?.debugging),
        },
      };
      this.runningConfigurationId = currentConfigurationId;
      await this.persist();
    } catch (error) {
      if (!(
        error instanceof Error &&
        'code' in error &&
        (error as NodeJS.ErrnoException).code === 'ENOENT'
      )) {
        throw error;
      }
      this.document = defaultDocument(this.defaultDataFile);
      this.runningConfigurationId = this.document.storage.currentConfigurationId;
      await this.persist();
    }
  }

  snapshot(): SystemSettingsDocument {
    return structuredClone(this.document);
  }

  /** Safe projection for the Admin UI: encrypted envelopes never leave the API. */
  adminStorageSnapshot() {
    return {
      // Backward-compatible alias. This is the persisted selection for the
      // next API start, which can differ from what this process is running.
      currentConfigurationId: this.document.storage.currentConfigurationId,
      selectedConfigurationId: this.document.storage.currentConfigurationId,
      runningConfigurationId: this.runningConfigurationId,
      configurations: this.document.storage.configurations.map((configuration) =>
        this.adminConfiguration(configuration),
      ),
      adapters: storageAdapterRegistry.all(),
      debugging: structuredClone(this.document.storage.debugging),
      restartRequired: true,
    };
  }

  storageDebuggingSettings(): StorageDebuggingSettings {
    return structuredClone(this.document.storage.debugging);
  }

  async updateStorageDebugging(input: Partial<StorageDebuggingSettings>) {
    this.document.storage.debugging = this.normalizeStorageDebugging({
      ...this.document.storage.debugging,
      ...input,
    });
    await this.persist();
    return this.storageDebuggingSettings();
  }

  currentStorageConfiguration(): StorageConfigurationRecord {
    const current = this.document.storage.configurations.find(
      (entry) => entry.id === this.runningConfigurationId,
    );
    if (!current) throw new Error('Current storage configuration is unavailable.');
    return this.resolveSecrets(current);
  }

  async addStorageConfiguration(input: Partial<StorageConfigurationRecord>) {
    this.assertUniqueStorageConfigurationName(String(input.name ?? ''));
    const record = this.normalizeConfiguration({
      ...input,
      sequence: this.document.storage.configurations.length,
    });
    this.document.storage.configurations.push(record);
    await this.persist();
    return this.adminConfiguration(record);
  }

  async deleteStorageConfiguration(id: string) {
    const index = this.document.storage.configurations.findIndex((entry) => entry.id === id);
    if (index < 0) throw new ValidationAppError('Storage configuration not found.');
    if (this.document.storage.currentConfigurationId === id || this.runningConfigurationId === id) {
      throw new ValidationAppError(
        'A selected or currently running storage configuration cannot be deleted. Select another configuration and restart the API first.',
      );
    }
    const [deleted] = this.document.storage.configurations.splice(index, 1);
    this.document.storage.configurations.forEach((entry, sequence) => {
      entry.sequence = sequence;
    });
    await this.persist();
    return this.adminConfiguration(deleted!);
  }

  async updateStorageConfiguration(id: string, input: Partial<StorageConfigurationRecord>) {
    const index = this.document.storage.configurations.findIndex((entry) => entry.id === id);
    if (index < 0) throw new ValidationAppError('Storage configuration not found.');
    const existing = this.document.storage.configurations[index]!;
    this.assertUniqueStorageConfigurationName(String(input.name ?? existing.name), id);
    if (input.adapterId && input.adapterId !== existing.adapterId) {
      throw new ValidationAppError(
        'The storage adapter cannot be changed for an existing configuration.',
      );
    }
    const record = this.normalizeConfiguration(
      {
        ...existing,
        ...input,
        adapterId: existing.adapterId,
        settings: input.settings ?? {},
      },
      existing,
    );
    this.document.storage.configurations[index] = record;
    await this.persist();
    return this.adminConfiguration(record);
  }

  async setStorageConfigurationOrder(ids: string[]) {
    const configurations = this.document.storage.configurations;
    const expected = configurations.map((entry) => entry.id);
    if (
      ids.length !== expected.length ||
      new Set(ids).size !== ids.length ||
      expected.some((id) => !ids.includes(id))
    ) {
      throw new ValidationAppError(
        'Storage configuration order must contain every configuration exactly once.',
      );
    }
    const byId = new Map(configurations.map((entry) => [entry.id, entry]));
    this.document.storage.configurations = ids.map((id, sequence) => {
      const entry = byId.get(id)!;
      entry.sequence = sequence;
      return entry;
    });
    await this.persist();
    return this.document.storage.configurations.map((entry) => this.adminConfiguration(entry));
  }

  async moveStorageConfiguration(id: string, direction: 'up' | 'down') {
    const configurations = this.document.storage.configurations;
    const index = configurations.findIndex((entry) => entry.id === id);
    if (index < 0) throw new ValidationAppError('Storage configuration not found.');
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= configurations.length) {
      return configurations.map((entry) => this.adminConfiguration(entry));
    }
    [configurations[index], configurations[targetIndex]] = [
      configurations[targetIndex]!,
      configurations[index]!,
    ];
    configurations.forEach((entry, sequence) => {
      entry.sequence = sequence;
    });
    await this.persist();
    return configurations.map((entry) => this.adminConfiguration(entry));
  }

  async selectStorageConfiguration(id: string) {
    const configuration = this.document.storage.configurations.find((entry) => entry.id === id);
    if (!configuration) throw new ValidationAppError('Storage configuration not found.');
    const definition = storageAdapterRegistry.get(configuration.adapterId);
    if (!definition.runtimeAvailable) {
      throw new ValidationAppError(
        `${definition.name} can be configured in this build, but its datastore runtime is not implemented yet.`,
      );
    }
    if (configuration.status !== 'ready') {
      throw new ValidationAppError(
        'Only a storage configuration whose saved status is Ready can be selected for activation.',
      );
    }
    this.document.storage.currentConfigurationId = id;
    await this.persist();
  }

  /**
   * Record only successful API target checks. The Admin browser never receives
   * or supplies verification tokens, and no plaintext credential is retained.
   * The database name may be supplied separately while a new target is chosen.
   */
  recordVerifiedStorageTarget(
    configuration: StorageConfigurationRecord,
    stage: 'connection' | 'database' | 'schema',
    database?: string,
  ): void {
    // Operational target records have already had their secrets decrypted.
    const key = this.storageVerificationFingerprint(configuration, stage, database, true);
    const now = Date.now();

    // Keep verification evidence bounded and limited to recent successful checks.
    for (const [existingKey, timestamp] of this.verifiedTargets) {
      if (now - timestamp > STORAGE_VERIFICATION_TTL_MS) {
        this.verifiedTargets.delete(existingKey);
      }
    }
    if (this.verifiedTargets.size >= MAX_STORAGE_VERIFICATIONS) {
      const oldest = this.verifiedTargets.keys().next().value;
      if (oldest) this.verifiedTargets.delete(oldest);
    }
    this.verifiedTargets.set(key, now);
  }

  private hasVerifiedStorageTarget(
    configuration: StorageConfigurationRecord,
    stage: 'connection' | 'database' | 'schema',
  ): boolean {
    const key = this.storageVerificationFingerprint(configuration, stage);
    const timestamp = this.verifiedTargets.get(key);
    return timestamp !== undefined && Date.now() - timestamp <= STORAGE_VERIFICATION_TTL_MS;
  }

  /**
   * Match checks to the *effective* target settings, not the random encrypted
   * envelope or configuration name. The connection stage excludes the eventual
   * database choice because EJS0/NG1 test the server before choosing a catalog.
   */
  private storageVerificationFingerprint(
    configuration: StorageConfigurationRecord,
    stage: 'connection' | 'database' | 'schema' | 'settings',
    database?: string,
    resolvedSettings = false,
  ): string {
    const definition = storageAdapterRegistry.get(configuration.adapterId);
    const databaseKey = definition.targetWorkflow?.databaseFieldKey;
    const settings = resolvedSettings
      ? { ...configuration.settings }
      : this.resolveSecrets(configuration).settings;
    if (databaseKey && database !== undefined) {
      settings[databaseKey] = database;
    }
    if (stage === 'connection' && databaseKey) {
      delete settings[databaseKey];
    }

    // New candidates may omit optional fields that saved configurations store
    // as empty strings. Fingerprint the adapter's complete effective settings
    // so those two representations share the same verification evidence.
    const canonical = allFields(definition)
      .map((field) => [field.key, settings[field.key] ?? field.defaultValue ?? ''] as const)
      .sort(([left], [right]) => left.localeCompare(right));
    const digest = createHmac('sha256', this.verificationKey)
      .update(JSON.stringify([configuration.adapterId, canonical]))
      .digest('hex');
    return `${stage}:${digest}`;
  }

  /** Existing Ready entries remain Ready on name-only edits, including migrated records. */
  private unchangedTarget(
    existing: StorageConfigurationRecord,
    candidate: StorageConfigurationRecord,
  ): boolean {
    return (
      existing.adapterId === candidate.adapterId &&
      this.storageVerificationFingerprint(existing, 'settings') ===
        this.storageVerificationFingerprint(candidate, 'settings')
    );
  }

  /**
   * Derive operational readiness exclusively from server-observed target checks.
   * File-backed JSON has no remote target: complete mandatory paths are its
   * readiness contract; its runtime performs filesystem initialization at boot.
   */
  private verifiedStage(configuration: StorageConfigurationRecord): StorageConfigurationStage {
    const definition = storageAdapterRegistry.get(configuration.adapterId);
    const settings = this.resolveSecrets(configuration).settings;

    for (const field of allFields(definition)) {
      const visible =
        !field.visibleWhen || settings[field.visibleWhen.key] === field.visibleWhen.equals;
      const required =
        field.required ||
        Boolean(
          field.requiredWhen && settings[field.requiredWhen.key] === field.requiredWhen.equals,
        );
      if (visible && required && !String(settings[field.key] ?? '').trim()) {
        return 'configuration';
      }
    }

    const workflow = definition.targetWorkflow;
    if (workflow?.connectionTest && !this.hasVerifiedStorageTarget(configuration, 'connection')) {
      return 'connection';
    }
    if (
      (workflow?.databaseDiscovery || workflow?.databasePreparation) &&
      !this.hasVerifiedStorageTarget(configuration, 'database')
    ) {
      return 'database';
    }
    if (workflow?.schemaPreparation && !this.hasVerifiedStorageTarget(configuration, 'schema')) {
      return 'schema';
    }
    return 'complete';
  }

  private normalizeStorageDebugging(
    input: Partial<StorageDebuggingSettings> | null | undefined,
  ): StorageDebuggingSettings {
    const outputDirectory = String(input?.outputDirectory ?? '').trim();
    return {
      apiStorageContextEnabled: input?.apiStorageContextEnabled === true,
      outputDirectory: outputDirectory || DEFAULT_API_STORAGE_DEBUG_DIRECTORY,
    };
  }

  adapterDefinitions(): readonly StorageAdapterDefinition[] {
    return storageAdapterRegistry.all();
  }

  /**
   * Resolve a transient Admin target configuration without mutating either the
   * bootstrap settings document or the datastore currently serving ManatOS.
   * Existing encrypted secrets are retained when the editor leaves them blank.
   */
  operationalStorageConfiguration(
    input: StorageConfigurationCandidate,
  ): StorageConfigurationRecord {
    const configurationId = String(input.configurationId ?? '').trim();
    const existing = configurationId
      ? this.document.storage.configurations.find((entry) => entry.id === configurationId)
      : undefined;
    if (configurationId && !existing) {
      throw new ValidationAppError('Storage configuration not found.');
    }

    const adapterId = String(input.adapterId ?? existing?.adapterId ?? '').trim();
    if (!adapterId) throw new ValidationAppError('Storage adapter is required.');
    if (existing && adapterId !== existing.adapterId) {
      throw new ValidationAppError(
        'The storage adapter cannot be changed for an existing configuration.',
      );
    }

    const definition = storageAdapterRegistry.get(adapterId);
    const rawSettings = input.settings && typeof input.settings === 'object' ? input.settings : {};
    const transientSettings: Record<string, string> = {};
    for (const field of allFields(definition)) {
      const supplied = Object.prototype.hasOwnProperty.call(rawSettings, field.key);
      const suppliedValue = supplied ? normalizeScalar(field, rawSettings[field.key]) : '';
      if (field.secret) {
        if (suppliedValue) {
          transientSettings[field.key] = this.secretsEncryption.encrypt(suppliedValue);
        } else if (existing?.settings[field.key]) {
          transientSettings[field.key] = existing.settings[field.key]!;
        }
        continue;
      }
      if (supplied) transientSettings[field.key] = suppliedValue;
      else if (existing?.settings[field.key] !== undefined) {
        transientSettings[field.key] = existing.settings[field.key]!;
      } else if (field.defaultValue !== undefined)
        transientSettings[field.key] = field.defaultValue;
    }

    return this.resolveSecrets({
      id: existing?.id ?? 'transient',
      name: existing?.name ?? 'Transient storage target',
      adapterId,
      sequence: existing?.sequence ?? 0,
      stage: existing?.stage ?? '',
      status: existing?.status ?? '',
      settings: transientSettings,
    });
  }

  private assertUniqueStorageConfigurationName(name: string, exceptId?: string) {
    const normalized = name.trim().toLocaleLowerCase();
    if (!normalized) return;
    const duplicate = this.document.storage.configurations.some(
      (entry) => entry.id !== exceptId && entry.name.trim().toLocaleLowerCase() === normalized,
    );
    if (duplicate) {
      throw new ValidationAppError(
        `Storage configuration name '${name.trim()}' is already in use.`,
      );
    }
  }

  private normalizeConfiguration(
    value: Partial<StorageConfigurationRecord>,
    existing?: StorageConfigurationRecord,
    storedInput = false,
  ): StorageConfigurationRecord {
    const name = String(value.name ?? '').trim();
    if (!name) throw new ValidationAppError('Storage configuration name is required.');
    const adapterId = String(value.adapterId ?? '').trim();
    const definition = storageAdapterRegistry.get(adapterId);
    const rawSettings = value.settings && typeof value.settings === 'object' ? value.settings : {};
    const settings: Record<string, string> = {};

    for (const field of allFields(definition)) {
      const supplied = Object.prototype.hasOwnProperty.call(rawSettings, field.key);
      let fieldValue = normalizeScalar(field, rawSettings[field.key]);

      if (!supplied && !existing && field.defaultValue !== undefined) {
        fieldValue = field.defaultValue;
      }

      if (field.secret) {
        if (storedInput) {
          if (fieldValue) settings[field.key] = fieldValue;
        } else if (fieldValue) {
          settings[field.key] = this.secretsEncryption.encrypt(fieldValue);
        } else if (existing?.settings[field.key]) {
          settings[field.key] = existing.settings[field.key]!;
        }
      } else if (supplied || !existing) {
        settings[field.key] = fieldValue;
      } else if (existing.settings[field.key] !== undefined) {
        settings[field.key] = existing.settings[field.key]!;
      }
    }

    // Persisting a storage configuration is stage 1 only: a unique name and
    // concrete adapter are enough. Adapter field requirements are enforced by
    // the operational stage that consumes them (connection/database/schema),
    // so Admins can save an intentionally incomplete or temporarily offline target.
    const validStages = new Set<StorageConfigurationStage>([
      '',
      'configuration',
      'connection',
      'database',
      'schema',
      'data',
      'complete',
    ]);
    const validStatuses = new Set<StorageConfigurationStatus>(['', 'incomplete', 'ready', 'error']);
    const requestedStage = String(
      value.stage ?? existing?.stage ?? '',
    ) as StorageConfigurationStage;
    const requestedStatus = String(
      value.status ?? existing?.status ?? '',
    ) as StorageConfigurationStatus;
    if (!validStages.has(requestedStage)) {
      throw new ValidationAppError('Storage configuration stage is invalid.');
    }
    if (!validStatuses.has(requestedStatus)) {
      throw new ValidationAppError('Storage configuration status is invalid.');
    }

    const record: StorageConfigurationRecord = {
      id: existing?.id ?? (String(value.id ?? '').trim() || randomUUID()),
      name,
      adapterId,
      sequence:
        existing?.sequence ??
        (Number.isFinite(Number(value.sequence)) ? Number(value.sequence) : 0),
      stage: requestedStage,
      status: requestedStatus,
      settings,
    };

    // Existing documents retain their historical workflow status at startup.
    // For browser writes, never promote a client-supplied Ready claim without
    // complete target checks. Unmodified, previously Ready targets remain Ready.
    if (!storedInput && requestedStatus === 'ready') {
      const previouslyReady =
        existing?.status === 'ready' && this.unchangedTarget(existing, record);
      if (previouslyReady) {
        record.stage = 'complete';
      } else {
        const verifiedStage = this.verifiedStage(record);
        record.stage = verifiedStage;
        record.status = verifiedStage === 'complete' ? 'ready' : 'incomplete';
      }
    }

    return record;
  }

  private adminConfiguration(record: StorageConfigurationRecord): StorageConfigurationAdminRecord {
    const definition = storageAdapterRegistry.get(record.adapterId);
    const secretKeys = new Set(
      allFields(definition)
        .filter((field) => field.secret)
        .map((field) => field.key),
    );
    const settings = Object.fromEntries(
      Object.entries(record.settings).filter(([key]) => !secretKeys.has(key)),
    );
    return {
      id: record.id,
      name: record.name,
      adapterId: record.adapterId,
      sequence: record.sequence,
      stage: record.stage,
      status: record.status,
      settings,
      configuredSecretKeys: [...secretKeys].filter((key) => Boolean(record.settings[key])),
    };
  }

  private resolveSecrets(record: StorageConfigurationRecord): StorageConfigurationRecord {
    const definition = storageAdapterRegistry.get(record.adapterId);
    const secretKeys = new Set(
      allFields(definition)
        .filter((field) => field.secret)
        .map((field) => field.key),
    );
    return {
      ...structuredClone(record),
      settings: Object.fromEntries(
        Object.entries(record.settings).map(([key, value]) => [
          key,
          secretKeys.has(key) && value ? this.secretsEncryption.decrypt(value) : value,
        ]),
      ),
    };
  }

  private async persist(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.tmp`;
    await writeFile(temporary, JSON.stringify(this.document, null, 2) + '\n', 'utf8');
    await rename(temporary, this.filePath);
  }
}
