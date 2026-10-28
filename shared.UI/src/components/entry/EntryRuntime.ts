import { sortReferenceRecords } from './sort-reference-records.js';
/**
 * UIS ENTRY SURFACE — owns the editable record, never Field rendering internals.
 *
 * EntryEditState derives permission/dirty/validation from data.current.
 * components/entry/embedded owns Entry > Tabs > FormField > typed Field.
 * Field input: adapter facts -> typed component intent -> setField(), which
 * is the sole edit authority; async projections are version-checked.
 * See: components/fields/registry.ts for shared type-specific behavior.
 */
import {
  ContextTreeRuntime,
  allSysBOMetadata,
  allSysBOUIMetadata,
  relationshipForField,
  evaluateExpression,
  enumItemsForField,
  type ExpressionCapabilityDelegate,
  type ManatOSRuntimeRootContext,
  resolveSysBOUIView,
} from '@manatos/shared';
import {
  UiHostLevelRuntime,
  type UiSurfaceContentContext,
} from '../../runtime/surface/host-level-runtime.js';
import {
  UiSurfaceEmbeddedRuntime,
  type UiEmbeddedSurfaceLevel,
} from '../../runtime/surface/embedded-runtime.js';
import { createUiSurfaceInvocation } from '../../runtime/surface/invocation.js';
import { resolveUiSurfaceParentPath } from '../../runtime/surface/host-runtime.js';
import {
  UiSurfaceResourceFailure,
  type UiSurfaceResourcePort,
} from '../../runtime/surface/resource-port.js';
import { createUiSemanticLayoutNode } from '../../runtime/layout/node.js';
import { createEntryEmbeddedRegistry } from './embedded/registry.js';
import { type EntryDefinition } from './embedded/Entry.js';
import {
  UI_COMPONENT_LANGUAGE,
  type UiEmbeddedInteractionEvent,
  type UiEmbeddedDispatchResult,
} from '../../runtime/component.js';
import { uiSurfaceActions } from '../../runtime/surface/actions.js';
import { uiEntryTabs, uiEntryProjectRecord, uiEntryCaption } from './EntryMetadata.js';
import { uiEntryRelatedCollection, uiEntryRelatedViews } from './EntrySections.js';
import { uiEntryUIViewOptions } from './EntryViews.js';
import {
  deriveEntryFieldState,
  entryAvailableOptions,
  reconcileEntryReadOnlyValues,
  type UiEntryFieldsState,
} from './EntryEditState.js';

/** Per-field reversible edits. Cursor counts currently applied changes. */
export interface UiEntryFieldHistory {
  readonly changes: readonly { readonly before: unknown; readonly after: unknown }[];
  readonly cursor: number;
}

export interface UiEntryLevel {
  readonly control: {
    readonly host: 'page' | 'popup';
    readonly kind: 'entry';
    readonly entityName: string;
    readonly instanceId: string;
    readonly invocation: ReturnType<typeof createUiSurfaceInvocation>;
  };
  readonly state: {
    readonly embeddedErrors: Record<string, string>;
    readonly fields: UiEntryFieldsState;
    readonly entry: {
      readonly activeTab: string;
      readonly uiViewKey: string;
      readonly mode: 'edit' | 'view' | 'create';
      readonly caption: string;
      readonly permissions: Readonly<Record<string, boolean>>;
      readonly loading: boolean;
      readonly saving: boolean;
      readonly switching: boolean;
      /** The previous physical view could not be recovered; only reopening is safe. */
      readonly recoveryFailed?: boolean;
      readonly dirty: boolean;
      readonly valid: boolean;
      readonly blocked: boolean;
      readonly saveReady: boolean;
      readonly error: string | null;
    };
  };
  readonly layout: Record<string, unknown>;
  readonly data: {
    readonly original: Readonly<Record<string, unknown>> | null;
    readonly current: Readonly<Record<string, unknown>> | null;
    readonly references: Readonly<Record<string, readonly Readonly<Record<string, unknown>>[]>>;
    readonly referenceCatalogueStatus?: Readonly<
      Record<string, 'unavailable' | 'unauthorized' | 'partial'>
    >;
    readonly imageVariants: Readonly<Record<string, unknown>>;
    readonly relatedCollections?: Readonly<
      Record<
        string,
        Readonly<{
          rows: readonly Readonly<Record<string, unknown>>[];
          references: Readonly<Record<string, readonly Readonly<Record<string, unknown>>[]>>;
          loading: boolean;
          error: string | null;
          viewKey?: string;
        }>
      >
    >;
    readonly history: Readonly<Record<string, UiEntryFieldHistory>>;
  };
}

let entryCounter = 0;

/** A view transition spans CTX, the embedded semantic layout and the client renderer. */
interface EntryUIViewTransition {
  readonly generation: number;
  readonly target: string;
  readonly previousState: UiEntryLevel['state'];
  readonly previousData: UiEntryLevel['data'];
  readonly previousDefinitions: Map<string, string>;
  readonly nextDefinitions: Map<string, string>;
  readonly previousView: string;
  readonly previousTab: string;
  readonly currentRecord: Readonly<Record<string, unknown>>;
  readonly nextTabs: ReturnType<typeof uiEntryTabs>;
  readonly nextSaveReady: boolean;
  readonly resolve: () => void;
  readonly reject: (error: Error) => void;
  phase: 'activating' | 'recovering';
  published: boolean;
  rendererReady: boolean;
  renderError: Error | null;
  initialError: Error | null;
  timer: ReturnType<typeof setTimeout>;
}

/** Host-agnostic read-only Entry content; no #level creation or ownership. */
export class UiEntryContentRuntime {
  private requestVersion = 0;
  private editVersion = 0;
  /** Authoritative pending calculation; a view transition must drain it before snapshotting. */
  private pendingFieldProjection: Promise<void> | null = null;
  /** Related data requests are scoped to a specific activated Entry view. */
  private relatedGeneration = 0;
  private relatedDefinitions = new Map<string, string>();
  private readonly lastViewTabs = new Map<string, string>();
  /** Prevent a subscriber from initiating a second switch during CTX publication. */
  private activatingUIView = false;
  private viewTransition: EntryUIViewTransition | null = null;
  private viewGeneration = 0;
  private disposed = false;
  private readonly expressionDelegate?: ExpressionCapabilityDelegate;
  constructor(
    private readonly host: UiSurfaceContentContext<UiEntryLevel>,
    private readonly entityKey: string,
    private readonly recordId: string,
    private readonly resourcePort?: UiSurfaceResourcePort,
    private readonly evaluationRoot?: () => ManatOSRuntimeRootContext,
  ) {
    if (resourcePort) {
      this.expressionDelegate = {
        capabilities: ['entityResolver'],
        evaluateFunction: async (call) => {
          const response = await resourcePort.request<{ value: unknown }>({
            kind: 'sysbo.expression-function',
            functionName: call.functionName,
            args: call.args,
          });
          return response.value;
        },
      };
      void (recordId === 'new' ? this.loadDraft() : this.load());
    }
  }
  get level(): UiEntryLevel {
    return this.host.level;
  }
  get levelPath(): string {
    return this.host.levelPath;
  }
  subscribe(listener: (level: UiEntryLevel) => void): () => void {
    return this.host.subscribe(listener, `${this.level.control.instanceId}:entry-view`);
  }
  selectTab(tab: string): void {
    if (this.activatingUIView || this.level.state.entry.recoveryFailed) return;
    if (
      !uiEntryTabs(this.entityKey, 'EN', {
        mode: this.level.state.entry.mode,
        permissions: this.level.state.entry.permissions,
        record: this.level.data.current,
        viewKey: this.level.state.entry.uiViewKey,
      }).some((item) => item.id === tab)
    )
      return;
    if (this.level.state.entry.activeTab !== tab) this.host.set('state.entry.activeTab', tab);
  }
  /** The host renderer must acknowledge its physical view after publication.
   * CTX subscribers are synchronous; Angular rendering is not. Never confuse a
   * successful CTX write with a successfully mounted Entry presentation.
   */
  pendingUIViewTransition(): { generation: number; viewKey: string } | null {
    const pending = this.viewTransition;
    return pending
      ? {
          generation: pending.generation,
          viewKey: pending.phase === 'recovering' ? pending.previousView : pending.target,
        }
      : null;
  }

