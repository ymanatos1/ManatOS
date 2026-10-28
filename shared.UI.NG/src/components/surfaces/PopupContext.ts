import { computed, signal } from '@angular/core';

import {
  type UiPopupActionRequest,
  type UiPopupLevel,
  type UiSurfaceCloseReason,
  type UiSurfaceEventListener,
  type UiPopupSafeField,
  type UiPopupSensitiveFacts,
  UiPopupRuntime,
  createUiSurfaceInvocation,
  createUiSurfaceResult,
} from '@manatos/shared-ui';

/**
 * Angular-facing reactive handle for a shared.UI popup runtime.
 *
 * There is one instance per open popup, not one per component.
 *
 * Ownership:
 * - shared.UI owns semantic definitions, CTX and expression evaluation.
 * - This adapter translates CTX notifications into Angular signals.
 * - Descendant components share this reference and its CTX bindings.
 * - The popup owner disposes the adapter when the popup closes.
 *
 * The snapshot is copied because CTX changes may mutate existing
 * objects. Angular signals require an observable new value.
 *
 * No plaintext password is stored here: the shared runtime only
 * exposes safe projections of sensitive inputs.
 */
export class PopupContext {
  private readonly runtime: UiPopupRuntime;
  private readonly unsubscribe: () => void;
  private disposed = false;

  readonly level = signal<UiPopupLevel>(this.emptyLevel());

  readonly activeTab = computed(() => {
    const tabId = this.level().state.tab ?? this.runtime.views[0]?.id;
    const tab = this.runtime.views.find((item) => item.id === tabId);

    if (!tab) throw new Error(`Unknown popup tab: ${tabId}`);
    return tab;
  });

  tabVisible(id: string): boolean {
    // Read the signal so Angular recomputes when adapter-dependent conditions change.
    return this.level().state.visibleTabs[id] !== false;
  }

  tabEnabled(id: string): boolean {
    return this.level().state.enabledTabs[id] !== false;
  }

  tabRequired(id: string): boolean {
    return this.level().state.requiredTabs[id] === true;
  }

  tabInvalidated(id: string): boolean {
    return this.level().state.invalidatedTabs[id] === true;
  }

  acknowledgeTab(id: string): void {
    this.runtime.acknowledgeTab(id);
  }

  readonly busy = computed(() => this.level().state.busy);
  readonly notice = computed(() => this.level().state.notice);

  /**
   * Read any declared embedded resource from the popup's
   * reactive CTX snapshot.
   */
  readResource<T = unknown>(path: string): T | undefined {
    const prefix = 'data.resources.runtime.';

    if (!path.startsWith(prefix)) throw new Error(`Invalid embedded resource path: ${path}`);

    const name = path.slice(prefix.length);

    if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(name)) throw new Error('Invalid resource name.');

