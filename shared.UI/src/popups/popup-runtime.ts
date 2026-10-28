/**
 * UIS POPUP SURFACE — CTX/validation/action authority, not layout composer.
 *
 * Definition: popup-definition.ts (views, optional navigation, actions).
 * Composition: popups/embedded/{registry,PopupComponents}.ts.
 * State: #state.tab only when multiple views; rules/actions are derived.
 * Data: nonsecret inputs in fields/current; passwords expose safe facts only.
 * Adapters: shared.UI.NG/shared.UI.EJS render DOM and manage native focus.
 * Lifecycle: one nested #level per popup, regardless of view count.
 */
import {
  appendContextPathMember,
  ContextTreeRuntime,
  evaluateExpression,
  type ManatOSRuntimeRootContext,
} from '@manatos/shared';

import { createUiSemanticLayoutNode } from '../runtime/layout/node.js';

import { disposeUiSurfaceResources } from '../runtime/surface/lifecycle.js';

import { UiEmbeddedComponentRegistry, type UiSemanticLayoutNode } from '../runtime/component.js';
import { UiSurfaceEmbeddedRuntime } from '../runtime/surface/embedded-runtime.js';
import {
  UiSurfaceHostRuntime,
  resolveUiSurfaceParentPath,
} from '../runtime/surface/host-runtime.js';

import {
  createUiSurfaceInvocation,
  type UiSurfaceInvocation,
  type UiSurfaceOpenOptions,
} from '../runtime/surface/invocation.js';

import {
  popupViews,
  type UiPopupDefinition,
  type UiPopupFieldDefinition,
  type UiPopupTabDefinition,
} from './popup-definition.js';

import { PopupReactivity } from './popup-reactivity.js';

import { createPopupEmbeddedRegistry } from './embedded/registry.js';
import type { UiPopupRootDefinition } from './embedded/PopupRoot.js';

import {
  createUiSurfaceResult,
  type UiSurfaceResult,
  type UiSurfaceCloseReason,
} from '../runtime/surface/invocation.js';

import { UiSurfaceEvents, type UiSurfaceEventListener } from '../runtime/surface/events.js';

/** The inspectable projection; a password never has a `value` property. */
export interface UiPopupSafeField {
  readonly value?: string;
  readonly valid: boolean;
  readonly present?: boolean;
  readonly length?: number;
  readonly lengthValid?: boolean;
  readonly hasAlpha?: boolean;
  readonly hasNumber?: boolean;
  readonly hasSymbol?: boolean;
  readonly matches?: boolean;
}

export type UiPopupSensitiveFacts = Omit<UiPopupSafeField, 'value'>;

/** Plain values for ordinary inputs, safe facts only for secrets. */
export type UiPopupSnapshotValue = string | UiPopupSensitiveFacts;

export type UiPopupFieldState = UiPopupFieldDefinition &
  UiPopupSafeField & {
    readonly originalValue?: string;
  };

/** Compatibility name for the canonical semantic layout-node contract. */
export type UiPopupLayoutNode = UiSemanticLayoutNode;

export interface UiPopupLevel {
  readonly control: {
    readonly host: 'popup';
    readonly kind: string;
    readonly instanceId: string;
    readonly invocation: UiSurfaceInvocation;
    readonly flow?: UiSurfaceOpenOptions['flow'];
    readonly result: UiSurfaceResult;
  };

  readonly state: {
    tab?: string;
    busy: boolean;
    notice: string | null;
    rules: Record<string, boolean>;
    actions: Record<string, boolean>;
    visibleActions: Record<string, boolean>;
    visibleTabs: Record<string, boolean>;
    enabledTabs: Record<string, boolean>;
    requiredTabs: Record<string, boolean>;
    invalidatedTabs: Record<string, boolean>;
    expressionErrors: Record<string, string>;
    [resourceStatus: string]: unknown;
  };

  readonly layout: {
    readonly title: UiPopupLayoutNode;
    readonly tabs?: Readonly<Record<string, UiPopupLayoutNode>>;
    readonly content?: UiPopupLayoutNode;
    readonly actions?: UiPopupLayoutNode;
  };

