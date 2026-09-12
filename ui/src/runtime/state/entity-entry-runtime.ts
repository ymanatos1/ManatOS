import {
  allowedInvocationOptionValues,
  isEmptyEntryFieldValue,
  reconcileRestrictedOptionValue,
  type ManatOSObjectMetadata,
  type SysBOUIMetadata,
  type SysBOUIRecordTabMetadata,
} from '@manatos/shared';
import { reactiveEventMatchesDependencies } from '../calculations/dependency-runtime.js';
import type { SurfaceEvent, SurfaceEventRuntime } from '../events/surface-event-runtime.js';
import { EffectiveUiMetadataResolver } from '../resolvers/effective-ui-metadata-resolver.js';
import {
  bindExpression,
  createEntityInitializationExpressionScope,
  createEntryExpressionScope,
  type V2ExpressionRootSource,
} from '../resolvers/expression-binding.js';
import type { SurfaceContext } from '../surface/contracts.js';
import type { SurfaceRuntime } from '../surface/surface-runtime.js';
import { ValidationRuntime } from '../validation/validation-runtime.js';
import { EntryAggregateStateRuntime } from './entry-aggregate-state-runtime.js';
import { EntryStateRuntime, type EntryInitialization } from './entry-state-runtime.js';

export interface EntityEntryTabState {
  readonly id: string;
  readonly label: string;
  readonly order: number;
  readonly visible: boolean;
  readonly readOnly: boolean;
  readonly metadata: SysBOUIRecordTabMetadata;
}

export interface EntityEntryRuntimeOptions {
  readonly surface: SurfaceContext;
  readonly surfaces: SurfaceRuntime;
  readonly metadata: ManatOSObjectMetadata<Record<string, unknown>>;
  readonly uiMetadata: SysBOUIMetadata;
  readonly rootSource?: V2ExpressionRootSource;
  readonly referenceData?: Readonly<Record<string, readonly Readonly<Record<string, unknown>>[]>>;
}

/**
 * Host-neutral V2 entry content runtime.
 *
 * The same instance model is used by an Entry Page and by Entry
 * Open/Create/View popups. Hosts own chrome only. This runtime composes the
 * already-established field state, calculations, effective UI metadata,
 * validation and aggregate persistence state; it does not duplicate them.
 */
export class EntityEntryRuntime {
  readonly surface: SurfaceContext;
  readonly entry: EntryStateRuntime;
  readonly validation: ValidationRuntime;
  readonly aggregate: EntryAggregateStateRuntime;
  readonly #events: SurfaceEventRuntime;
  readonly #rootSource: V2ExpressionRootSource;
  readonly #uiMetadata: SysBOUIMetadata;
  readonly #fieldMetadata: ManatOSObjectMetadata<Record<string, unknown>>['fieldDefinition'];
  readonly #referenceData: Readonly<Record<string, readonly Readonly<Record<string, unknown>>[]>>;
  readonly #tabs = new Map<string, EntityEntryTabState>();
  readonly #unsubscribers: (() => void)[] = [];
  #initialized = false;