  acknowledgeUIViewRendered(generation: number, viewKey: string): void {
    const pending = this.viewTransition;
    if (
      !pending ||
      pending.generation !== generation ||
      viewKey !== (pending.phase === 'recovering' ? pending.previousView : pending.target)
    )
      return;
    if (this.level.state.entry.uiViewKey !== viewKey) return;
    pending.rendererReady = true;
    this.settleUIViewTransition(pending);
  }

  /** Report failures during both activation AND recovery, including EJS
   * synchronous remounts whose exceptions CTX subscriptions isolate.
   */
  reportUIViewRenderError(error: unknown): boolean {
    const pending = this.viewTransition;
    if (!pending) return false;
    pending.renderError = error instanceof Error ? error : new Error(String(error));
    this.settleUIViewTransition(pending);
    return true;
  }

  /** Switch the view, never the Entry. This Promise resolves only after the
   * new semantic layout AND its client renderer have acknowledged readiness.
   */
  selectUIView(viewKey: string): Promise<void> {
    if (this.disposed) throw new Error('Entry Surface is disposed.');
    if (this.activatingUIView) throw new Error('An Entry UI view change is already in progress.');
    if (this.level.state.entry.recoveryFailed)
      throw new Error('Entry view recovery failed; reopen this Entry before continuing.');
    const entry = this.level.state.entry;
    if (entry.loading || entry.saving || !this.level.data.current || !this.level.data.original)
      throw new Error('Entry is not ready for a view change.');
    if (viewKey === entry.uiViewKey) return Promise.resolve();
    const projection = this.pendingFieldProjection;
    if (!projection) return this.activateUIView(viewKey);

    // Lock new Field edits immediately, but let the already-accepted calculation
    // finish and publish its authoritative record before preparing the next view.
    this.activatingUIView = true;
    this.host.set('state.entry', {
      ...this.level.state.entry,
      switching: true,
      saveReady: false,
    });
    return (async () => {
      try {
        await projection;
        if (this.disposed) throw new Error('Entry Surface was disposed during calculation.');
        if (this.level.state.entry.error)
          throw new Error(`Entry calculation failed: ${this.level.state.entry.error}`);
        await this.activateUIView(viewKey);
      } finally {
        // If preparation failed before a transition existed, restore safe UI
        // availability using the latest calculated record, never the stale snapshot.
        if (!this.viewTransition) {
          this.activatingUIView = false;
          if (!this.disposed && this.level.state.entry.switching) {
            const state = this.level.state.entry;
            const original = this.level.data.original;
            const current = this.level.data.current;
            const derived =
              original && current
                ? deriveEntryFieldState(
                    this.entityKey,
                    original,
                    current,
                    state.mode,
                    state.permissions,
                    entryAvailableOptions(this.entityKey, 'EN'),
                    this.evaluationRoot?.(),
                    state.uiViewKey,
                  )
                : null;
            this.host.set('state.entry', {
              ...state,
              switching: false,
              saveReady:
                !state.error &&
                !state.blocked &&
                !state.recoveryFailed &&
                state.mode === 'create' &&
                state.permissions.create === true &&
                derived?.aggregate.saveReady === true &&
                !state.saving,
            });
          }
        }
      }
    })();
  }