  readonly data: {
    /** Read-only presentation/input projection supplied at invocation. */
    readonly content: Readonly<Record<string, unknown>>;

    /** Canonical field metadata and live state, as in EJS0 entry forms. */
    readonly fields: Record<string, UiPopupFieldState>;

    /** Immutable initial snapshots; sensitive fields contain safe facts only. */
    readonly original: Readonly<Record<string, UiPopupSnapshotValue>>;

    /** Synchronized inspection snapshots, NOT a second writable authority. */
    readonly current: Record<string, UiPopupSnapshotValue>;

    readonly resources: {
      readonly runtime: Record<string, unknown>;
    };
    /** Ordinary, inspectable selection. Never includes OAuth tokens. */
    readonly selection: { readonly externalProviderId: string | null };
  };
}

export interface UiPopupActionRequest {
  readonly popupId: string;
  readonly actionId: string;
  readonly activeTab: string;
}

export type UiPopupActionListener = (request: UiPopupActionRequest) => void;

let nextPopupInstance = 0;

/**
 * Popup-specific adapter for the common semantic node factory.
 *
 * Existing popup renderer references and DOM selectors remain
 * identical. The common factory does not know about popups.
 */
function layoutNode(
  kind: string,
  id: string,
  selector: string,
  children: Record<string, UiPopupLayoutNode> = {},
  field?: string,
  traverseChildren = false,
): UiPopupLayoutNode {
  return createUiSemanticLayoutNode(
    kind,
    id,
    `popup:${id}`,
    selector,
    children,
    field,
    traverseChildren,
  );
}

const byId = (id: string): string => `[data-popup-layout-id="${id}"]`;

function safeInitial(field: UiPopupFieldDefinition): UiPopupSafeField {
  return field.sensitive
    ? {
        valid: false,
        present: false,
        length: 0,
        lengthValid: false,
        hasAlpha: false,
        hasNumber: false,
        hasSymbol: false,
        matches: false,
      }
    : { value: '', valid: false };
}

function sameFacts(a: UiPopupSafeField, b: UiPopupSafeField): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);

  return [...keys].every((key) =>
    Object.is(
      (a as unknown as Record<string, unknown>)[key],
      (b as unknown as Record<string, unknown>)[key],
    ),
  );
}

/**
 * One shared semantic/CTX owner per popup, regardless of hidden-tab count.
 * #control, #state, #layout, #data are created in that exact insertion order.
 *
 * #data.fields is the canonical input state. #data.current is an observable,
 * read-only-to-consumers inspection mirror; #data.original is the saved baseline.
 * Compiled, dependency-aware rules are owned by PopupReactivity.
 */
export class UiPopupRuntime {
  readonly definition: UiPopupDefinition;
  /** Effective views; only multi-view popups opt into PopupTabs. */
  readonly views: readonly UiPopupTabDefinition[];
  readonly hasTabs: boolean;
  readonly instanceId: string;
  readonly levelPath: string;

  private readonly surfaceEvents: UiSurfaceEvents<UiPopupLevel>;
  private disposing = false;
  private shown = false;

  private readonly fields: ReadonlyMap<string, UiPopupFieldDefinition>;
  private readonly invalidationTargets: ReadonlyMap<string, readonly string[]>;
  private readonly actionListeners = new Set<UiPopupActionListener>();
  private readonly reactivity!: PopupReactivity;
  private unsubscribeTabState: (() => void) | null = null;
  private reconcilingTab = false;
  private readonly embeddedRuntime!: UiSurfaceEmbeddedRuntime;
  private assemblingLevel: UiPopupLevel | null = null;
  private disposed = false;
  private readonly surfaceHost!: UiSurfaceHostRuntime<UiPopupLevel>;