  constructor(options: EntityEntryRuntimeOptions) {
    if (options.surface.kind !== 'entry') {
      throw new Error(`EntityEntryRuntime requires an entry surface, got ${options.surface.kind}.`);
    }
    if (!options.surface.entityKey)
      throw new Error('EntityEntryRuntime requires surface.entityKey.');
    if (
      options.metadata.key !== options.surface.entityKey ||
      options.uiMetadata.key !== options.surface.entityKey
    ) {
      throw new Error('EntityEntryRuntime metadata must match the surface entityKey.');
    }

    this.surface = options.surface;
    this.#events = options.surfaces.events;
    this.#rootSource = options.rootSource ?? {};
    this.#uiMetadata = options.uiMetadata;
    this.#fieldMetadata = options.metadata.fieldDefinition;
    this.#referenceData = options.referenceData ?? {};
    this.entry = new EntryStateRuntime(options.surface.id, this.#events);

    const canonicalFields = Object.values(options.metadata.fieldDefinition)
      .filter((field) => field.sensitive !== true)
      .sort((left, right) => left.order - right.order);
    for (const field of canonicalFields) {
      const original = options.surface.entry?.original?.[field.key] ?? null;
      this.entry.defineField(field.key, original);
    }

    const resolver = new EffectiveUiMetadataResolver();
    resolver.wireEntryFields(
      options.surface,
      this.entry,
      canonicalFields.map((field) => ({
        field: field.key,
        canonical: {
          label: field.label,
          ...(field.required !== undefined ? { required: field.required } : {}),
          ...(field.readOnly !== undefined ? { readOnly: field.readOnly } : {}),
        },
        ...(() => {
          const base = options.uiMetadata.record.fieldOverrides[field.key];
          const rule = this.surface.invocation.rules?.fields?.[field.key];
          const valueRule = this.surface.invocation.rules?.values?.[field.key];
          const fixed = valueRule
            ? Object.prototype.hasOwnProperty.call(valueRule, 'fixed')
            : false;
          const invocation =
            rule || fixed
              ? {
                  ...(rule?.label !== undefined ? { label: rule.label } : {}),
                  ...(rule?.visible !== undefined ? { visible: rule.visible } : {}),
                  ...(fixed ? { editable: false } : {}),
                  ...(!fixed && rule?.readOnly !== undefined ? { editable: !rule.readOnly } : {}),
                }
              : undefined;
          const override =
            base || invocation ? { ...(base ?? {}), ...(invocation ?? {}) } : undefined;
          return override ? { override } : {};
        })(),
      })),
      this.#rootSource,
      this.#fieldMetadata,
      this.#referenceData,
    );

    const knownFields = new Set(canonicalFields.map((field) => field.key));
    for (const field of canonicalFields) {
      if (!field.calculation) continue;
      const binding = bindExpression(field.calculation.expression, knownFields);
      /*
       * The server-side V2 projection is synchronous, while entityResolver
       * functions (for example TraverseEntity) are intentionally asynchronous.
       * Do not execute those functions through the synchronous projection:
       * keep the authoritative server/persisted value during render. Interactive
       * browser evaluation owns resolver delegation to the trusted API.
       */
      if (binding.compiled.requiredCapabilities.includes('entityResolver')) continue;
      const dependencyScope = createEntryExpressionScope(
        this.surface,
        this.entry.fields,
        this.#rootSource,
        this.#fieldMetadata,
        this.#referenceData,
      );
      this.entry.addValueCalculation({
        target: field.key,
        dependsOn: binding.resolveDependencyPaths(dependencyScope),
        calculate: () =>
          binding.evaluate(
            createEntryExpressionScope(
              this.surface,
              this.entry.fields,
              this.#rootSource,
              this.#fieldMetadata,
              this.#referenceData,
            ),
            `${this.surface.path}.fields.${field.key}.value`,
          ),
      });
    }

    this.#wireTabs(options.uiMetadata.record.tabs, knownFields);
    this.validation = new ValidationRuntime(options.surface.id, this.entry.fields, this.#events);
    this.aggregate = new EntryAggregateStateRuntime(
      options.surface.id,
      options.surfaces,
      this.entry.fields,
    );
  }

  initialize(initialization: EntryInitialization = {}): void {
    const current = this.surface.entry?.current ?? {};
    this.entry.apply({ ...current, ...(initialization.server ?? {}) }, 'server');

    /*
     * Create initialization is deliberately host-neutral. PageHost and PopupHost
     * both enter this exact sequence; callers only contribute invocation data.
     * Apply metadata defaults one-at-a-time so a later evaluator-backed default
     * can observe an earlier default through the canonical CTX field state.
     */
    if (this.surface.mode === 'create') this.#applyCreateDefaults();
    this.entry.apply(initialization.metadataDefaults ?? {}, 'metadata-default');

    /*
     * Caller option restrictions are authoritative over defaults, but they are
     * not themselves values. Reconcile the currently selected enum value after
     * metadata defaults and again after caller values. This gives every create
     * invocation one deterministic rule: keep a legal value; otherwise choose
     * the first legal option (or null when the caller permits none).
     *
     * This removes the historical split where browser callers promoted a sole
     * allowedValues item while the server renderer separately guessed a value
     * for allowedEnumItemTrait. The entry runtime is now the sole V2 owner.
     */
    if (this.surface.mode === 'create') this.#reconcileInvocationOptionRestrictions();

    const invocationValues = this.surface.invocation.rules?.values ?? {};
    const invocationDefaults = Object.fromEntries(
      Object.entries(invocationValues)
        .filter(([, rule]) => Object.prototype.hasOwnProperty.call(rule, 'default'))
        .map(([field, rule]) => [field, rule.default]),
    );
    const invocationFixed = Object.fromEntries(
      Object.entries(invocationValues)
        .filter(([, rule]) => Object.prototype.hasOwnProperty.call(rule, 'fixed'))
        .map(([field, rule]) => [field, rule.fixed]),
    );
    this.entry.apply(
      {
        ...invocationDefaults,
        ...(initialization.callerDefaults ?? {}),
      },
      'caller-default',
    );
    this.entry.apply(
      {
        ...invocationFixed,
        ...(initialization.callerOverrides ?? {}),
      },
      'caller-override',
    );
    if (this.surface.mode === 'create') this.#reconcileInvocationOptionRestrictions();

    this.entry.completeInitialization();
    this.#initialized = true;
    this.validation.validateAll();
    this.#refreshTabs();
  }

  #applyCreateDefaults(): void {
    const knownFields = new Set(this.entry.fields.all().map((field) => field.name));
    const orderedFields = Object.values(this.#fieldMetadata).sort(
      (left, right) => left.order - right.order,
    );

    for (const fieldMetadata of orderedFields) {
      const fieldKey = fieldMetadata.key;
      if (!Object.prototype.hasOwnProperty.call(fieldMetadata, 'createDefaultValue')) continue;

      const field = this.entry.fields.get(fieldKey);
      if (!field || !isEmptyEntryFieldValue(field.value)) continue;

      const candidate = fieldMetadata.createDefaultValue;
      let value =
        candidate && typeof candidate === 'object' && 'expression' in candidate
          ? bindExpression(candidate.expression, knownFields).evaluate(
              createEntityInitializationExpressionScope(
                this.surface,
                this.entry.fields,
                this.#rootSource,
              ),
              `${this.surface.path}.fields.${fieldKey}.value`,
            )
          : (candidate ?? null);

      // Canonical metadata owns the default, but a concrete entry invocation may
      // expose a narrower factual option domain (for example already-used enum
      // values removed from a create catalogue). Reconcile before applying so
      // every later default observes the effective value through CTX.
      if (fieldMetadata.type === 'enum') {
        const available = this.#referenceData[fieldKey];
        const allowed = available
          ?.map((item) => item.value)
          .filter((item) => item != null)
          .map(String);
        if (allowed?.length) value = reconcileRestrictedOptionValue(value, allowed);
      }

      // Apply immediately rather than accumulating a detached defaults object.
      // The next default therefore observes this value through CTX.
      this.entry.apply({ [fieldKey]: value }, 'metadata-default');
    }
  }

  #reconcileInvocationOptionRestrictions(): void {
    for (const [fieldKey, rawOverride] of Object.entries(
      this.surface.invocation.rules?.fields ?? {},
    )) {
      const metadata = this.#fieldMetadata[fieldKey];
      if (!metadata || metadata.type !== 'enum' || !rawOverride || typeof rawOverride !== 'object')
        continue;

      const override = rawOverride as Readonly<{
        allowedValues?: readonly unknown[];
        allowedEnumItemTrait?: string;
      }>;
      const allowed = allowedInvocationOptionValues(metadata, override);
      if (!allowed) continue;

      const field = this.entry.fields.get(fieldKey);
      if (!field) continue;
      const next = reconcileRestrictedOptionValue(field.value, allowed);
      if (Object.is(next, field.value)) continue;

      this.entry.apply({ [fieldKey]: next }, 'caller-override');
    }
  }