  private activateUIView(viewKey: string): Promise<void> {
    if (this.disposed) throw new Error('Entry Surface is disposed.');
    const level = this.level;
    const state = level.state.entry;
    if (
      state.loading ||
      state.saving ||
      state.recoveryFailed ||
      !level.data.current ||
      !level.data.original
    )
      throw new Error('Entry is not ready for a view change.');
    if (viewKey === state.uiViewKey) return Promise.resolve();

    // Resolve all metadata before touching the live view or its data.
    const metadata = allSysBOUIMetadata[this.entityKey as keyof typeof allSysBOUIMetadata];
    resolveSysBOUIView(metadata, viewKey);
    const option = uiEntryUIViewOptions(this.entityKey, state.uiViewKey, state.mode).find(
      (item) => item.key === viewKey,
    );
    if (!option?.available)
      throw new Error(`UI view '${viewKey}' is incompatible with the Entry mode.`);
    const tabs = uiEntryTabs(this.entityKey, 'EN', {
      mode: state.mode,
      permissions: state.permissions,
      record: level.data.current,
      viewKey,
    });
    const derived = deriveEntryFieldState(
      this.entityKey,
      level.data.original,
      level.data.current,
      state.mode,
      state.permissions,
      entryAvailableOptions(this.entityKey, 'EN'),
      this.evaluationRoot?.(),
      viewKey,
    );
    const activeTab =
      tabs.find((tab) => tab.id === this.lastViewTabs.get(viewKey))?.id ?? tabs[0]?.id ?? 'general';
    const nextDefinitions = this.relatedDefinitionsFor(tabs, viewKey);
    const previousState = level.state;
    const previousData = level.data;
    const previousDefinitions = this.relatedDefinitions;
    const retained = Object.fromEntries(
      Object.entries(previousData.relatedCollections ?? {}).filter(
        ([key, collection]) =>
          !collection.loading && nextDefinitions.get(key) === previousDefinitions.get(key),
      ),
    );
    const prefix = `${this.levelPath}.layout.Entry`;
    const nextState: UiEntryLevel['state'] = {
      ...previousState,
      embeddedErrors: Object.fromEntries(
        Object.entries(previousState.embeddedErrors).filter(
          ([path]) => path !== prefix && !path.startsWith(`${prefix}.`),
        ),
      ),
      fields: derived.fields,
      entry: {
        ...state,
        uiViewKey: viewKey,
        activeTab,
        switching: true,
        valid: derived.aggregate.valid,
        blocked: derived.aggregate.blocked,
        dirty: derived.aggregate.dirty,
        // The Save button is inactive until both semantic and physical view
        // owners agree on the new presentation.
        saveReady: false,
      },
    };

    return new Promise<void>((resolve, reject) => {
      const pending: EntryUIViewTransition = {
        generation: ++this.viewGeneration,
        target: viewKey,
        previousState,
        previousData,
        previousDefinitions,
        nextDefinitions,
        previousView: state.uiViewKey,
        previousTab: state.activeTab,
        currentRecord: level.data.current!,
        nextTabs: tabs,
        nextSaveReady:
          state.mode === 'create' &&
          state.permissions.create === true &&
          derived.aggregate.saveReady &&
          !state.saving,
        resolve,
        reject,
        phase: 'activating',
        published: false,
        rendererReady: false,
        renderError: null,
        initialError: null,
        timer: setTimeout(() => {
          const active = this.viewTransition;
          if (!active || active.generation !== pending.generation) return;
          this.failUIViewTransition(
            active,
            new Error(`Entry UI view ${active.phase} did not finish rendering.`),
          );
        }, 8000),
      };
      this.viewTransition = pending;
      this.activatingUIView = true;
      ++this.relatedGeneration; // invalidate old view requests BEFORE publishing
      try {
        this.host.publish(nextState, { ...previousData, relatedCollections: retained });
        pending.published = true;
        this.settleUIViewTransition(pending);
      } catch (error) {
        this.failUIViewTransition(
          pending,
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    });
  }

  private layoutUIViewError(): Error | null {
    const prefix = `${this.levelPath}.layout.Entry`;
    const failure = Object.entries(this.level.state.embeddedErrors).find(
      ([path]) => path === prefix || path.startsWith(`${prefix}.`),
    );
    if (failure) return new Error(`Could not activate Entry UI view: ${failure[1]}`);
    const entry = this.level.layout['Entry'] as Record<string, unknown> | undefined;
    const tabs = entry?.['EntryTabs'] as Record<string, unknown> | undefined;
    if (!tabs) return new Error('Entry view layout is missing its Tabs owner.');
    const status = this.level.state.entry;
    const expected = uiEntryTabs(this.entityKey, 'EN', {
      mode: status.mode,
      permissions: status.permissions,
      record: this.level.data.current,
      viewKey: status.uiViewKey,
    }).length;
    if (Object.keys(tabs).filter((key) => /^Tab\d+$/.test(key)).length !== expected)
      return new Error('Entry view layout does not contain the expected tab components.');
    return null;
  }

  private settleUIViewTransition(pending: EntryUIViewTransition): void {
    if (this.viewTransition !== pending || !pending.published) return;
    const error = pending.renderError ?? this.layoutUIViewError();
    if (error) {
      this.failUIViewTransition(pending, error);
      return;
    }
    if (!pending.rendererReady) return;
    if (
      this.disposed ||
      this.level.state.entry.uiViewKey !==
        (pending.phase === 'recovering' ? pending.previousView : pending.target)
    ) {
      this.failUIViewTransition(
        pending,
        new Error('Entry Surface changed during view activation.'),
      );
      return;
    }
    if (pending.phase === 'recovering') {
      this.finishUIViewTransition(
        pending,
        pending.initialError ?? new Error('Entry UI view activation failed.'),
      );
      return;
    }
    this.relatedDefinitions = pending.nextDefinitions;
    this.lastViewTabs.set(pending.previousView, pending.previousTab);
    this.finishUIViewTransition(pending);
    void this.loadRelatedCollections(
      this.requestVersion,
      pending.currentRecord,
      pending.nextTabs,
      true,
    );
  }

  private failUIViewTransition(pending: EntryUIViewTransition, error: Error): void {
    if (this.viewTransition !== pending) return;
    if (pending.phase === 'recovering') {
      const first = pending.initialError?.message ?? 'View activation failed';
      this.finishUIViewTransition(
        pending,
        new Error(`${first}; previous view could not be restored: ${error.message}`, {
          cause: error,
        }),
        true,
      );
      return;
    }
    clearTimeout(pending.timer);
    pending.timer = setTimeout(() => {
      if (this.viewTransition === pending && pending.phase === 'recovering')
        this.failUIViewTransition(pending, new Error('Previous Entry view did not remount.'));
    }, 8000);
    pending.phase = 'recovering';
    pending.initialError = error;
    pending.published = false;
    pending.rendererReady = false;
    pending.renderError = null;
    ++this.relatedGeneration;
    this.relatedDefinitions = pending.previousDefinitions;
    // Discard interrupted loads: they belong to a retired request generation.
    const completed = Object.fromEntries(
      Object.entries(pending.previousData.relatedCollections ?? {}).filter(
        ([, collection]) => !collection.loading,
      ),
    );
    try {
      this.host.publish(
        {
          ...pending.previousState,
          entry: {
            ...pending.previousState.entry,
            switching: true,
            saveReady: false,
          },
        },
        { ...pending.previousData, relatedCollections: completed },
      );
      pending.published = true;
      this.settleUIViewTransition(pending);
    } catch (recoveryError) {
      this.finishUIViewTransition(
        pending,
        new Error(`${error.message}; rollback publication failed.`, { cause: recoveryError }),
        true,
      );
    }
  }

  private finishUIViewTransition(
    pending: EntryUIViewTransition,
    error?: Error,
    recoveryFailed = false,
  ): void {
    if (this.viewTransition !== pending) return;
    clearTimeout(pending.timer);
    this.viewTransition = null;
    this.activatingUIView = false;
    if (!this.disposed) {
      this.host.set('state.entry', {
        ...this.level.state.entry,
        switching: false,
        recoveryFailed: recoveryFailed || this.level.state.entry.recoveryFailed === true,
        blocked: recoveryFailed ? true : this.level.state.entry.blocked,
        saveReady: recoveryFailed
          ? false
          : error
            ? this.restoredUIViewSaveReady(pending)
            : pending.nextSaveReady,
        error: recoveryFailed
          ? (error?.message ?? 'Entry view recovery failed.')
          : this.level.state.entry.error,
      });
    }
    if (error) {
      if (!this.disposed && !recoveryFailed) {
        const previousTabs = uiEntryTabs(this.entityKey, 'EN', {
          mode: pending.previousState.entry.mode,
          permissions: pending.previousState.entry.permissions,
          record: pending.currentRecord,
          viewKey: pending.previousView,
        });
        void this.loadRelatedCollections(
          this.requestVersion,
          pending.currentRecord,
          previousTabs,
          true,
        );
      }
      pending.reject(error);
    } else pending.resolve();
  }

  /** A projection may finish while the switch is locked. Recompute readiness
   * from the recovered canonical record, never a pre-projection Save flag.
   */
  private restoredUIViewSaveReady(pending: EntryUIViewTransition): boolean {
    const entry = this.level.state.entry;
    if (
      entry.recoveryFailed ||
      entry.blocked ||
      entry.error ||
      entry.saving ||
      entry.mode !== 'create' ||
      entry.permissions.create !== true ||
      !this.level.data.original ||
      !this.level.data.current
    )
      return false;
    return deriveEntryFieldState(
      this.entityKey,
      this.level.data.original,
      this.level.data.current,
      entry.mode,
      entry.permissions,
      entryAvailableOptions(this.entityKey, 'EN'),
      this.evaluationRoot?.(),
      pending.previousView,
    ).aggregate.saveReady;
  }

  /** Canonical view-aware collection identities: reuse rows only for identical declarations. */
  private relatedDefinitionsFor(
    tabs: readonly ReturnType<typeof uiEntryTabs>[number][],
    viewKey: string,
  ): Map<string, string> {
    const definitions = new Map<string, string>();
    const visit = (items: readonly import('./EntryMetadata.js').UiEntryLayoutItem[]): void => {
      for (const item of items) {
        if (item.kind === 'collection') {
          const definition = uiEntryRelatedCollection(this.entityKey, item.reference, viewKey);
          if (definition) definitions.set(item.reference, JSON.stringify(definition));
        } else if ('content' in item) visit(item.content);
      }
    };
    for (const tab of tabs) visit(tab.layout);
    return definitions;
  }

  async load(): Promise<void> {
    if (this.disposed || !this.resourcePort) return;
    const version = ++this.requestVersion;
    this.relatedGeneration++;
    this.relatedDefinitions.clear();
    this.host.publish(
      {
        ...this.level.state,
        fields: {},
        entry: {
          ...this.level.state.entry,
          loading: true,
          dirty: false,
          valid: true,
          saveReady: false,
          error: null,
        },
      },
      { original: null, current: null, references: {}, imageVariants: {}, history: {} },
    );
    try {
      const record = await this.resourcePort.request<Record<string, unknown>>({
        kind: 'sysbo.entry',
        entityKey: this.entityKey,
        recordId: this.recordId,
      });
      if (this.disposed || version !== this.requestVersion) return;
      if (!record || typeof record !== 'object' || Array.isArray(record))
        throw new Error('Invalid Entry response.');
      const referenceGroups: Record<string, readonly Readonly<Record<string, unknown>>[]> = {};
      if (
        record.references &&
        typeof record.references === 'object' &&
        !Array.isArray(record.references)
      ) {
        for (const [key, rows] of Object.entries(record.references)) {
          if (Array.isArray(rows))
            referenceGroups[key] = rows.filter(
              (row): row is Record<string, unknown> =>
                Boolean(row) && typeof row === 'object' && !Array.isArray(row),
            );
        }
      }
      const variants =
        record.imageVariants &&
        typeof record.imageVariants === 'object' &&
        !Array.isArray(record.imageVariants)
          ? (record.imageVariants as Record<string, unknown>)
          : {};
      // API extends the envelope for this GET; its resource metadata is not business data.
      const {
        references: _references,
        imageVariants: _imageVariants,
        __surfaceCapabilities: _capabilities,
        __referenceCatalogueStatus: _catalogueStatus,
        ...entityRecord
      } = record;
      void _references;
      void _imageVariants;
      const recordPermissions: Record<string, boolean> = {};
      if (_capabilities && typeof _capabilities === 'object' && !Array.isArray(_capabilities)) {
        for (const [key, value] of Object.entries(_capabilities)) {
          if (typeof value === 'boolean') recordPermissions[key] = value;
        }
      }
      // Related entries use the same calculated-name projection as the primary
      // Entry. Preserve API eligibility facts while projecting display fields.
      for (const [key, rows] of Object.entries(referenceGroups)) {
        referenceGroups[key] = await Promise.all(
          rows.map(async (row) => {
            try {
              return await uiEntryProjectRecord(key, row);
            } catch {
              return row;
            }
          }),
        );
      }
      if (this.disposed || version !== this.requestVersion) return;
      const projected = await uiEntryProjectRecord(
        this.entityKey,
        entityRecord,
        this.expressionDelegate,
      );
      if (this.disposed || version !== this.requestVersion) return;
      const original = structuredClone(projected);
      const current = structuredClone(projected);
      const previous = this.level.state.entry;
      const derived = deriveEntryFieldState(
        this.entityKey,
        original,
        current,
        previous.mode,
        recordPermissions,
        entryAvailableOptions(this.entityKey, 'EN'),
        this.evaluationRoot?.(),
        this.level.state.entry.uiViewKey,
      );
      const tabs = uiEntryTabs(this.entityKey, 'EN', {
        mode: previous.mode,
        permissions: recordPermissions,
        record: current,
        viewKey: this.level.state.entry.uiViewKey,
      });
      const activeTab = tabs.some((tab) => tab.id === previous.activeTab)
        ? previous.activeTab
        : (tabs[0]?.id ?? 'general');
      this.host.publish(
        {
          ...this.level.state,
          fields: derived.fields,
          entry: {
            ...previous,
            activeTab,
            permissions: recordPermissions,
            caption: uiEntryCaption(this.entityKey, current),
            dirty: derived.aggregate.dirty,
            valid: derived.aggregate.valid,
            blocked: derived.aggregate.blocked,
            saveReady: false, // No persistence transaction in this slice.
            loading: false,
            error: null,
          },
        },
        {
          original,
          current,
          references: referenceGroups,
          imageVariants: variants,
          history: {},
          referenceCatalogueStatus: this.catalogueStatus(_catalogueStatus),
        },
      );
      void this.loadRelatedCollections(version, current, tabs);
    } catch (error) {
      if (this.disposed || version !== this.requestVersion) return;
      this.host.publish(
        {
          ...this.level.state,
          fields: {},
          entry: {
            ...this.level.state.entry,
            loading: false,
            error: error instanceof Error ? error.message : 'Entry unavailable.',
          },
        },
        { original: null, current: null, references: {}, imageVariants: {}, history: {} },
      );
    }
  }
  /** Query declared related rows using the existing authorized List port.
   * Each result belongs to the current Entry request version, never a stale page.
   * Collection data is presentation-only; it does not enter the editable record.
   */
  private async loadRelatedCollections(
    version: number,
    record: Readonly<Record<string, unknown>>,
    tabs: readonly ReturnType<typeof uiEntryTabs>[number][],
    onlyMissing = false,
  ): Promise<void> {
    if (!this.resourcePort) return;
    const viewKey = this.level.state.entry.uiViewKey;
    const generation = this.relatedGeneration;
    const desired = this.relatedDefinitionsFor(tabs, viewKey);
    const definitions = [...desired.keys()]
      .filter(
        (key) => !onlyMissing || !Object.hasOwn(this.level.data.relatedCollections ?? {}, key),
      )
      .flatMap((key) => {
        const definition = uiEntryRelatedCollection(this.entityKey, key, viewKey);
        return definition ? [{ key, definition }] : [];
      });
    this.relatedDefinitions = desired;
    if (!definitions.length) return;
    const pending = {
      ...(onlyMissing ? this.level.data.relatedCollections : {}),
      ...Object.fromEntries(
        definitions.map(({ key, definition }) => [
          key,
          {
            rows: [],
            references: {},
            loading: true,
            error: null,
            viewKey: definition.relatedListView,
          },
        ]),
      ),
    };
    this.host.set('data.relatedCollections', pending);
    await Promise.all(
      definitions.map(async ({ key, definition }) => {
        let result: {
          rows: readonly Readonly<Record<string, unknown>>[];
          references: Readonly<Record<string, readonly Readonly<Record<string, unknown>>[]>>;
          loading: boolean;
          error: string | null;
        };
        try {
          if (!definition.source || definition.source.kind !== 'entity-query') {
            // Non-query collections may be embedded by the owning Entry response.
            const value = record[definition.sourceKey ?? key];
            result = {
              rows: Array.isArray(value)
                ? value.filter((row) => !!row && typeof row === 'object')
                : [],
              references: {},
              loading: false,
              error: null,
            };
          } else {
            const filterValue = record[definition.source.currentField ?? 'id'];
            if (filterValue === undefined || filterValue === null || filterValue === '') {
              result = { rows: [], references: {}, loading: false, error: null };
            } else {
              const page = await this.resourcePort!.request<{
                items: readonly Readonly<Record<string, unknown>>[];
                references?: Readonly<Record<string, readonly Readonly<Record<string, unknown>>[]>>;
              }>({
                kind: 'sysbo.list',
                entityKey: definition.entityKey,
                query: {
                  page: '1',
                  pageSize: String(definition.source.pageSize ?? 100),
                  [`filter.${definition.source.filterField}`]: String(filterValue),
                  ...(definition.source.sort
                    ? {
                        sort: definition.source.sort,
                        direction: definition.source.direction ?? 'asc',
                      }
                    : {}),
                },
              });
              if (!Array.isArray(page.items))
                throw new Error('Invalid related collection response.');
              let rows = page.items;
              const presentationEntity = definition.relatedEntityKey ?? definition.entityKey;
              if (presentationEntity !== definition.entityKey) {
                const bridge =
                  allSysBOMetadata[definition.entityKey as keyof typeof allSysBOMetadata];
                const bridgeField =
                  bridge &&
                  Object.keys(bridge.fieldDefinition).find(
                    (field) =>
                      relationshipForField(bridge, field)?.relationship.references.objectKey ===
                      presentationEntity,
                  );
                if (!bridgeField) throw new Error('Unknown related collection reference.');
                const ids = [
                  ...new Set(
                    rows
                      .map((row) => row[bridgeField])
                      .filter(
                        (id): id is string => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id),
                      ),
                  ),
                ];
                const referenced = ids.length
                  ? await this.resourcePort!.request<
                      Record<string, Record<string, Readonly<Record<string, unknown>>>>
                    >({
                      kind: 'sysbo.references',
                      targets: [{ entityKey: presentationEntity, ids }],
                    })
                  : {};
                const catalogue = referenced[presentationEntity] ?? {};
                rows = rows.flatMap((row) => {
                  const targetId = row[bridgeField];
                  const target =
                    typeof targetId === 'string' ? catalogue[targetId.toLowerCase()] : undefined;
                  return target ? [{ ...target, __relationshipId: row['id'] }] : [];
                });
              }
              // Presentation references belong to the target entity, not a junction row.
              const presented =
                allSysBOMetadata[presentationEntity as keyof typeof allSysBOMetadata];
              const views = definition.relatedListViews ?? {};
              const viewFields = Object.keys(views).length
                ? Object.values(views).flatMap((view) => Object.keys(view.fields ?? {}))
                : Object.keys(definition.fields ?? {});
              const targets = [...new Set(viewFields)].flatMap((field) => {
                if (!presented || !relationshipForField(presented, field)) return [];
                const ref = relationshipForField(presented, field)?.relationship.references
                  .objectKey;
                const ids = [
                  ...new Set(
                    rows
                      .map((row) => row[field])
                      .filter(
                        (id): id is string => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id),
                      ),
                  ),
                ];
                return ref && ids.length ? [{ entityKey: ref, ids }] : [];
              });
              const references: Record<string, readonly Readonly<Record<string, unknown>>[]> = {};
              if (targets.length) {
                const fetched = await this.resourcePort!.request<
                  Record<string, Record<string, Readonly<Record<string, unknown>>>>
                >({
                  kind: 'sysbo.references',
                  targets,
                });
                for (const [entity, records] of Object.entries(fetched))
                  references[entity] = Object.values(records);
              }
              result = { rows, references, loading: false, error: null };
            }
          }
        } catch (error) {
          result = {
            rows: [],
            references: {},
            loading: false,
            error: error instanceof Error ? error.message : 'Collection unavailable.',
          };
        }
        if (
          this.disposed ||
          version !== this.requestVersion ||
          generation !== this.relatedGeneration ||
          this.level.state.entry.uiViewKey !== viewKey ||
          this.level.data.current !== record
        )
          return;
        this.host.set(`data.relatedCollections.${key}`, {
          ...result,
          viewKey: this.level.data.relatedCollections?.[key]?.viewKey ?? definition.relatedListView,
        });
      }),
    );
  }