  constructor(
    private readonly context: ContextTreeRuntime<ManatOSRuntimeRootContext>,
    definition: UiPopupDefinition,
    parentLevelPath: string | null = null,
    invocation: UiSurfaceOpenOptions = {},
    private readonly registry: UiEmbeddedComponentRegistry = createPopupEmbeddedRegistry(),
  ) {
    // Reject malformed navigation before publishing any popup CTX.
    const views = popupViews(definition);
    const hasTabs = views.length > 1;
    const tabIds = new Set(views.map((tab) => tab.id));
    if (
      tabIds.size !== views.length ||
      (hasTabs && !tabIds.has(definition.initialTab ?? '')) ||
      (!hasTabs && definition.initialTab !== undefined && definition.initialTab !== views[0]?.id)
    )
      throw new Error('Popup has invalid tab identities or initial selection.');
    for (const route of definition.navigation ?? [])
      if (!tabIds.has(route.from) || !tabIds.has(route.to) || !route.actionId)
        throw new Error('Popup declares an invalid navigation route.');
    this.definition = definition;
    this.views = views;
    this.hasTabs = hasTabs;
    this.instanceId = `popup-${++nextPopupInstance}`;

    this.fields = new Map(definition.fields.map((field) => [field.id, field]));
    const invalidationTargets = new Map<string, string[]>();
    for (const tab of views) {
      for (const fieldId of tab.invalidateOn ?? []) {
        if (!this.fields.has(fieldId)) {
          throw new Error(`Tab '${tab.id}' invalidates undeclared field '${fieldId}'.`);
        }
        invalidationTargets.set(fieldId, [...(invalidationTargets.get(fieldId) ?? []), tab.id]);
      }
    }
    this.invalidationTargets = invalidationTargets;

    // Follow the canonical EJS0 surface chain:
    // ctx.ui.level.level...
    //
    // The caller may specify the owning surface. Otherwise, the
    // current deepest surface is the parent, or ctx.ui if none exists.
    const parentPath = resolveUiSurfaceParentPath(this.context, parentLevelPath);
    const surfaceInvocation = createUiSurfaceInvocation(invocation);
    this.levelPath = appendContextPathMember(parentPath, 'level');

    this.surfaceEvents = new UiSurfaceEvents(this.levelPath, () => this.level);

    const fields: Record<string, UiPopupFieldState> = {};
    const original: Record<string, UiPopupSnapshotValue> = {};
    const current: Record<string, UiPopupSnapshotValue> = {};

    for (const definition of this.definition.fields) {
      const initial = safeInitial(definition);

      fields[definition.id] = {
        ...definition,
        ...(!definition.sensitive ? { originalValue: '' } : {}),
        ...initial,
      };

      original[definition.id] = definition.sensitive ? Object.freeze({ ...initial }) : '';

      current[definition.id] = definition.sensitive ? { ...initial } : '';
    }

    // Root composition supplies title, optional tabs and standalone content.
    // Keep the same layout object so Host publication preserves CTX identity.
    const popupLayout = {} as {
      title: UiPopupLayoutNode;
      tabs?: Record<string, UiPopupLayoutNode>;
      content?: UiPopupLayoutNode;
      actions?: UiPopupLayoutNode;
    };

    const level: UiPopupLevel = {
      control: {
        host: 'popup',
        kind: definition.id,
        instanceId: this.instanceId,
        invocation: surfaceInvocation,
        ...(invocation.flow
          ? { flow: { ...invocation.flow, events: { ...invocation.flow.events } } }
          : {}),
        result: createUiSurfaceResult(),
      },
      state: {
        // No mutable tab state for a standalone popup.
        ...(hasTabs ? { tab: definition.initialTab } : {}),
        busy: false,
        notice: null,
        rules: {},
        actions: {},
        visibleActions: {},
        visibleTabs: {},
        enabledTabs: {},
        requiredTabs: {},
        invalidatedTabs: {},
        expressionErrors: {},
        embeddedErrors: {},
      },
      layout: popupLayout,
      data: {
        content: structuredClone(surfaceInvocation.params),
        selection: { externalProviderId: null },
        fields,
        original: Object.freeze(original),
        current,
        resources: {
          runtime: {},
        },
      },
    };

    // Treat publication, subscription setup and initialization as one transaction.
    // The parent #level is never removed on failure, only this instance's child.
    this.assemblingLevel = level;
    let surfaceHost: UiSurfaceHostRuntime<UiPopupLevel> | undefined;
    let reactivity: PopupReactivity | undefined;
    try {
      this.embeddedRuntime = new UiSurfaceEmbeddedRuntime(
        this.context,
        this.levelPath,
        this.registry,
        {
          name: this.instanceId,
          draft: () =>
            this.assemblingLevel as unknown as {
              state: Record<string, unknown>;
              data: Record<string, unknown>;
            } | null,
          errorsPath: 'state.embeddedErrors',
          node: (kind, id, elementId, field) => layoutNode(kind, id, byId(elementId), {}, field),
          componentNode: (item) =>
            layoutNode('component', item.id, byId(item.id), {}, undefined, true),
          tabId: (path) => this.tabIdFromLayoutPath(path),
        },
      );
      // The host initiates exactly one main component. The framework then
      // recursively invokes every owning child without popup-kind branches.
      this.embeddedRuntime.mountRoot(
        {
          id: 'layout',
          kind: 'popup-root',
          views,
          actions: definition.actions,
          titleTools: [
            ...(definition.showLanguageSelection ? ['language' as const] : []),
            ...(definition.allowFontScale ? ['fontScale' as const] : []),
            ...(definition.allowDebugger ? ['debugger' as const] : []),
            ...(definition.allowDebugger && invocation.flow?.stepPath
              ? ['flowDebugger' as const]
              : []),
            ...(surfaceInvocation.allowXClosure ? ['close' as const] : []),
          ],
        } as UiPopupRootDefinition,
        popupLayout,
      );

      // Register before publishing so synchronous observers see semantic roles.
      // Embedded #layout nodes retain their own non-enumerable descriptors.
      surfaceHost = new UiSurfaceHostRuntime(this.context, parentPath, level);
      this.surfaceHost = surfaceHost;

      reactivity = new PopupReactivity(this.context, this.levelPath, definition);
      this.embeddedRuntime.attach();
      this.reactivity = reactivity;
      // A reactive expression can hide/disable the active view while it is open.
      // Reconcile selection without replacing this popup or its CTX level.
      this.unsubscribeTabState = this.context.subscribe(() => this.reconcileActiveTab(), {
        path: `${this.levelPath}.state`,
        recursive: true,
        async: false,
        label: `${this.instanceId}:popup-tabs`,
      });
      this.reconcileActiveTab();
    } catch (error) {
      // Rollback steps are independent: cleanup failures must not mask construction error.
      try {
        this.unsubscribeTabState?.();
        reactivity?.dispose();
      } catch {
        /* preserve construction error */
      }
      try {
        this.embeddedRuntime?.dispose();
      } catch {
        /* preserve construction error */
      }
      try {
        surfaceHost?.dispose();
      } catch {
        /* preserve construction error */
      }
      throw error;
    } finally {
      this.assemblingLevel = null;
    }
  }