  tabs(): readonly EntityEntryTabState[] {
    return [...this.#tabs.values()].sort((left, right) => left.order - right.order);
  }

  visibleTabs(): readonly EntityEntryTabState[] {
    return this.tabs().filter((tab) => tab.visible);
  }

  values(): Readonly<Record<string, unknown>> {
    return this.entry.fields.values();
  }

  dispose(): void {
    for (const unsubscribe of this.#unsubscribers) unsubscribe();
    this.validation.dispose();
    this.aggregate.dispose();
    this.entry.dispose();
  }

  #wireTabs(tabs: readonly SysBOUIRecordTabMetadata[], knownFields: ReadonlySet<string>): void {
    for (const tab of tabs) {
      this.#tabs.set(tab.id, {
        id: tab.id,
        label: tab.label,
        order: tab.order,
        visible: typeof tab.visible === 'boolean' ? tab.visible : true,
        readOnly: tab.readOnly === true || this.surface.mode === 'view',
        metadata: tab,
      });
      if (!tab.visible || typeof tab.visible === 'boolean') continue;
      const binding = bindExpression<boolean>(tab.visible.expression, knownFields);
      const dependencyScope = createEntryExpressionScope(
        this.surface,
        this.entry.fields,
        this.#rootSource,
        this.#fieldMetadata,
        this.#referenceData,
      );
      const dependencies = binding.resolveDependencyPaths(dependencyScope);
      const refresh = (event: SurfaceEvent): void => {
        // Dynamic UI policy must not evaluate against a partially initialized
        // entry. The deterministic post-initialization refresh below establishes
        // the first visible state once every initialization layer has settled.
        if (!this.#initialized) return;
        if (!reactiveEventMatchesDependencies(this.surface.id, event, dependencies)) return;
        this.#resolveTab(tab, binding);
      };
      this.#unsubscribers.push(this.#events.subscribe('value:changed', refresh));
      this.#unsubscribers.push(this.#events.subscribe('ctx:changed', refresh));
      // Initial visibility is resolved only after all entry initialization layers
      // have been applied. Runtime changes remain event-driven after that point.
    }
  }