  /** Related-list presentation state belongs to the existing Entry CTX, not a nested Surface. */
  setRelatedView(key: string, viewKey: string): void {
    if (this.activatingUIView || this.level.state.entry.recoveryFailed) return;
    const collection = uiEntryRelatedCollection(
      this.entityKey,
      key,
      this.level.state.entry.uiViewKey,
    );
    if (!collection || !this.level.data.relatedCollections?.[key]) return;
    if (!uiEntryRelatedViews(collection, 'EN').some((view) => view.key === viewKey)) return;
    this.host.set(`data.relatedCollections.${key}.viewKey`, viewKey);
  }

  /** Keep only declared metadata keys and known status values in canonical #data. */
  private catalogueStatus(
    raw: unknown,
  ): Record<string, 'unavailable' | 'unauthorized' | 'partial'> {
    const safe: Record<string, 'unavailable' | 'unauthorized' | 'partial'> = Object.create(null);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return safe;
    for (const [key, value] of Object.entries(raw)) {
      if (
        Object.hasOwn(allSysBOMetadata, key) &&
        (value === 'unavailable' || value === 'unauthorized' || value === 'partial')
      )
        safe[key] = value;
    }
    return safe;
  }
  /** A create-only Entry has no persisted id; all editable values stay in #data.current. */
  async loadDraft(): Promise<void> {
    if (this.disposed || !this.resourcePort || this.recordId !== 'new') return;
    const version = ++this.requestVersion;
    this.host.publish(
      {
        ...this.level.state,
        fields: {},
        entry: {
          ...this.level.state.entry,
          mode: 'create',
          loading: true,
          error: null,
          saveReady: false,
        },
      },
      { original: null, current: null, references: {}, imageVariants: {}, history: {} },
    );
    try {
      const response = await this.resourcePort.request<Record<string, unknown>>({
        kind: 'sysbo.entry-draft',
        entityKey: this.entityKey,
      });
      if (this.disposed || version !== this.requestVersion) return;
      if (!response || typeof response !== 'object' || Array.isArray(response))
        throw new Error('Invalid Entry draft.');
      const {
        references: referenceData,
        __surfaceCapabilities: grants,
        __referenceCatalogueStatus: catalogueStatus,
        ...raw
      } = response;
      if (
        !grants ||
        typeof grants !== 'object' ||
        (grants as Record<string, unknown>).create !== true
      )
        throw new Error('Create permission denied.');
      const references: Record<string, readonly Readonly<Record<string, unknown>>[]> = {};
      if (referenceData && typeof referenceData === 'object' && !Array.isArray(referenceData)) {
        for (const [key, rows] of Object.entries(referenceData)) {
          if (Array.isArray(rows))
            references[key] = await Promise.all(
              rows
                .filter(
                  (row): row is Record<string, unknown> =>
                    !!row && typeof row === 'object' && !Array.isArray(row),
                )
                .map(async (row) => uiEntryProjectRecord(key, row).catch(() => row)),
            );
        }
      }
      if (this.disposed || version !== this.requestVersion) return;
      const original = structuredClone(raw);
      const current = await uiEntryProjectRecord(
        this.entityKey,
        structuredClone(raw),
        this.expressionDelegate,
      ).catch(() => structuredClone(raw));
      if (this.disposed || version !== this.requestVersion) return;
      const permissions = { create: true };
      const derived = deriveEntryFieldState(
        this.entityKey,
        original,
        current,
        'create',
        permissions,
        entryAvailableOptions(this.entityKey, 'EN'),
        this.evaluationRoot?.(),
        this.level.state.entry.uiViewKey,
      );
      const tabs = uiEntryTabs(this.entityKey, 'EN', {
        mode: 'create',
        permissions,
        record: current,
        viewKey: this.level.state.entry.uiViewKey,
      });
      this.host.publish(
        {
          ...this.level.state,
          fields: derived.fields,
          entry: {
            ...this.level.state.entry,
            mode: 'create',
            permissions,
            activeTab: tabs[0]?.id ?? 'general',
            caption: uiEntryCaption(this.entityKey, null),
            loading: false,
            dirty: derived.aggregate.dirty,
            valid: derived.aggregate.valid,
            blocked: derived.aggregate.blocked,
            saveReady: false,
            error: null,
          },
        },
        {
          original,
          current,
          references,
          imageVariants: {},
          history: {},
          referenceCatalogueStatus: this.catalogueStatus(catalogueStatus),
        },
      );
    } catch (error) {
      if (this.disposed || version !== this.requestVersion) return;
      this.host.publish(
        {
          ...this.level.state,
          entry: {
            ...this.level.state.entry,
            loading: false,
            error: error instanceof Error ? error.message : 'Draft unavailable.',
          },
        },
        { original: null, current: null, references: {}, imageVariants: {}, history: {} },
      );
    }
  }