  get level(): UiPopupLevel {
    this.ensureActive();
    return this.surfaceHost.level;
  }

  get activeTab(): UiPopupTabDefinition {
    const id = this.level.state.tab ?? this.views[0]?.id;
    const tab = this.views.find((item) => item.id === id);

    if (!tab) throw new Error(`Unknown popup tab: ${id}`);
    return tab;
  }

  read(path: string): unknown {
    this.ensureActive();
    return this.context.get(`${this.levelPath}.${path}`);
  }

  /** Mutate exactly one ordinary field and its read-only-to-consumers mirror. */
  setFieldValue(fieldId: string, value: string, valid: boolean): void {
    this.ensureActive();

    if (this.requireField(fieldId).sensitive)
      throw new Error(`Sensitive field '${fieldId}' cannot store raw values in CTX.`);

    const previous = this.level.data.fields[fieldId];

    if (!previous) throw new Error(`Unknown popup field: ${fieldId}`);

    const next: UiPopupFieldState = {
      ...previous,
      value,
      valid,
    };

    if (previous.value === value && previous.valid === valid) return;

    // The runtime alone publishes both canonical input and its read-only
    // inspection mirror. A separate notification for current is necessary for
    // existing expressions that explicitly depend on #data.current.<field>.
    this.context.set(appendContextPathMember(`${this.levelPath}.data.current`, fieldId), value);
    this.context.set(appendContextPathMember(`${this.levelPath}.data.fields`, fieldId), next);
    if (previous.value !== value) this.invalidateTabsForField(fieldId);
  }

  /** Promote sanitized current values to the persisted baseline after a successful save. */
  commitBaseline(): void {
    this.ensureActive();
    const next: Record<string, UiPopupSnapshotValue> = {};
    for (const field of this.definition.fields) {
      const value = this.level.data.current[field.id];
      next[field.id] = typeof value === 'string' ? value : { ...(value ?? { valid: false }) };
      if (!field.sensitive) {
        const previous = this.level.data.fields[field.id];
        this.context.set(appendContextPathMember(`${this.levelPath}.data.fields`, field.id), {
          ...previous,
          originalValue: typeof value === 'string' ? value : '',
        });
      }
    }
    this.context.set(`${this.levelPath}.data.original`, Object.freeze(next));
    // A successful persistence boundary (or initial server hydration) is the
    // new baseline, so no tab has pending input-based invalidation.
    if (Object.keys(this.level.state.invalidatedTabs).length) {
      this.context.set(`${this.levelPath}.state.invalidatedTabs`, {});
    }
  }

