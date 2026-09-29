import {
  resolveSysBOUIView,
  type ResolvedSysBOUIView,
  type SysBOUIMetadata,
} from '@manatos/shared/metadata/ui';
import type { SysBOFieldMetadata } from '@manatos/shared/metadata/bo';

import type { UiBindingMode } from './binding.js';
import { EntityCollectionRuntime, cloneRows, type UiCollectionRow } from './collection.js';
import { UiDirtyRuntime, semanticEqual } from './dirty.js';
import { EntityFieldRuntime } from './field.js';
import {
  createEntityEntryPresentation,
  type EntityEntryPresentationFactory,
} from './entry-presentation.js';
import type { UiPresentationInstance } from './presentation.js';
import { projectUiLayout } from './layout.js';
import type { UiEntrySaveResult } from './entry-action.js';
import type { UiEntryPersistenceDefinition } from './entry-persistence.js';
import {
  applyEntityEntryRecovery,
  captureEntityEntryRecovery,
  type UiEntryRecoverySnapshot,
} from './recovery.js';
import type { UiContext, UiCtxObject } from './ui-context.js';
import type { UiLevel } from './ui-level.js';
import type { UiEntrySurfaceProvider, UiEntryTransferDto } from './surface-providers.js';
import { EntityEntryValidationRuntime, type UiValidationResult } from './validation.js';

export type EntityEntryMode = 'create' | 'edit' | 'view';
export type EntityEntrySurfaceLifecycle = 'created' | 'prepared' | 'active' | 'disposed';

export interface EntityEntrySurfaceOptions {
  readonly entityKey: string;
  readonly mode: EntityEntryMode;
  readonly uiMetadata: SysBOUIMetadata;
  readonly initialRecord: Readonly<Record<string, unknown>>;
  readonly fieldMetadata: Readonly<Record<string, SysBOFieldMetadata>>;
  /** Canonical parent-owned collection snapshots keyed by semantic source key. */
  readonly initialCollections?: Readonly<Record<string, readonly UiCollectionRow[]>>;
  /** Compatibility input for production collection resources (`original/current/references`). */
  readonly initialCollectionResources?: Readonly<
    Record<
      string,
      {
        readonly original: readonly UiCollectionRow[];
        readonly current: readonly UiCollectionRow[];
        readonly references?: Readonly<Record<string, readonly unknown[]>>;
      }
    >
  >;
  readonly requestedView?: string | null;
  /** Optional typed materializer hook used by hosts/components without moving semantic ownership. */
  readonly presentationFactory?: EntityEntryPresentationFactory;
  /** Explicit semantic persistence owner. Hosts and components do not save records directly. */
  readonly persistence?: UiEntryPersistenceDefinition;
}

/** Typed semantic controller for one entity-entry UiLevel. */
export class EntityEntrySurface implements UiEntrySurfaceProvider {
  #lifecycle: EntityEntrySurfaceLifecycle = 'created';
  #view: ResolvedSysBOUIView;
  readonly #fields = new Map<string, EntityFieldRuntime>();
  readonly #collections = new Map<string, EntityCollectionRuntime>();
  readonly dirty: UiDirtyRuntime;
  readonly validation: EntityEntryValidationRuntime;
  #presentation: UiPresentationInstance | null = null;
  #transferIdentityField = 'id';

  constructor(
    readonly level: UiLevel,
    readonly context: UiContext,
    readonly options: EntityEntrySurfaceOptions,
  ) {
    if (level.context !== context) {
      throw new Error('Entity entry surface must use its owning UiLevel canonical CTX.');
    }
    if (level.invocation?.entity && level.invocation.entity !== options.entityKey) {
      throw new Error(
        `Entity entry invocation targets '${level.invocation.entity}', not '${options.entityKey}'.`,
      );
    }
    this.#view = resolveSysBOUIView(
      options.uiMetadata,
      options.requestedView ?? level.invocation?.view,
    );
    this.dirty = new UiDirtyRuntime(context);
    this.validation = new EntityEntryValidationRuntime(context, this.#fields);
  }