  /** The UI host supplies a genuine API create transaction, never a local pseudo-save. */
  async create(): Promise<Readonly<Record<string, unknown>> | null> {
    if (
      this.activatingUIView ||
      this.level.state.entry.recoveryFailed ||
      this.pendingFieldProjection
    )
      return null;
    if (this.disposed || this.recordId !== 'new' || !this.resourcePort) return null;
    const entry = this.level.state.entry;
    const record = this.level.data.current;
    if (entry.mode !== 'create' || entry.saving || !entry.saveReady || !record) return null;
    const submission = Object.fromEntries(
      Object.entries(record).filter(([key]) =>
        Object.hasOwn(
          allSysBOMetadata[this.entityKey as keyof typeof allSysBOMetadata].fieldDefinition,
          key,
        ),
      ),
    );
    ++this.editVersion; // A late calculated-field projection may not overwrite a saved record.
    this.host.set('state.entry', { ...entry, saving: true, saveReady: false, error: null });
    try {
      const created = await this.resourcePort.request<Record<string, unknown>>({
        kind: 'sysbo.entry-create',
        entityKey: this.entityKey,
        record: submission,
      });
      if (this.disposed) return null;
      if (
        !created ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          String(created.id ?? ''),
        )
      )
        throw new Error('Create did not return a valid GUID.');
      // Mark the transaction complete; the outer popup decides selection/closure.
      const current = await uiEntryProjectRecord(this.entityKey, created, this.expressionDelegate);
      if (this.disposed) return null;
      const derived = deriveEntryFieldState(
        this.entityKey,
        current,
        current,
        'view',
        {},
        entryAvailableOptions(this.entityKey, 'EN'),
        this.evaluationRoot?.(),
        this.level.state.entry.uiViewKey,
      );
      this.host.publish(
        {
          ...this.level.state,
          fields: derived.fields,
          entry: {
            ...this.level.state.entry,
            mode: 'view',
            saving: false,
            saveReady: false,
            dirty: false,
            valid: derived.aggregate.valid,
            blocked: false,
            caption: uiEntryCaption(this.entityKey, created),
            error: null,
          },
        },
        { ...this.level.data, original: current, current, history: {} },
      );
      return created;
    } catch (error) {
      if (!this.disposed)
        this.host.set('state.entry', {
          ...this.level.state.entry,
          saving: false,
          // A definite API validation rejection is retryable; an ambiguous upstream failure is not.
          saveReady:
            error instanceof UiSurfaceResourceFailure &&
            error.status < 500 &&
            this.level.state.entry.dirty &&
            this.level.state.entry.valid &&
            !this.level.state.entry.blocked,
          error: error instanceof Error ? error.message : 'Unable to save Entry.',
        });
      return null;
    }
  }

  /** Canonical Entry-level field history; snapshots contain values/descriptors, never binary bytes. */
  private async applyField(
    field: string,
    value: unknown,
    historyOverride?: Readonly<Record<string, UiEntryFieldHistory>>,
  ): Promise<void> {
    if (
      this.disposed ||
      this.activatingUIView ||
      this.level.state.entry.loading ||
      this.level.state.entry.recoveryFailed
    )
      return;
    const original = this.level.data.original;
    const current = this.level.data.current;
    if (
      !original ||
      !current ||
      this.level.state.entry.saving ||
      !this.level.state.fields[field]?.editable
    )
      return;
    const before = current[field];
    // An unchanged value is not a new history operation.
    if (historyOverride === undefined && JSON.stringify(before) === JSON.stringify(value)) return;
    let history = historyOverride;
    // Only explicitly adopted Field types publish history. Text/enum/etc. remain
    // untouched until their semantics are migrated and verified in a later slice.
    const fieldType =
      allSysBOMetadata[this.entityKey as keyof typeof allSysBOMetadata]?.fieldDefinition[field]
        ?.type;
    if (!history && (fieldType === 'picture' || fieldType === 'reference')) {
      const previous = this.level.data.history[field] ?? { changes: [], cursor: 0 };
      const changes = [
        ...previous.changes.slice(0, previous.cursor),
        { before: structuredClone(before), after: structuredClone(value) },
      ].slice(-20);
      history = { ...this.level.data.history, [field]: { changes, cursor: changes.length } };
    }
    const version = ++this.editVersion;
    const changed = reconcileEntryReadOnlyValues(
      this.entityKey,
      original,
      this.level.state.fields,
      { ...current, [field]: value },
      this.level.state.entry.mode,
      this.level.state.entry.permissions,
      this.evaluationRoot?.(),
    );
    // Register the pending calculation BEFORE publishing the optimistic edit:
    // synchronous CTX subscribers must not be able to switch views using an
    // unprojected snapshot. A newer Field edit can supersede this generation.
    let settleProjection!: () => void;
    const pending = new Promise<void>((resolve) => {
      settleProjection = resolve;
    });
    this.pendingFieldProjection = pending;
    try {
      // An accepted edit is visible immediately, but never Save-ready until
      // its asynchronous calculated-field projection finishes successfully.
      this.publishEdited(original, changed, history, false);
      try {
        const projected = await uiEntryProjectRecord(
          this.entityKey,
          changed,
          this.expressionDelegate,
        );
        if (!this.disposed && version === this.editVersion && this.level.data.current)
          this.publishEdited(original, projected);
      } catch (error) {
        if (!this.disposed && version === this.editVersion) {
          const entry = this.level.state.entry;
          this.host.set('state.entry', {
            ...entry,
            blocked: true,
            saveReady: false,
            error: error instanceof Error ? error.message : 'Unable to recalculate Entry fields.',
          });
        }
      }
    } finally {
      settleProjection();
      if (this.pendingFieldProjection === pending) this.pendingFieldProjection = null;
    }
  }
  setField(field: string, value: unknown): Promise<void> {
    return this.applyField(field, value);
  }
  async undoField(field: string): Promise<void> {
    const history = this.level.data.history[field];
    if (!history || history.cursor === 0) return;
    await this.applyField(field, structuredClone(history.changes[history.cursor - 1]!.before), {
      ...this.level.data.history,
      [field]: { ...history, cursor: history.cursor - 1 },
    });
  }
  async redoField(field: string): Promise<void> {
    const history = this.level.data.history[field];
    if (!history || history.cursor >= history.changes.length) return;
    await this.applyField(field, structuredClone(history.changes[history.cursor]!.after), {
      ...this.level.data.history,
      [field]: { ...history, cursor: history.cursor + 1 },
    });
  }
  revertField(field: string): Promise<void> {
    if (!this.level.state.fields[field]?.dirty) return Promise.resolve();
    return this.setField(field, this.level.data.original?.[field]);
  }
  private publishEdited(
    original: Readonly<Record<string, unknown>>,
    current: Readonly<Record<string, unknown>>,
    history?: Readonly<Record<string, UiEntryFieldHistory>>,
    projectionSettled = true,
  ): void {
    const state = this.level.state;
    const data = this.level.data;
    const derived = deriveEntryFieldState(
      this.entityKey,
      original,
      current,
      state.entry.mode,
      state.entry.permissions,
      entryAvailableOptions(this.entityKey, 'EN'),
      this.evaluationRoot?.(),
      state.entry.uiViewKey,
    );
    const tabs = uiEntryTabs(this.entityKey, 'EN', {
      mode: state.entry.mode,
      permissions: state.entry.permissions,
      record: current,
      viewKey: state.entry.uiViewKey,
    });
    this.host.publish(
      {
        ...state,
        fields: derived.fields,
        entry: {
          ...state.entry,
          activeTab: tabs.some((tab) => tab.id === state.entry.activeTab)
            ? state.entry.activeTab
            : (tabs[0]?.id ?? 'general'),
          // The title identifies the initially loaded record, never the edited draft.
          caption: state.entry.caption,
          dirty: derived.aggregate.dirty,
          valid: derived.aggregate.valid,
          blocked: derived.aggregate.blocked,
          saveReady:
            state.entry.mode === 'create' &&
            state.entry.permissions.create === true &&
            derived.aggregate.saveReady &&
            projectionSettled &&
            !state.entry.saving &&
            !state.entry.switching &&
            !this.activatingUIView,
          error: null,
        },
      },
      { ...data, current, history: history ?? data.history },
    );
  }
  dispose(): void {
    this.disposed = true;
    this.editVersion++;
    this.requestVersion++;
    this.relatedGeneration++;
    const pending = this.viewTransition;
    if (pending)
      this.finishUIViewTransition(
        pending,
        new Error('Entry Surface was disposed during view switching.'),
      );
  }
}