  /** Accept only an explicit allow-list of safe password facts. */
  setSensitiveFacts(fieldId: string, facts: UiPopupSensitiveFacts): void {
    this.ensureActive();

    if (!this.requireField(fieldId).sensitive)
      throw new Error(`Field '${fieldId}' is not sensitive.`);

    if (Object.prototype.hasOwnProperty.call(facts, 'value'))
      throw new Error('Sensitive CTX projections cannot contain values.');

    const projection: UiPopupSensitiveFacts = {
      valid: facts.valid === true,
      present: facts.present === true,
      length: facts.length ?? 0,
      lengthValid: facts.lengthValid === true,
      hasAlpha: facts.hasAlpha === true,
      hasNumber: facts.hasNumber === true,
      hasSymbol: facts.hasSymbol === true,
      matches: facts.matches === true,
    };

    const previous = this.level.data.fields[fieldId];

    if (!previous) throw new Error(`Unknown popup field: ${fieldId}`);

    if (
      sameFacts(
        {
          valid: previous.valid,
          present: previous.present,
          length: previous.length,
          lengthValid: previous.lengthValid,
          hasAlpha: previous.hasAlpha,
          hasNumber: previous.hasNumber,
          hasSymbol: previous.hasSymbol,
          matches: previous.matches,
        },
        projection,
      )
    )
      return;

    // Only allow-listed facts reach either CTX projection.
    // Prepare the safe current snapshot before notifying observers.
    this.context.set(appendContextPathMember(`${this.levelPath}.data.current`, fieldId), {
      ...projection,
    });
    this.context.set(appendContextPathMember(`${this.levelPath}.data.fields`, fieldId), {
      ...previous,
      ...projection,
    });
    // Only the public presence/validation facts can invalidate generic policy;
    // the raw secret remains exclusively in its feature-owned private draft.
    this.invalidateTabsForField(fieldId);
  }

  /** Visibility and accessibility are independent; both default true for static popups. */
  tabVisible(tabId: string): boolean {
    return (
      this.views.some((tab) => tab.id === tabId) && this.level.state.visibleTabs[tabId] !== false
    );
  }

  tabEnabled(tabId: string): boolean {
    return (
      this.views.some((tab) => tab.id === tabId) && this.level.state.enabledTabs[tabId] !== false
    );
  }

  tabRequired(tabId: string): boolean {
    return (
      this.views.some((tab) => tab.id === tabId) && this.level.state.requiredTabs[tabId] === true
    );
  }

  tabInvalidated(tabId: string): boolean {
    return this.level.state.invalidatedTabs[tabId] === true;
  }

  /** The feature controller acknowledges new evidence after an API operation succeeds. */
  acknowledgeTab(tabId: string): void {
    this.ensureActive();
    if (!this.views.some((tab) => tab.id === tabId)) {
      throw new Error(`Unknown popup tab: ${tabId}`);
    }
    if (this.tabInvalidated(tabId)) {
      this.context.set(`${this.levelPath}.state.invalidatedTabs.${tabId}`, false);
    }
  }

  private invalidateTabsForField(fieldId: string): void {
    for (const tabId of this.invalidationTargets.get(fieldId) ?? []) {
      if (!this.tabInvalidated(tabId)) {
        this.context.set(`${this.levelPath}.state.invalidatedTabs.${tabId}`, true);
      }
    }
  }

  canSelectTab(tabId: string): boolean {
    return this.tabVisible(tabId) && this.tabEnabled(tabId);
  }

  private reconcileActiveTab(): void {
    if (this.reconcilingTab || this.disposing || this.disposed || !this.hasTabs) return;
    if (this.canSelectTab(this.level.state.tab ?? '')) return;
    const fallback = this.views.find((tab) => this.canSelectTab(tab.id));
    if (!fallback) return;
    this.reconcilingTab = true;
    try {
      this.context.set(`${this.levelPath}.state.tab`, fallback.id);
    } finally {
      this.reconcilingTab = false;
    }
  }

  selectTab(tabId: string): void {
    this.ensureActive();

    if (!this.views.some((tab) => tab.id === tabId)) {
      throw new Error(`Unknown popup tab: ${tabId}`);
    }
    if (!this.canSelectTab(tabId)) return;

    // No artificial mutable selection exists for a single-view popup.
    if (!this.hasTabs) return;
    if (this.level.state.tab !== tabId) this.context.set(`${this.levelPath}.state.tab`, tabId);
  }