  #refreshTabs(): void {
    /*
     * Resolve every dynamic tab once against the *complete* initialized entry
     * surface. Field-change subscriptions in #wireTabs keep tabs reactive after
     * initialization, but expressions such as `mode !== 'create'` have no field
     * dependency and therefore receive no initialization value event. Without
     * this pass they incorrectly retain the optimistic `visible: true` seed.
     *
     * Keeping this generic is important: tab visibility belongs to effective V2
     * UI metadata and must not be repaired by individual renderers/components.
     */
    const knownFields = new Set(this.entry.fields.all().map((field) => field.name));
    for (const tab of this.#uiMetadata.record.tabs) {
      if (!tab.visible || typeof tab.visible === 'boolean') continue;
      this.#resolveTab(tab, bindExpression<boolean>(tab.visible.expression, knownFields));
    }
  }

  #resolveTab(
    tab: SysBOUIRecordTabMetadata,
    binding: ReturnType<typeof bindExpression<boolean>>,
  ): void {
    const current = this.#tabs.get(tab.id);
    if (!current) return;
    const visible = Boolean(
      binding.evaluate(
        createEntryExpressionScope(
          this.surface,
          this.entry.fields,
          this.#rootSource,
          this.#fieldMetadata,
          this.#referenceData,
        ),
        `${this.surface.path}.tabs.${tab.id}.visible`,
      ),
    );
    if (visible === current.visible) return;
    this.#tabs.set(tab.id, { ...current, visible });
  }
}