/** Page/Popup host adapter. Both host kinds mount exactly the same Entry content. */
export class UiEntryPageRuntime {
  readonly instanceId = `entry-${++entryCounter}`;
  readonly levelPath: string;
  readonly content: UiEntryContentRuntime;
  private readonly host: UiHostLevelRuntime<UiEntryLevel>;
  private readonly embedded: UiSurfaceEmbeddedRuntime;
  /** Cached semantic owners; remount invalidates a stale path via componentAt(). */
  private readonly fieldEventPaths = new Map<string, string>();
  constructor(
    context: ContextTreeRuntime<ManatOSRuntimeRootContext>,
    entityKey: string,
    recordId: string,
    private readonly resourcePort?: UiSurfaceResourcePort,
    options: {
      host?: 'page' | 'popup';
      parentLevelPath?: string | null;
      permissions?: Readonly<Record<string, boolean>>;
      /** Explicit view/edit semantics; never derive read-only mode merely from recordId. */
      mode?: 'view' | 'edit' | 'create';
      /** Live optional Host capability; language changes never rebuild the Surface. */
      language?: () => import('@manatos/shared').MetadataLanguage;
    } = {},
  ) {
    if (
      !Object.hasOwn(allSysBOUIMetadata, entityKey) ||
      !Object.hasOwn(allSysBOMetadata, entityKey)
    )
      throw new Error('Unknown Entry entity.');
    if (
      !(recordId === 'new' && (options.host ?? 'page') === 'popup') &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(recordId)
    )
      throw new Error('Invalid Entry record identifier.');
    const hostKind = options.host ?? 'page';
    this.levelPath =
      hostKind === 'page' && !options.parentLevelPath
        ? 'ctx.ui.level'
        : `${resolveUiSurfaceParentPath(context, options.parentLevelPath ?? null)}.level`;
    const permissions = options.permissions ?? {};
    const mode = options.mode ?? (recordId === 'new' ? 'create' : 'edit');
    if ((recordId === 'new') !== (mode === 'create'))
      throw new Error('Entry mode is incompatible with its record identifier.');
    const tabs = uiEntryTabs(entityKey, 'EN', { mode, permissions });
    let draft: UiEmbeddedSurfaceLevel | null = null;
    let embedded: UiSurfaceEmbeddedRuntime | null = null;
    let host: UiHostLevelRuntime<UiEntryLevel> | null = null;
    let ownedContent: UiEntryContentRuntime | null = null;
    try {
      host = new UiHostLevelRuntime<UiEntryLevel>(
        context,
        {
          host: hostKind,
          kind: 'entry',
          instanceId: this.instanceId,
          entityName: allSysBOMetadata[entityKey as keyof typeof allSysBOMetadata].label,
          invocation: createUiSurfaceInvocation({
            params: { entityKey, recordId, view: 'main', mode },
          }),
        },
        () => {
          const content = {
            state: {
              embeddedErrors: {},
              fields: {},
              entry: {
                activeTab: tabs[0]?.id ?? 'general',
                uiViewKey:
                  allSysBOUIMetadata[entityKey as keyof typeof allSysBOUIMetadata].defaultUIView ??
                  'main',
                mode,
                caption: uiEntryCaption(entityKey, null),
                permissions,
                loading: false,
                saving: false,
                switching: false,
                dirty: false,
                valid: true,
                blocked: false,
                saveReady: false,
                error: null,
              },
            },
            data: {
              original: null,
              current: null,
              references: {},
              imageVariants: {},
              history: {},
            },
          };
          draft = content;
          embedded = new UiSurfaceEmbeddedRuntime(
            context,
            this.levelPath,
            createEntryEmbeddedRegistry(),
            {
              name: this.instanceId,
              services: options.language
                ? new Map([[UI_COMPONENT_LANGUAGE.id, options.language]])
                : undefined,
              draft: () => draft,
              errorsPath: 'state.embeddedErrors',
              node: (kind, id, selector, field) =>
                createUiSemanticLayoutNode(kind, id, `entry:${id}`, selector, {}, field),
              componentNode: (definition) =>
                createUiSemanticLayoutNode(
                  'component',
                  definition.id,
                  `entry:${definition.id}`,
                  (definition as EntryDefinition).selector,
                  {},
                  undefined,
                  true,
                ),
            },
          );
          const layout = createUiSemanticLayoutNode('root', 'layout', 'entry:layout', '');
          layout.Entry = embedded.mount(
            {
              id: 'Entry',
              kind: 'entry',
              entityKey,
              hostKind,
              permissions,
              actionIds: uiSurfaceActions('entry', hostKind).map((action) => action.id),
              selector: '[data-entry-layout="Entry"]',
            } as EntryDefinition,
            `${this.levelPath}.layout.Entry`,
          );
          return { ...content, layout };
        },
        () => {
          (ownedContent as UiEntryContentRuntime | null)?.dispose();
          embedded?.dispose();
        },
        options.parentLevelPath ?? null,
      );
      this.host = host;
      if (!embedded) throw new Error('Entry embedded runtime not initialized.');
      this.embedded = embedded as UiSurfaceEmbeddedRuntime;
      this.embedded.attach();
      this.content = new UiEntryContentRuntime(host, entityKey, recordId, resourcePort, () =>
        context.root(),
      );
      ownedContent = this.content;
      draft = null;
    } catch (error) {
      (embedded as UiSurfaceEmbeddedRuntime | null)?.dispose();
      try {
        host?.dispose();
      } catch {
        /* preserve original initialization error */
      }
      throw error;
    }
  }
  get level(): UiEntryLevel {
    return this.content.level;
  }
  subscribe(listener: (level: UiEntryLevel) => void): () => void {
    return this.content.subscribe(listener);
  }
  selectTab(tab: string): void {
    this.content.selectTab(tab);
  }
  selectUIView(viewKey: string): Promise<void> {
    return this.content.selectUIView(viewKey);
  }
  pendingUIViewTransition(): { generation: number; viewKey: string } | null {
    return this.content.pendingUIViewTransition();
  }
  acknowledgeUIViewRendered(generation: number, viewKey: string): void {
    this.content.acknowledgeUIViewRendered(generation, viewKey);
  }
  reportUIViewRenderError(error: unknown): boolean {
    return this.content.reportUIViewRenderError(error);
  }
  setField(field: string, value: unknown): Promise<void> {
    return this.content.setField(field, value);
  }
  setRelatedView(reference: string, viewKey: string): void {
    this.content.setRelatedView(reference, viewKey);
  }
  revertField(field: string): Promise<void> {
    return this.content.revertField(field);
  }
  undoField(field: string): Promise<void> {
    return this.content.undoField(field);
  }
  redoField(field: string): Promise<void> {
    return this.content.redoField(field);
  }
  create(): Promise<Readonly<Record<string, unknown>> | null> {
    return this.content.create();
  }
  /** Check the current user's real, authorized List result, not a partial
   * reference-candidate catalogue or a client-side entity count. */
  async hasBrowsableRelatedEntries(field: string, relatedEntityKey: string): Promise<boolean> {
    const level = this.level;
    const current = level.data.current;
    const source = String(level.control.invocation.params['entityKey'] ?? '');
    const owner = allSysBOMetadata[source as keyof typeof allSysBOMetadata];
    const metadata = owner?.fieldDefinition[field];
    const direct = owner ? relationshipForField(owner, field) : null;
    const target =
      direct?.relationship.references.objectKey ?? metadata?.inverseRelationship?.objectKey;
    if (
      !this.resourcePort ||
      !current ||
      this.content.level.state.entry.recoveryFailed ||
      this.content.level.state.entry.switching ||
      !level.state.fields[field]?.editable ||
      metadata?.type !== 'reference' ||
      metadata.sensitive ||
      target !== relatedEntityKey
    )
      return false;
    try {
      const page = await this.resourcePort.request<{
        readonly items: readonly Readonly<Record<string, unknown>>[];
        readonly paging: { readonly total: number };
      }>({
        kind: 'sysbo.list',
        entityKey: relatedEntityKey,
        query: { page: '1', pageSize: '2' },
      });
      return (
        this.level.data.current === current &&
        this.level.state.fields[field]?.editable === true &&
        Array.isArray(page.items) &&
        page.items.some((row) => !!row && typeof row === 'object' && typeof row.id === 'string')
      );
    } catch {
      return false;
    }
  }