  /**
   * Reconcile the activated tab using each embedded component's original
   * populateLayout implementation, retaining compatible existing CTX nodes.
   * Missing children are published via the canonical CTX mutation API.
   * Never create duplicate component instances or subscriptions.
   */
  reconcileTabLayout(tabId: string): void {
    this.ensureActive();
    if (!this.views.some((tab) => tab.id === tabId)) throw new Error(`Unknown popup tab: ${tabId}`);

    const tabPath = this.hasTabs
      ? appendContextPathMember(`${this.levelPath}.layout.tabs`, tabId)
      : `${this.levelPath}.layout.content`;
    this.embeddedRuntime.reconcile(`${tabPath}.`);
  }

  setBusy(busy: boolean): void {
    this.ensureActive();

    if (this.level.state.busy !== busy) this.context.set(`${this.levelPath}.state.busy`, busy);
  }

  setNotice(notice: string | null): void {
    this.ensureActive();

    if (this.level.state.notice !== notice)
      this.context.set(`${this.levelPath}.state.notice`, notice);
  }

  /**
   * Generic host-owned resource publication.
   *
   * Embedded components never load their own resources.
   * Only resources declared by the registry can be updated.
   */
  setResource(name: string, value: unknown): void {
    this.ensureActive();
    this.embeddedRuntime.setResource(name, value);
  }

  setResourceStatus(
    name: string,
    status: 'idle' | 'loading' | 'ready' | 'error',
    error: string | null = null,
  ): void {
    this.ensureActive();
    this.embeddedRuntime.setResourceStatus(name, status, error);
  }

  /** Resolve component scope under either optional tabs or standalone content. */
  private tabIdFromLayoutPath(path: string): string {
    if (
      !this.hasTabs &&
      (path === `${this.levelPath}.layout.content` ||
        path.startsWith(`${this.levelPath}.layout.content.`) ||
        path.startsWith(`${this.levelPath}.layout.content[`))
    )
      return this.views[0]!.id;
    const matches = this.views.filter(
      (tab) =>
        path === appendContextPathMember(`${this.levelPath}.layout.tabs`, tab.id) ||
        path.startsWith(appendContextPathMember(`${this.levelPath}.layout.tabs`, tab.id) + '.') ||
        path.startsWith(appendContextPathMember(`${this.levelPath}.layout.tabs`, tab.id) + '['),
    );
    if (matches.length !== 1) {
      // Title tools are nested components outside the optional content tabs.
      // They receive no tab scope and must work in both standalone and tabbed popups.
      if (
        path === `${this.levelPath}.layout` ||
        path === `${this.levelPath}.layout.title` ||
        path.startsWith(`${this.levelPath}.layout.title.`) ||
        path === `${this.levelPath}.layout.actions` ||
        path.startsWith(`${this.levelPath}.layout.actions.`) ||
        path === `${this.levelPath}.layout.tabs`
      )
        return '';
      throw new Error(`Embedded layout is not within a declared tab: ${path}`);
    }
    return matches[0].id;
  }

  subscribe(listener: () => void): () => void {
    this.ensureActive();

    return this.context.subscribe(listener, {
      path: this.levelPath,
      recursive: true,
      label: `${this.instanceId}:popup-renderer`,
    });
  }

  onAction(listener: UiPopupActionListener): () => void {
    this.ensureActive();
    this.actionListeners.add(listener);

    return () => this.actionListeners.delete(listener);
  }