  get lifecycle(): EntityEntrySurfaceLifecycle {
    return this.#lifecycle;
  }
  get entityKey(): string {
    return this.options.entityKey;
  }
  get mode(): EntityEntryMode {
    return this.options.mode;
  }
  get view(): ResolvedSysBOUIView {
    return this.#view;
  }
  get fields(): ReadonlyMap<string, EntityFieldRuntime> {
    return this.#fields;
  }
  get presentation(): UiPresentationInstance | null {
    return this.#presentation;
  }
  get collections(): ReadonlyMap<string, EntityCollectionRuntime> {
    return this.#collections;
  }

  resource<T = unknown>(key: string): T | undefined {
    return this.level.getRuntimeResource<T>(key);
  }

  acceptResource(key: string, value: unknown): void {
    this.level.setRuntimeResource(key, value);
  }

  resources(): Readonly<Record<string, unknown>> {
    return this.level.runtimeResourceSnapshot();
  }

  /** Export exactly this Entry as a detached, temporary provider DTO. */
  exportEntry(identityField = this.#transferIdentityField): UiEntryTransferDto {
    this.#assertAlive();
    const current = cloneRecord(this.#record('data.entry.current'));
    const original = cloneRecord(this.#record('data.entry.original'));
    const identity = String(current[identityField] ?? this.context.get('control.recordId') ?? '');
    if (!identity) throw new Error('Entry transfer requires an identity.');
    return {
      entityKey: this.entityKey,
      identity,
      identityField,
      current,
      original,
      resources: structuredClone(this.resources()),
    };
  }

  /** Import a complete detached Entry DTO into this surface's canonical #data. */
  importEntry(transfer: UiEntryTransferDto): void {
    this.#assertAlive();
    if (transfer.entityKey !== this.entityKey) throw new Error('Entry transfer entity mismatch.');
    this.#transferIdentityField = transfer.identityField || 'id';
    const current = cloneRecord(transfer.current);
    const original = transfer.original
      ? cloneRecord(transfer.original)
      : cloneRecord(transfer.current);
    for (const [key] of this.#fields) {
      if (!Object.prototype.hasOwnProperty.call(current, key)) continue;
      // Import through the same canonical field authorities used by normal Entry
      // state. data.entry.current/original are read-only mirrors in the browser CTX.
      this.context.replace(`data.fields.${key}.originalValue`, original[key], {
        source: 'entry-provider:import',
      });
      this.context.replace(`data.fields.${key}.value`, current[key], {
        source: 'entry-provider:import',
      });
    }
    this.level.replaceRuntimeResources(transfer.resources);
    this.dirty.refresh('entry-provider:import');
  }

  /** Callee-owned semantic initialization. Must execute exactly once for this surface. */
  prepare(): void {
    this.#assertAlive();
    if (this.#lifecycle !== 'created') throw new Error('Entity entry surface is already prepared.');

    const original = cloneRecord(this.options.initialRecord);
    const current = cloneRecord(this.options.initialRecord);
    const fields: UiCtxObject = Object.fromEntries(
      Object.entries(current).map(([key, value]) => [key, { value }]),
    );

    this.context.replace('data.entry.original', original, { source: 'entry-surface:prepare' });
    this.context.replace('data.entry.current', current, { source: 'entry-surface:prepare' });
    this.context.replace('data.fields', fields, { source: 'entry-surface:prepare' });
    if (this.options.initialCollections && this.options.initialCollectionResources) {
      throw new Error(
        'Entity entry surface accepts either initialCollections or initialCollectionResources, not both.',
      );
    }
    const collectionSeeds: Readonly<Record<string, readonly UiCollectionRow[]>> =
      this.options.initialCollections ??
      Object.fromEntries(
        Object.entries(this.options.initialCollectionResources ?? {}).map(([key, resource]) => [
          key,
          resource.current,
        ]),
      );
    const collections: UiCtxObject = Object.fromEntries(
      Object.entries(collectionSeeds).map(([key, rows]) => [
        key,
        { original: cloneRows(rows), current: cloneRows(rows) },
      ]),
    );
    this.context.replace('data.collections', collections, { source: 'entry-surface:prepare' });
    this.context.replace('control.presentation.uiView', viewProjection(this.#view), {
      source: 'entry-surface:prepare',
    });
    this.context.replace('state.dirty', false, { source: 'entry-surface:prepare' });

    const mode = this.#bindingMode();
    for (const metadata of Object.values(this.options.fieldMetadata)) {
      this.#fields.set(
        metadata.key,
        new EntityFieldRuntime(
          this.level,
          this.context,
          metadata,
          this.#view.metadata.record.fieldOverrides[metadata.key],
          mode,
        ),
      );
    }
    for (const key of Object.keys(collectionSeeds)) {
      this.#collections.set(key, new EntityCollectionRuntime(this.context, key));
    }
    this.#presentation = this.#createPresentation();
    const surface = this.context.get('') as unknown;
    const layout = projectUiLayout(surface, this.#presentation.definition);
    if (layout) {
      this.context.replace('layout', layout as unknown as UiCtxObject, {
        source: 'entry-surface:presentation',
      });
    }
    this.#lifecycle = 'prepared';
  }

  /** Adopt an already-hydrated browser Entry CTX without reinitializing its semantic state. */
  adopt(): void {
    this.#assertAlive();
    if (this.#lifecycle !== 'created') throw new Error('Entity entry surface is already prepared.');
    this.#record('data.entry.original');
    this.#record('data.entry.current');
    const hydratedFields = this.context.get('data.fields');
    if (!hydratedFields || typeof hydratedFields !== 'object' || Array.isArray(hydratedFields)) {
      throw new Error('Entity entry has no canonical data.fields state to adopt.');
    }
    const mode = this.#bindingMode();
    for (const key of Object.keys(hydratedFields as Readonly<Record<string, unknown>>)) {
      const metadata = this.options.fieldMetadata[key];
      if (!metadata) {
        throw new Error(
          `Canonical field '${key}' for entity '${this.entityKey}' has no field metadata.`,
        );
      }
      this.#fields.set(
        key,
        new EntityFieldRuntime(
          this.level,
          this.context,
          metadata,
          this.#view.metadata.record.fieldOverrides[key],
          mode,
        ),
      );
    }
    const collections = this.context.get('data.collections');
    if (collections && typeof collections === 'object' && !Array.isArray(collections)) {
      for (const key of Object.keys(collections as Record<string, unknown>))
        this.#collections.set(key, new EntityCollectionRuntime(this.context, key));
    }
    this.#lifecycle = 'prepared';
  }

  activate(): void {
    this.#assertAlive();
    if (this.#lifecycle === 'created') throw new Error('Entity entry surface is not prepared.');
    this.dirty.start();
    this.#presentation?.mount();
    this.#lifecycle = 'active';
  }

  field<T = unknown>(fieldKey: string): EntityFieldRuntime<T> {
    this.#assertAlive();
    if (this.#lifecycle === 'created') throw new Error('Entity entry surface is not prepared.');
    const field = this.#fields.get(fieldKey);
    if (!field)
      throw new Error(`Unknown canonical field '${fieldKey}' for entity '${this.entityKey}'.`);
    return field as EntityFieldRuntime<T>;
  }

  collection(collectionKey: string): EntityCollectionRuntime {
    this.#assertAlive();
    if (this.#lifecycle === 'created') throw new Error('Entity entry surface is not prepared.');
    const collection = this.#collections.get(collectionKey);
    if (!collection) {
      throw new Error(
        `Unknown canonical collection '${collectionKey}' for entity '${this.entityKey}'.`,
      );
    }
    return collection;
  }

  /** Canonical semantic records exposed read-only for cross-cutting runtime services. */
  canonicalOriginal(): Readonly<Record<string, unknown>> {
    this.#assertAlive();
    return this.#record('data.entry.original');
  }

  canonicalCurrent(): Readonly<Record<string, unknown>> {
    this.#assertAlive();
    return this.#record('data.entry.current');
  }

  /** Capture abnormal-interruption recovery; this is not intentional draft persistence. */
  captureRecovery(): UiEntryRecoverySnapshot | null {
    this.#assertAlive();
    if (this.#lifecycle === 'created') throw new Error('Entity entry surface is not prepared.');
    return captureEntityEntryRecovery(this);
  }

  /** Apply semantic recovery to an already reopened surface through canonical field bindings. */
  applyRecovery(snapshot: UiEntryRecoverySnapshot): void {
    this.#assertAlive();
    if (this.#lifecycle === 'created') throw new Error('Entity entry surface is not prepared.');
    applyEntityEntryRecovery(this, snapshot);
  }

  validate(): UiValidationResult {
    this.#assertAlive();
    if (this.#lifecycle === 'created') throw new Error('Entity entry surface is not prepared.');
    return this.validation.validate();
  }

  /** Semantic Save: validate, persist, reconcile final current state, then promote current to baseline. */
  async save(persistenceOverride?: UiEntryPersistenceDefinition): Promise<UiEntrySaveResult> {
    this.#assertAlive();
    if (this.#lifecycle === 'created') throw new Error('Entity entry surface is not prepared.');
    if (this.mode === 'view') throw new Error('A view-mode entity entry cannot be saved.');

    const validation = this.validate();
    if (!validation.valid) return { status: 'invalid', validation };
    if (!this.dirty.evaluate()) return { status: 'unchanged', validation };

    const persistence = persistenceOverride ?? this.options.persistence;
    if (!persistence)
      throw new Error(`Entity entry '${this.entityKey}' has no persistence strategy.`);
    const current = this.#record('data.entry.current');
    const original = this.#record('data.entry.original');
    this.context.replace(
      'control.persistence',
      this.#persistenceProjection({
        pending: true,
        strategy: persistence.id,
        kind: persistence.kind,
      }),
      { source: 'entry-surface:save-start' },
    );
    try {
      const collections = this.#collectionPersistenceState();
      const result = await persistence.save({
        entityKey: this.entityKey,
        mode: this.mode,
        current,
        original,
        ...(Object.keys(collections).length ? { collections } : {}),
      });
      this.#reconcileCurrent(result.record);
      this.#promoteBaseline(result.record);
      for (const [key, collection] of this.#collections) {
        collection.promote(result.collections?.[key] ?? collection.current());
      }
      this.dirty.refresh('entry-surface:save-collections-baseline');
      this.context.replace(
        'control.persistence',
        this.#persistenceProjection({
          pending: false,
          strategy: persistence.id,
          kind: persistence.kind,
          status: result.status,
        }),
        { source: 'entry-surface:save-complete' },
      );
      return { status: 'saved', validation, persistence: result };
    } catch (error) {
      this.context.replace(
        'control.persistence',
        this.#persistenceProjection({
          pending: false,
          strategy: persistence.id,
          kind: persistence.kind,
          status: 'failed',
        }),
        { source: 'entry-surface:save-failed' },
      );
      throw error;
    }
  }

  /** Resolve another view without rebuilding or rehydrating semantic entry state. */
  switchView(viewKey: string): ResolvedSysBOUIView {
    this.#assertAlive();
    if (this.#lifecycle === 'created') throw new Error('Entity entry surface is not prepared.');
    const next = resolveSysBOUIView(this.options.uiMetadata, viewKey);
    if (next.key === this.#view.key) return this.#view;

    // View-owned presentation is the only runtime subtree replaced here. Semantic
    // entry/field/binding/dirty/validation state remains owned by this surface/UiLevel.
    const previousPresentation = this.#presentation;
    this.#view = next;
    this.context.replace('control.presentation.uiView', viewProjection(next), {
      source: 'entry-surface:view-switch',
    });
    const mode = this.#bindingMode();
    for (const [key, field] of this.#fields) {
      field.applyView(next.metadata.record.fieldOverrides[key], mode);
    }
    this.#presentation = this.#createPresentation();
    const surface = this.context.get('') as unknown;
    const layout = projectUiLayout(surface, this.#presentation.definition);
    if (layout) {
      this.context.replace('layout', layout as unknown as UiCtxObject, {
        source: 'entry-surface:view-switch',
      });
    }
    previousPresentation?.dispose();
    if (this.#lifecycle === 'active') this.#presentation.mount();
    return next;
  }

  dispose(): void {
    if (this.#lifecycle === 'disposed') return;
    this.#presentation?.dispose();
    this.#presentation = null;
    this.dirty.dispose();
    this.#lifecycle = 'disposed';
  }

  #record(path: string): Readonly<Record<string, unknown>> {
    const value = this.context.get(path);
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`Entity entry has no canonical ${path} record.`);
    }
    return value as Readonly<Record<string, unknown>>;
  }

  #reconcileCurrent(record: Readonly<Record<string, unknown>> | undefined): void {
    if (!record) return;
    const authoritative = cloneRecord(record);
    for (const [key] of this.#fields) {
      // Repository responses may be partial projections. Preserve canonical live
      // values for fields the persistence result did not return, matching the
      // pre-V2 mergePersistedCtx contract.
      if (!Object.prototype.hasOwnProperty.call(authoritative, key)) continue;
      const authoritativeValue = authoritative[key];
      const currentValue = this.context.get(`data.fields.${key}.value`);
      // Persistence may legitimately normalize current state. Reconcile that
      // first, but do not manufacture current-value events for accepted values.
      if (!semanticEqual(currentValue, authoritativeValue)) {
        this.context.replace(`data.fields.${key}.value`, authoritativeValue, {
          source: 'entry-surface:save-field-reconcile',
        });
      }
    }
  }

  #promoteBaseline(acceptedRecord?: Readonly<Record<string, unknown>>): void {
    for (const [key] of this.#fields) {
      // A returned record is the persistence acknowledgement boundary. Preserve
      // the pre-V2 mergePersistedCtx rule for partial records: fields omitted
      // from that record keep their existing baseline. When no record is returned,
      // the persistence contract explicitly makes the submitted current authoritative.
      if (acceptedRecord && !Object.prototype.hasOwnProperty.call(acceptedRecord, key)) continue;
      const currentValue = this.context.get(`data.fields.${key}.value`);
      // entry.original is a read-only mirror of these canonical field baselines.
      // Successful Save therefore promotes every Entry through the same authority.
      this.context.replace(`data.fields.${key}.originalValue`, currentValue, {
        source: 'entry-surface:save-field-baseline',
      });
    }
    this.dirty.refresh('entry-surface:save-baseline');
    this.validation.validate();
  }

  #persistenceProjection(next: Readonly<Record<string, unknown>>): UiCtxObject {
    const existing = this.context.get('control.persistence');
    return {
      ...(existing && typeof existing === 'object' && !Array.isArray(existing)
        ? (existing as Readonly<Record<string, unknown>>)
        : {}),
      ...next,
    };
  }

  #collectionPersistenceState(): Readonly<
    Record<string, { current: readonly UiCollectionRow[]; original: readonly UiCollectionRow[] }>
  > {
    return Object.fromEntries(
      [...this.#collections].map(([key, collection]) => [
        key,
        { current: collection.current(), original: collection.original() },
      ]),
    );
  }

  #createPresentation(): UiPresentationInstance {
    return (this.options.presentationFactory ?? createEntityEntryPresentation)(
      this.level,
      this.context,
      this.#view,
    );
  }

  #bindingMode(): UiBindingMode {
    return this.mode === 'view' || this.#view.metadata.record.readOnly === true
      ? 'read'
      : 'read-write';
  }

  #assertAlive(): void {
    if (this.#lifecycle === 'disposed') throw new Error('Entity entry surface is disposed.');
  }
}

function cloneRecord(source: Readonly<Record<string, unknown>>): UiCtxObject {
  return structuredClone(source) as UiCtxObject;
}

function viewProjection(view: ResolvedSysBOUIView): UiCtxObject {
  return {
    key: view.key,
    viewType: view.viewType,
    ...(view.label ? { label: view.label } : {}),
  };
}