  /** Resolve a browsed GUID through the authenticated eligibility boundary.
   * A page of the convenience catalogue never limits valid selections. */
  async selectAuthorizedReference(
    field: string,
    relatedEntityKey: string,
    id: string,
    canCommit: () => boolean = () => true,
  ): Promise<boolean> {
    const level = this.level;
    const current = level.data.current;
    const source = String(level.control.invocation.params['entityKey'] ?? '');
    const sourceId = String(level.control.invocation.params['recordId'] ?? '');
    const owner = allSysBOMetadata[source as keyof typeof allSysBOMetadata];
    const metadata = owner?.fieldDefinition[field];
    const direct = owner ? relationshipForField(owner, field) : null;
    const target =
      direct?.relationship.references.objectKey ?? metadata?.inverseRelationship?.objectKey;
    if (
      !this.resourcePort ||
      !current ||
      this.content.level.state.entry.recoveryFailed ||
      this.content.level.state.entry.switching ||
      !level.state.fields[field]?.editable ||
      metadata?.type !== 'reference' ||
      metadata.sensitive ||
      target !== relatedEntityKey ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    )
      return false;
    try {
      const record = await this.resourcePort.request<Record<string, unknown>>({
        kind: 'sysbo.reference-choice',
        sourceEntity: source,
        sourceId,
        field,
        candidateId: id,
      });
      // Closing the List/quick selector invalidates its pending authorization
      // response. An accepted server check must never mutate a dismissed draft.
      if (!canCommit() || this.level.state.entry.switching || this.level.state.entry.recoveryFailed)
        return false;
      if (
        this.level.data.current !== current ||
        !this.level.state.fields[field]?.editable ||
        String(record.id ?? '').toLowerCase() !== id.toLowerCase() ||
        (record.__referenceFieldAvailability as Record<string, unknown> | undefined)?.[field] !==
          true
      )
        return false;
      const refs = this.level.data.references[relatedEntityKey] ?? [];
      this.host.publish(this.level.state, {
        ...this.level.data,
        references: {
          ...this.level.data.references,
          [relatedEntityKey]: sortReferenceRecords([
            ...refs.filter((row) => String(row.id ?? '').toLowerCase() !== id.toLowerCase()),
            record,
          ]),
        },
      });
      await this.content.setField(field, id);
      return true;
    } catch {
      return false;
    }
  }