  requestAction(actionId: string): void {
    this.ensureActive();

    // Content-triggered navigation is explicitly declared by the popup owner.
    // Generic runtime code must never recognize Auth-specific action names.
    const navigation = this.definition.navigation?.find(
      (route) => route.from === this.activeTab.id && route.actionId === actionId,
    );
    if (navigation) {
      if (!this.level.state.busy && this.canSelectTab(navigation.to)) this.selectTab(navigation.to);
      return;
    }

    const action = (this.definition.actions ?? this.activeTab.actions).find(
      (candidate) => candidate.id === actionId,
    );

    if (!action) throw new Error(`Action '${actionId}' is not available on this tab.`);

    if (this.level.state.busy || this.level.state.actions[action.id] !== true) return;

    if (action.visibleWhen && !this.evaluateBoolean(action.visibleWhen)) return;

    // The mounted Actions component owns the action declaration and its intent.
    // The Surface checks availability and executes the resulting workflow.
    const actionsPath = this.definition.actions
      ? `${this.levelPath}.layout.actions`
      : this.hasTabs
        ? `${appendContextPathMember(`${this.levelPath}.layout.tabs`, this.activeTab.id)}.actions`
        : `${this.levelPath}.layout.content.actions`;
    const intent = this.embeddedRuntime.componentAt(actionsPath)?.handleAction?.({
      type: 'action',
      action: actionId,
    });
    if (!intent || intent.type !== 'popup-action' || !('actionId' in intent))
      throw new Error(`Unowned Popup action: ${actionId}`);
    if ('targetTab' in intent && typeof intent.targetTab === 'string') {
      this.selectTab(intent.targetTab);
      return;
    }

    this.setResult('action', actionId);

    const eventName =
      this.level.control.flow?.events[actionId] ?? this.level.control.invocation.events[actionId];

    if (eventName) {
      this.surfaceEvents.emit(eventName);
    }

    // A synchronous caller event may have closed this surface.
    if (this.disposing || this.disposed) return;

    const request: UiPopupActionRequest = {
      popupId: this.definition.id,
      actionId,
      activeTab: this.activeTab.id,
    };

    for (const listener of this.actionListeners) listener(request);
  }

  /** Clear CTX and all observers when the owning popup closes. */
  dispose(): void {
    if (this.disposed || this.disposing) return;

    if (this.surfaceHost.hasChild())
      throw new Error(`Cannot dispose ${this.levelPath} while its child surface remains open.`);

    this.disposing = true;

    try {
      disposeUiSurfaceResources([
        // CTX remains alive during this event, including #control.result
        // and #data. Any listener failure must not prevent cleanup.
        () => {
          const reason = this.level.control.result.reason;

          if (reason === null || reason === 'action') {
            this.setResult('host');
          }

          this.surfaceEvents.emit('disposing');
        },
        () => {
          this.disposed = true;
        },
        () => this.unsubscribeTabState?.(),
        () => this.embeddedRuntime.dispose(),
        () => this.reactivity.dispose(),
        () => this.surfaceHost.dispose(),
      ]);
    } finally {
      this.disposed = true;
      this.actionListeners.clear();
      this.surfaceEvents.clear();
    }
  }

  private evaluateBoolean(expression: string): boolean {
    try {
      return (
        evaluateExpression(expression, this.context.root(), this.level, {
          source: 'renderer',
          sourcePath: this.levelPath,
          purpose: 'Popup action visibility',
        }) === true
      );
    } catch {
      return false;
    }
  }

  private requireField(id: string): UiPopupFieldDefinition {
    const field = this.fields.get(id);

    if (!field) throw new Error(`Unknown popup field: ${id}`);

    return field;
  }

  private ensureActive(): void {
    if (this.disposed) throw new Error('Popup runtime is disposed.');
  }

  /** Emitted exactly once by the presentation manager, after rendering. */
  notifyShown(): void {
    this.ensureActive();
    if (this.shown || this.disposing) return;
    this.shown = true;
    this.surfaceEvents.emit('shown');
  }

  onSurfaceEvent(listener: UiSurfaceEventListener<UiPopupLevel>): () => void {
    this.ensureActive();
    return this.surfaceEvents.subscribe(listener);
  }

  /** Publish a semantic result through CTX, not a parallel event DTO. */
  private setResult(
    reason: UiSurfaceResult['reason'],
    actionId: string | null = null,
    value: string | null = null,
  ): void {
    this.context.set(`${this.levelPath}.control.result`, {
      reason,
      actionId,
      value,
    } satisfies UiSurfaceResult);
  }

  /**
   * External providers and other embedded controls can request
   * caller-defined events without being popup-footer actions.
   */
  requestSurfaceAction(actionId: string, value: string | null = null): void {
    this.ensureActive();
    if (this.disposing || this.level.state.busy) return;

    const name =
      this.level.control.flow?.events[actionId] ?? this.level.control.invocation.events[actionId];
    if (!name) return;

    if (actionId === 'externalProvider') {
      this.context.set(this.levelPath + '.data.selection.externalProviderId', value);
    }
    this.setResult('action', actionId, value);
    this.surfaceEvents.emit(name);
  }

  /** Record the closure reason before the host destroys the surface. */
  setClosingResult(reason: UiSurfaceCloseReason, actionId: string | null = null): void {
    this.ensureActive();
    if (this.disposing) return;
    this.setResult(reason, actionId);
  }
}