    return this.level().data.resources.runtime[name] as T | undefined;
  }

  /** Read the corresponding reactive resource-status projection. */
  readResourceStatus<T = unknown>(path: string): T | undefined {
    if (!path.startsWith('state.')) throw new Error(`Invalid resource status path: ${path}`);

    const name = path.slice('state.'.length);

    if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(name)) throw new Error('Invalid resource status name.');

    return (this.level().state as unknown as Record<string, unknown>)[name] as T | undefined;
  }
  constructor(runtime: UiPopupRuntime) {
    this.runtime = runtime;
    this.level.set(this.snapshot());

    this.unsubscribe = runtime.subscribe(() => {
      if (!this.disposed) this.level.set(this.snapshot());
    });
  }

  reconcileTabLayout(tabId: string): void {
    this.runtime.reconcileTabLayout(tabId);
  }

  get views() {
    return this.runtime.views;
  }

  get definition() {
    return this.runtime.definition;
  }

  get levelPath(): string {
    return this.runtime.levelPath;
  }

  /** Safe CTX field projection for rendering and evaluation. */
  field(id: string): UiPopupSafeField | undefined {
    return this.level().data.fields[id];
  }

  rule(id: string): boolean {
    return this.level().state.rules[id] === true;
  }

  actionEnabled(id: string): boolean {
    const state = this.level().state;
    return !state.busy && state.actions[id] === true;
  }

  actionVisible(id: string): boolean {
    return this.level().state.visibleActions[id] !== false;
  }

  setFieldValue(id: string, value: string, valid: boolean): void {
    this.runtime.setFieldValue(id, value, valid);
  }

  setSensitiveFacts(id: string, facts: UiPopupSensitiveFacts): void {
    this.runtime.setSensitiveFacts(id, facts);
  }

  selectTab(id: string): void {
    this.runtime.selectTab(id);
  }

  requestAction(id: string): void {
    this.runtime.requestAction(id);
  }

  commitBaseline(): void {
    this.runtime.commitBaseline();
  }

  setNotice(message: string | null): void {
    this.runtime.setNotice(message);
  }

  setBusy(value: boolean): void {
    this.runtime.setBusy(value);
  }

  /**
   * Generic resource publication delegated to shared.UI.
   * Only the owning popup host invokes these methods.
   */
  setResource(name: string, value: unknown): void {
    this.runtime.setResource(name, value);
  }

  setResourceStatus(
    name: string,
    status: 'idle' | 'loading' | 'ready' | 'error',
    error: string | null = null,
  ): void {
    this.runtime.setResourceStatus(name, status, error);
  }

  onAction(listener: (request: UiPopupActionRequest) => void): () => void {
    return this.runtime.onAction(listener);
  }

  /**
   * Dispose subscriptions first, then the owned CTX level.
   * Never invoke this from an individual nested field component.
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribe();
    this.runtime.dispose();
  }

  private snapshot(): UiPopupLevel {
    const source = this.runtime.level;

    return {
      control: {
        ...source.control,
        invocation: {
          ...source.control.invocation,
          params: { ...source.control.invocation.params },
          events: { ...source.control.invocation.events },
        },
        ...(source.control.flow
          ? { flow: { ...source.control.flow, events: { ...source.control.flow.events } } }
          : {}),
        result: { ...source.control.result },
      },
      state: {
        ...source.state,
        rules: { ...source.state.rules },
        actions: { ...source.state.actions },
        visibleActions: { ...source.state.visibleActions },
        visibleTabs: { ...source.state.visibleTabs },
        enabledTabs: { ...source.state.enabledTabs },
        requiredTabs: { ...source.state.requiredTabs },
        invalidatedTabs: { ...source.state.invalidatedTabs },
        expressionErrors: { ...source.state.expressionErrors },
      },
      layout: source.layout,
      data: {
        content: structuredClone(source.data.content),
        selection: { ...source.data.selection },
        fields: Object.fromEntries(
          Object.entries(source.data.fields).map(([id, field]) => [id, { ...field }]),
        ),
        original: source.data.original,
        current: Object.fromEntries(
          Object.entries(source.data.current).map(([id, value]) => [
            id,
            typeof value === 'string' ? value : { ...value },
          ]),
        ),
        resources: {
          runtime: { ...source.data.resources.runtime },
        },
      },
    };
  }

  /**
   * Initial signal value before the constructor attaches the runtime.
   * No CTX mutation is performed here.
   */
  private emptyLevel(): UiPopupLevel {
    return {
      control: {
        host: 'popup',
        kind: 'auth.signin',
        instanceId: '',
        invocation: createUiSurfaceInvocation(),
        result: createUiSurfaceResult(),
      },
      state: {
        tab: '',
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
      },
      layout: { title: {}, tabs: {} },
      data: {
        content: {},
        selection: { externalProviderId: null },
        fields: {},
        original: {},
        current: {},
        resources: { runtime: {} },
      },
    };
  }

  notifyShown(): void {
    this.runtime.notifyShown();
  }

  onSurfaceEvent(listener: UiSurfaceEventListener<UiPopupLevel>): () => void {
    return this.runtime.onSurfaceEvent(listener);
  }

  requestSurfaceAction(actionId: string, value: string | null = null): void {
    this.runtime.requestSurfaceAction(actionId, value);
  }

  setClosingResult(reason: UiSurfaceCloseReason, actionId: string | null = null): void {
    this.runtime.setClosingResult(reason, actionId);
  }
}