  /** A caller cannot mint a selectable GUID. Only the authenticated API create result enters here. */
  async acceptCreatedReference(
    field: string,
    relatedEntityKey: string,
    created: Readonly<Record<string, unknown>>,
  ): Promise<boolean> {
    const current = this.level.data.current;
    if (
      !current ||
      !this.level.state.fields[field]?.editable ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        String(created.id ?? ''),
      )
    )
      return false;
    const entity =
      allSysBOMetadata[
        String(this.level.control.invocation.params['entityKey']) as keyof typeof allSysBOMetadata
      ];
    const metadata = entity?.fieldDefinition[field];
    const relation = entity ? relationshipForField(entity, field) : null;
    if (
      !metadata ||
      metadata.type !== 'reference' ||
      metadata.sensitive ||
      (relation?.relationship.references.objectKey ?? metadata.inverseRelationship?.objectKey) !==
        relatedEntityKey ||
      !Object.hasOwn(allSysBOMetadata, relatedEntityKey)
    )
      return false;
    const target = allSysBOMetadata[relatedEntityKey as keyof typeof allSysBOMetadata];
    const inverse = metadata.inverseRelationship;
    const inverseOwner = inverse
      ? allSysBOMetadata[inverse.objectKey as keyof typeof allSysBOMetadata]
      : undefined;
    const inverseRelation = inverseOwner?.relationships?.[inverse?.relationship ?? ''];
    const selection =
      relation?.relationship.selection ??
      (inverseRelation?.references.objectKey === entity.key
        ? inverseRelation.selection
        : undefined);
    const sourceFilter =
      !relation && inverseRelation?.references.objectKey === entity.key
        ? inverseRelation.sourceFilterExpression
        : undefined;
    try {
      for (const expr of [sourceFilter, selection?.filterExpression]) {
        if (
          expr &&
          evaluateExpression(expr, created, created, {
            source: 'reference-selection',
            sourcePath: `${entity.key}.${field}`,
            purpose: 'validate newly created reference',
          }) !== true
        )
          return false;
      }
      const trait = selection?.filterEnumItemTrait;
      if (trait) {
        const definition = target.fieldDefinition[trait.field];
        if (
          !definition ||
          !enumItemsForField(definition).some(
            (item) =>
              item.value === created[trait.field] &&
              (item as unknown as Record<string, unknown>)[trait.trait] === true,
          )
        )
          return false;
      }
      if (
        selection?.uniqueThrough &&
        created[selection.uniqueThrough.field] &&
        String(created[selection.uniqueThrough.field]) !== String(current.id ?? '')
      )
        return false;
      if (selection?.excludeCurrent && relatedEntityKey === entity.key && created.id === current.id)
        return false;
    } catch {
      return false;
    }
    const projected = await uiEntryProjectRecord(relatedEntityKey, created).catch(() => created);
    if (
      this.level.state.entry.switching ||
      this.level.state.entry.recoveryFailed ||
      this.level.data.current !== current ||
      !this.level.state.fields[field]?.editable
    )
      return false;
    const related = this.level.data.references[relatedEntityKey] ?? [];
    const row = { ...projected, __referenceFieldAvailability: { [field]: true } };
    this.host.publish(this.level.state, {
      ...this.level.data,
      references: {
        ...this.level.data.references,
        [relatedEntityKey]: [
          ...related.filter((candidate) => String(candidate.id) !== String(created.id)),
          row,
        ],
      },
    });
    await this.content.setField(field, created.id);
    return true;
  }
  /**
   * Native Page/Popup adapters pass one sanitized event to its mounted Field.
   * The framework dispatches Field -> Tab -> Entry; the browser
   * continues native bubbling to the Host unless the component consumes it.
   * The Surface alone commits typed Field effects into canonical #data.current.
   */
  dispatchFieldInteraction(
    field: string,
    event: UiEmbeddedInteractionEvent,
    layoutId?: string,
    tabIndex?: number,
  ): UiEmbeddedDispatchResult {
    const empty: UiEmbeddedDispatchResult = {
      handled: false,
      consumed: false,
      preventDefault: false,
      effects: [],
    };
    const entity = String(this.level.control.invocation.params['entityKey']);
    const metadata = allSysBOMetadata[entity as keyof typeof allSysBOMetadata];
    const type = metadata?.fieldDefinition[field]?.type;
    if (
      !type ||
      metadata.fieldDefinition[field]?.sensitive ||
      this.level.state.entry.recoveryFailed ||
      this.level.state.entry.switching
    )
      return empty;
    const key = `${field}\u0000${layoutId ?? ''}\u0000${tabIndex ?? ''}`;
    let path = this.fieldEventPaths.get(key);
    const matches = (definition: { readonly kind: string }, ownerPath: string): boolean => {
      const registered = definition as EntryDefinition;
      return (
        definition.kind === `field-${type}` &&
        registered.field === field &&
        (!layoutId || registered.selector.includes(`data-entry-layout-id="${layoutId}"`)) &&
        (tabIndex === undefined || ownerPath.includes(`.Tab${tabIndex}.`))
      );
    };
    const registered = path ? this.embedded.definitionAt(path) : undefined;
    if (!path || !registered || !matches(registered, path)) {
      path = this.embedded.findComponentPath(matches) ?? undefined;
      if (!path) return empty;
      this.fieldEventPaths.set(key, path);
    }
    const result = this.embedded.dispatchEvent(path, { ...event, field });
    // Multiple owners may observe the event, but only one canonical edit may
    // be committed. Reject conflicting intents instead of racing duplicate writes.
    const first = result.effects[0];
    if (first) {
      if (
        first.type !== 'set-field' ||
        !('field' in first) ||
        !('value' in first) ||
        first.field !== field ||
        result.effects.some(
          (effect) =>
            effect.type !== 'set-field' ||
            !('field' in effect) ||
            !('value' in effect) ||
            effect.field !== field ||
            !Object.is(effect.value, first.value),
        )
      )
        throw new Error(`Conflicting Field event effects: ${field}`);
      if (this.level.state.fields[field]?.editable) {
        if (type === 'reference') {
          const relation = relationshipForField(metadata, field);
          const targetKey =
            relation?.relationship.references.objectKey ??
            metadata.fieldDefinition[field]?.inverseRelationship?.objectKey;
          const candidate = targetKey
            ? this.level.data.references[targetKey]?.find(
                (row) => String(row.id ?? '').toLowerCase() === String(first.value).toLowerCase(),
              )
            : undefined;
          // A native input may not submit an arbitrary GUID or an ineligible option.
          const availability = candidate?.__referenceFieldAvailability;
          if (
            !availability ||
            typeof availability !== 'object' ||
            Array.isArray(availability) ||
            (availability as Record<string, unknown>)[field] !== true
          )
            return empty;
        }
        void this.content.setField(field, first.value);
      }
    }
    return result;
  }

  /**
   * Mounted Field Tools validate availability and interpret the action.
   * Only the Entry data owner applies mutations. Clipboard I/O stays native.
   */
  async performFieldTool(field: string, action: string): Promise<string | null> {
    const entity = String(this.level.control.invocation.params['entityKey']);
    const type =
      allSysBOMetadata[entity as keyof typeof allSysBOMetadata]?.fieldDefinition[field]?.type;
    if (!type) return null;
    const effects = this.embedded.dispatchAction(
      { type: 'action', action },
      (definition) =>
        definition.kind === `field-${type}` && (definition as EntryDefinition).field === field,
    );
    if (!effects.length) return null;
    const first = effects[0];
    if (effects.some((effect) => JSON.stringify(effect) !== JSON.stringify(first)))
      throw new Error(`Inconsistent Field Tools policy: ${field}`);
    if (!('field' in first) || first.field !== field) return null;
    if (first.type === 'field-copy' && 'text' in first && typeof first.text === 'string')
      return first.text;
    if (!this.level.state.fields[field]?.editable) return null;
    if (first.type === 'field-revert') await this.content.revertField(field);
    else if (first.type === 'field-set' && 'value' in first)
      await this.content.setField(field, first.value);
    return null;
  }

  dispose(): void {
    this.host.dispose();
  }
}
