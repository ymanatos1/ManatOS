/**
 * UIS COMPONENT ORCHESTRATOR — per-Surface instance and resource ownership.
 *
 * mount: create/bind/populate before #level publication; rollback on failure.
 * attach: one observer for dependency-scoped component notifications.
 * reconcile: reuse mounted instances; never duplicate component subscriptions.
 * dispatch: component interprets control input; Surface applies returned intent.
 * dispose: unsubscribe then release components child-before-parent.
 *
 * See: runtime/component.ts (contracts), layout/writer.ts (scoped writes),
 * runtime/surface/host-runtime.ts (parent #level and publication).
 */
import {
  ContextTreeRuntime,
  appendContextPathMember,
  reactiveDependencyMatchesChange,
  tokenizeContextPath,
  type ManatOSRuntimeRootContext,
} from '@manatos/shared';
import {
  UiEmbeddedComponentRegistry,
  type UiEmbeddedComponent,
  type UiEmbeddedLayoutWriter,
  type UiEmbeddedRegistration,
  type UiEmbeddedActionEvent,
  type UiEmbeddedEffect,
  type UiEmbeddedInteractionEvent,
  type UiEmbeddedDispatchResult,
  type UiEmbeddedServiceResolver,
  type UiComponentServiceToken,
  type UiSemanticContentDefinition,
  type UiSemanticLayoutNode,
} from '../component.js';
import { createUiSemanticLayoutWriter } from '../layout/writer.js';
import { appendUiSemanticLayoutPath } from '../layout/path.js';
import {
  emitUiComponentSourceTrace,
  isUiComponentSourceTracingEnabled,
  type UiComponentSourceTracePhase,
} from '../source-trace.js';

interface EmbeddedInstance {
  readonly definition: UiSemanticContentDefinition;
  readonly component: UiEmbeddedComponent;
  readonly dataPath: string;
  readonly statusPath: string | null;
  readonly layoutPath: string;
  /** Stable direct registered owner; semantic ancestry, not DOM ancestry. */
  readonly parentLayoutPath: string | null;
  readonly writer: UiEmbeddedLayoutWriter;
  /** Inherited services may be shadowed only within this component's subtree. */
  readonly services: UiEmbeddedServiceResolver;
  attached: boolean;
}

export interface UiEmbeddedSurfaceLevel {
  readonly state: Record<string, unknown>;
  readonly data: Record<string, unknown>;
}

/** Surface adapters own their DOM selector conventions; this runtime never accesses the DOM. */
export interface UiSurfaceEmbeddedOptions {
  readonly node: (
    kind: string,
    id: string,
    selector: string,
    field?: string,
  ) => UiSemanticLayoutNode;
  readonly componentNode: (definition: UiSemanticContentDefinition) => UiSemanticLayoutNode;
  /** A draft level is available while the Host constructs its unpublished CTX #level. */
  readonly draft: () => UiEmbeddedSurfaceLevel | null;
  readonly tabId?: (layoutPath: string) => string;
  readonly errorsPath?: string;
  /** Optional Host capabilities; components may override them for descendants. */
  readonly services?: ReadonlyMap<symbol, unknown>;
  readonly name: string;
}

/**
 * One framework-neutral component lifecycle for Page and Popup surfaces.
 *
 * The Host owns #level publication. Registered components own their own #layout
 * children. The manager owns restricted bindings, nesting, reconciliation,
 * subscriptions, resource declarations, rollback, diagnostics, and disposal.
 */
export class UiSurfaceEmbeddedRuntime {
  private readonly instances: EmbeddedInstance[] = [];
  /** Constant-time ownership lookup; a temporary replacement may shadow an old path. */
  private readonly byPath = new Map<string, EmbeddedInstance>();
  private readonly resourceStatusPaths = new Map<string, string>();
  private unsubscribe: (() => void) | null = null;
  private disposed = false;

  constructor(
    private readonly context: ContextTreeRuntime<ManatOSRuntimeRootContext>,
    readonly levelPath: string,
    private readonly registry: UiEmbeddedComponentRegistry,
    private readonly options: UiSurfaceEmbeddedOptions,
  ) {}

  /** Source-debugging hook: structural facts only; NEVER emit CTX or control values. */
  private trace(
    instance: EmbeddedInstance,
    phase: UiComponentSourceTracePhase,
    event?: {
      readonly type: string;
      readonly handled?: boolean;
      readonly consumed?: boolean;
      readonly preventDefault?: boolean;
    },
  ): void {
    if (!isUiComponentSourceTracingEnabled()) return;
    emitUiComponentSourceTrace({
      phase,
      surfacePath: this.levelPath,
      layoutPath: instance.layoutPath,
      parentLayoutPath: instance.parentLayoutPath,
      componentKind: instance.definition.kind,
      componentId: instance.definition.id,
      ...(event
        ? {
            eventType: event.type,
            handled: event.handled ?? false,
            consumed: event.consumed ?? false,
            preventDefault: event.preventDefault ?? false,
          }
        : {}),
    });
  }

  /** The Host initiates a single root; its owner composes the entire subtree. */
  mountRoot(
    definition: UiSemanticContentDefinition,
    layout: UiSemanticLayoutNode,
  ): UiSemanticLayoutNode {
    if (!this.options.draft()) throw new Error('Cannot mount a root after Surface publication.');
    if (this.byPath.has(`${this.levelPath}.layout`))
      throw new Error('Surface already has a main component.');
    return this.mount(definition, `${this.levelPath}.layout`, layout);
  }

  /** Mounts an explicit registered definition. There are no kind-specific branches. */
  mount(
    definition: UiSemanticContentDefinition,
    layoutPath: string,
    rootLayout?: UiSemanticLayoutNode,
  ): UiSemanticLayoutNode {
    this.ensureActive();
    if (
      !layoutPath.startsWith(`${this.levelPath}.layout.`) &&
      !(rootLayout && layoutPath === `${this.levelPath}.layout`)
    )
      throw new Error('Embedded component path escapes its Surface layout.');
    const begin = this.instances.length;
    const entry = this.registry.get(definition.kind);
    if (!entry) throw new Error(`Unregistered embedded component: ${definition.kind}`);
    this.initializeResource(entry);
    let component: UiEmbeddedComponent | null = null;
    let finishInitial: (() => void) | null = null;
    try {
      component = entry.create(definition);
      const dataMember =
        typeof entry.dataPath === 'function' ? entry.dataPath(definition) : entry.dataPath;
      const statusMember =
        typeof entry.statusPath === 'function' ? entry.statusPath(definition) : entry.statusPath;
      const dataPath = this.bindingPath(dataMember);
      const statusPath = statusMember
        ? this.bindingPath(statusMember)
        : entry.resource
          ? this.bindingPath(`state.${entry.resource.name}`)
          : null;
      // Only the Surface Host may supply the existing root draft. Descendants
      // always receive fresh nodes created by their registered declarations.
      const node =
        rootLayout ?? component.createLayoutNode?.() ?? this.options.componentNode(definition);
      const session = this.writer(layoutPath, node);
      finishInitial = session.finishInitial;
      const managedWriter = this.managedWriter(layoutPath, session.writer);
      // Register the parent BEFORE populating descendants. A reverse traversal
      // can then always dispose the children before their owning parent.
      const ancestor = this.nearestAncestor(layoutPath);
      const inherited = ancestor?.services;
      const hostServices = this.options.services;
      const parentLayoutPath = ancestor?.layoutPath ?? null;
      const resolver: UiEmbeddedServiceResolver = {
        resolve: <T>(token: UiComponentServiceToken<T>): T | undefined =>
          inherited?.resolve(token) ?? (hostServices?.get(token.id) as T | undefined),
      };
      component.bindContext({
        dataPath,
        statusPath,
        layoutPath,
        parentLayoutPath,
        services: resolver,
        ...(this.options.tabId ? { tabId: this.options.tabId(layoutPath) } : {}),
        readData: <T = unknown>(): T | undefined => this.read<T>(dataPath),
        readStatus: <T = unknown>(): T | undefined =>
          statusPath ? this.read<T>(statusPath) : undefined,
      });
      const supplied = component.provideServices?.();
      // Freeze the capability membership at mount time. Providers remain free
      // to own their service objects, but not to alter another child's DI graph.
      const ownServices = supplied ? new Map(supplied) : null;
      const services: UiEmbeddedServiceResolver = ownServices
        ? {
            resolve: <T>(token: UiComponentServiceToken<T>): T | undefined =>
              (ownServices.has(token.id) ? ownServices.get(token.id) : resolver.resolve(token)) as
                T | undefined,
          }
        : resolver;
      const mounted: EmbeddedInstance = {
        definition,
        component,
        dataPath,
        statusPath,
        layoutPath,
        parentLayoutPath,
        writer: managedWriter,
        services,
        attached: false,
      };
      this.instances.push(mounted);
      this.byPath.set(layoutPath, mounted);
      this.trace(mounted, 'mount');
      component.populateLayout(node, managedWriter);
      this.trace(mounted, 'layout');
      return node;
    } catch (error) {
      // A failed parent may have mounted several descendants. Roll back all
      // of them, including instances created before an invalid binding failed.
      const created = this.instances.splice(begin);
      for (const child of created.reverse()) {
        if (this.byPath.get(child.layoutPath) === child) this.byPath.delete(child.layoutPath);
        this.trace(child, 'rollback');
        try {
          child.component.dispose?.();
        } catch {
          /* preserve initial error */
        }
      }
      if (component && !created.some((entry) => entry.component === component)) {
        try {
          component.dispose?.();
        } catch {
          /* preserve initial error */
        }
      }
      throw error;
    } finally {
      finishInitial?.();
    }
  }

  /**
   * Resolve an explicitly registered target; caller may memoize the returned
   * path, and componentAt() checks that it remains mounted after reconciliation.
   * Selection policy belongs to the Surface, never to this generic framework.
   */
  findComponentPath(
    matches: (definition: UiSemanticContentDefinition, path: string) => boolean,
  ): string | null {
    this.ensureActive();
    return (
      this.instances.find((item) => matches(item.definition, item.layoutPath))?.layoutPath ?? null
    );
  }

  /** Read-only identity of the LIVE registered owner; detects replaced paths. */
  definitionAt(layoutPath: string): UiSemanticContentDefinition | undefined {
    if (this.disposed) return undefined;
    return this.byPath.get(layoutPath)?.definition;
  }

  /** Lookup a mounted semantic child; the owning component retains its prepared behavior. */
  componentAt<T extends UiEmbeddedComponent>(layoutPath: string): T | undefined {
    if (this.disposed) return undefined;
    return this.byPath.get(layoutPath)?.component as T | undefined;
  }

  /**
   * Direct O(nesting-depth) semantic event routing. The native adapter resolves
   * the registered target once; parents are found through their owning paths.
   * The host receives the result and runs its own handler only if !consumed.
   * preventDefault is returned to the adapter, never performed by this runtime.
   * Dynamic replacement/disposal invalidates retired identities immediately.
   */
  dispatchEvent(targetPath: string, event: UiEmbeddedInteractionEvent): UiEmbeddedDispatchResult {
    this.ensureActive();
    if (
      targetPath !== `${this.levelPath}.layout` &&
      !this.isDescendant(`${this.levelPath}.layout`, targetPath)
    )
      throw new Error('Event target escapes the Surface layout.');
    // A DOM control may correspond to a leaf node inside its owning component.
    // Resolve that owner only when the target still exists in the published tree.
    let current = this.byPath.get(targetPath);
    if (!current && this.context.get(targetPath) !== undefined)
      current = this.nearestAncestor(targetPath);
    let handled = false;
    let consumed = false;
    let preventDefault = false;
    const effects: UiEmbeddedEffect[] = [];
    while (current) {
      if (this.byPath.get(current.layoutPath) !== current) break;
      const parentPath: string | null = current.parentLayoutPath;
      let result = current.component.handleEvent?.(event);
      // Existing Field/List/Popup owners can participate without duplicating
      // their typed handlers. New event types use handleEvent directly.
      if (!result && event.type === 'control-input' && event.control && event.value !== undefined) {
        const effect = current.component.handleControl?.({
          type: 'control-input',
          control: event.control,
          value: event.value,
          ...(event.checked === undefined ? {} : { checked: event.checked }),
          ...(event.field === undefined ? {} : { field: event.field }),
        });
        if (effect) result = { handled: true, effects: [effect] };
      }
      if (!result && event.type === 'action' && event.action !== undefined) {
        const effect = current.component.handleAction?.({
          type: 'action',
          action: event.action,
          ...(event.field === undefined ? {} : { field: event.field }),
        });
        if (effect) result = { handled: true, effects: [effect] };
      }
      if (result) {
        handled ||= result.handled === true || result.consume === true || !!result.effects?.length;
        preventDefault ||= result.preventDefault === true;
        if (result.effects?.length) effects.push(...result.effects);
        if (result.consume) consumed = true;
      }
      if (isUiComponentSourceTracingEnabled()) {
        this.trace(current, 'event', {
          type: event.type,
          handled:
            result?.handled === true || result?.consume === true || !!result?.effects?.length,
          consumed: result?.consume === true,
          preventDefault: result?.preventDefault === true,
        });
      }
      if (consumed) break;
      current = parentPath ? this.byPath.get(parentPath) : undefined;
    }
    return { handled, consumed, preventDefault, effects };
  }

  /** Legacy multi-owner action dispatch for registered Tools; keep until those callers migrate. */
  dispatchAction(
    event: UiEmbeddedActionEvent,
    ownsEvent: (definition: UiSemanticContentDefinition) => boolean,
  ): readonly UiEmbeddedEffect[] {
    this.ensureActive();
    const effects: UiEmbeddedEffect[] = [];
    for (const instance of this.instances) {
      if (!ownsEvent(instance.definition)) continue;
      const effect = instance.component.handleAction?.(event);
      if (effect) effects.push(effect);
    }
    return effects;
  }

  /** Subscribe only after the Host has published the fully populated #level. */
  attach(): void {
    this.ensureActive();
    if (this.unsubscribe) throw new Error('Embedded surface already attached.');
    this.unsubscribe = this.context.subscribe((event) => this.notify(event.paths), {
      path: this.levelPath,
      recursive: true,
      label: `${this.options.name}:embedded-layout`,
    });
    // Host has now published the entire initial tree. Parent-first callbacks
    // may safely read children from CTX without accessing native DOM objects.
    try {
      for (const instance of this.instances) this.attachInstance(instance);
    } catch (error) {
      this.unsubscribe();
      this.unsubscribe = null;
      throw error;
    }
  }

  /** Auth hidden-tab recovery; an unchanged component instance retains its state. */
  reconcile(prefix: string): void {
    this.ensureActive();
    const scope = prefix.endsWith('.') ? prefix.slice(0, -1) : prefix;
    for (const entry of [...this.instances]) {
      if (!this.isWithinScope(scope, entry.layoutPath) || entry.component.onDataChanged) continue;
      let node = this.context.get(entry.layoutPath) as UiSemanticLayoutNode | undefined;
      if (!node || typeof node !== 'object') {
        node = entry.component.createLayoutNode?.() ?? this.options.componentNode(entry.definition);
        this.context.set(entry.layoutPath, node);
      }
      const { writer, finishInitial } = this.writer(entry.layoutPath, node, true);
      try {
        entry.component.populateLayout(node, writer);
        this.trace(entry, 'reconcile');
      } finally {
        finishInitial();
      }
    }
  }

  /** Restrict resource publishing to names explicitly declared by mounted components. */
  setResource(name: string, value: unknown): void {
    this.requireResource(name);
    this.context.set(this.bindingPath(`data.resources.runtime.${name}`), value);
  }

  setResourceStatus(
    name: string,
    status: 'idle' | 'loading' | 'ready' | 'error',
    error: string | null = null,
  ): void {
    this.context.set(this.requireResource(name), { status, error });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribe?.();
    this.unsubscribe = null;
    for (const instance of this.instances.splice(0).reverse()) {
      this.trace(instance, 'dispose');
      try {
        instance.component.dispose?.();
      } catch {
        /* independent component cleanup */
      }
    }
    this.resourceStatusPaths.clear();
    this.byPath.clear();
  }

  private writer(rootPath: string, root: UiSemanticLayoutNode, reconcile = false) {
    return createUiSemanticLayoutWriter(
      rootPath,
      root,
      {
        createNode: (kind, key, selector, field) => this.options.node(kind, key, selector, field),
        mountComponent: (definition, path) => this.mount(definition, path),
        reuseComponent: (definition, path) => {
          const mounted = this.byPath.get(path);
          if (!mounted || mounted.definition.kind !== definition.kind)
            throw new Error(`Conflicting embedded component at: ${path}`);
          const node = this.context.get(path);
          if (!node || typeof node !== 'object' || Array.isArray(node))
            throw new Error(`Missing mounted component node: ${path}`);
          return node as UiSemanticLayoutNode;
        },
        addNode: (parent, key, node) => this.context.add(parent, key, node),
        getNode: (path) => this.context.get(path),
        setNode: (path, node) => this.context.set(path, node),
      },
      reconcile,
    );
  }

  /** Replacement is transactional for newly instantiated descendants. */
  private managedWriter(rootPath: string, base: UiEmbeddedLayoutWriter): UiEmbeddedLayoutWriter {
    return {
      add: (parent, key, kind, selector, field) => base.add(parent, key, kind, selector, field),
      mount: (parent, definition, members) => base.mount(parent, definition, members),
      replaceChildren: (members, populate) => {
        const subtree = appendUiSemanticLayoutPath(rootPath, members);
        const previous = this.instances.filter((item) =>
          this.isDescendant(subtree, item.layoutPath),
        );
        const begin = this.instances.length;
        try {
          base.replaceChildren(members, populate);
        } catch (error) {
          for (const added of this.instances.splice(begin).reverse()) {
            if (this.byPath.get(added.layoutPath) === added) this.byPath.delete(added.layoutPath);
            this.trace(added, 'rollback');
            try {
              added.component.dispose?.();
            } catch {
              /* preserve error */
            }
          }
          // The old published subtree remains authoritative after rollback.
          for (const old of previous) this.byPath.set(old.layoutPath, old);
          throw error;
        }
        // Snapshot new instances BEFORE removing old ones, because removal
        // changes array offsets. Attach exactly the new published subtree.
        const added = this.instances.slice(begin);
        // Retire the old subtree bottom-up; only then attach the new one.
        for (const old of previous.reverse()) {
          const at = this.instances.indexOf(old);
          if (at !== -1) this.instances.splice(at, 1);
          if (this.byPath.get(old.layoutPath) === old) this.byPath.delete(old.layoutPath);
          this.trace(old, 'replace');
          try {
            old.component.dispose?.();
          } catch {
            /* preserve successful CTX replacement */
          }
        }
        if (this.unsubscribe) {
          for (const instance of added) {
            try {
              this.attachInstance(instance);
            } catch (error) {
              this.setError(
                instance.layoutPath,
                error instanceof Error ? error.message : String(error),
              );
            }
          }
        }
      },
    };
  }

  /** O(depth) ancestor lookup, never an O(component-count) scan per mount. */
  private nearestAncestor(path: string): EmbeddedInstance | undefined {
    let prefix = 'ctx';
    let nearest: EmbeddedInstance | undefined;
    for (const member of tokenizeContextPath(path)) {
      prefix = appendContextPathMember(prefix, member);
      if (prefix === path) break;
      const mounted = this.byPath.get(prefix);
      if (mounted) nearest = mounted;
    }
    return nearest;
  }

  private attachInstance(instance: EmbeddedInstance): void {
    if (instance.attached) return;
    instance.component.onAttached?.();
    instance.attached = true;
    this.trace(instance, 'attached');
  }

  /** Canonical dotted and bracketed CTX paths share the same ownership rule. */
  private isDescendant(parent: string, path: string): boolean {
    return path.startsWith(`${parent}.`) || path.startsWith(`${parent}[`);
  }

  private isWithinScope(scope: string, path: string): boolean {
    return path === scope || this.isDescendant(scope, path);
  }

  private notify(paths: readonly string[]): void {
    if (this.disposed) return;
    for (const instance of [...this.instances]) {
      if (this.byPath.get(instance.layoutPath) !== instance || !instance.component.onDataChanged)
        continue;
      if (
        !paths.some(
          (path) =>
            reactiveDependencyMatchesChange(instance.dataPath, path) ||
            (instance.statusPath !== null &&
              reactiveDependencyMatchesChange(instance.statusPath, path)),
        )
      )
        continue;
      try {
        instance.component.onDataChanged(paths, instance.writer);
        this.trace(instance, 'update');
        this.setError(instance.layoutPath, null);
      } catch (error) {
        this.setError(instance.layoutPath, error instanceof Error ? error.message : String(error));
      }
    }
  }

  private setError(path: string, error: string | null): void {
    if (!this.options.errorsPath) return;
    const target = `${this.levelPath}.${this.options.errorsPath}`;
    const current = (this.context.get(target) ?? {}) as Record<string, string>;
    if ((current[path] ?? null) === error) return;
    const next = { ...current };
    if (error === null) delete next[path];
    else next[path] = error;
    this.context.set(target, next);
  }

  private bindingPath(member: string): string {
    if (
      !/^(data|state)(?:\.[a-zA-Z][a-zA-Z0-9]*|\[\d+\])+$/.test(member) ||
      tokenizeContextPath(`ctx.${member}`).some(
        (part) =>
          typeof part === 'string' && ['__proto__', 'prototype', 'constructor'].includes(part),
      )
    )
      throw new Error(`Invalid embedded CTX dependency: ${member}`);
    return `${this.levelPath}.${member}`;
  }

  private read<T>(path: string): T | undefined {
    if (!path.startsWith(`${this.levelPath}.`))
      throw new Error('Embedded CTX read escapes surface.');
    const draft = this.options.draft();
    let value: unknown;
    if (draft) {
      value = draft;
      for (const member of tokenizeContextPath(`ctx.${path.slice(this.levelPath.length + 1)}`)) {
        if (!value || typeof value !== 'object' || !Object.hasOwn(value, member)) return undefined;
        value = (value as Record<string | number, unknown>)[member];
      }
    } else value = this.context.get(path);
    return value === undefined ? undefined : (structuredClone(value) as T);
  }

  private initializeResource(entry: UiEmbeddedRegistration): void {
    if (!entry.resource) return;
    const resource = entry.resource;
    const statusPath =
      typeof entry.statusPath === 'string' ? entry.statusPath : `state.${resource.name}`;
    const absolute = this.bindingPath(statusPath);
    const current = this.resourceStatusPaths.get(resource.name);
    if (current) {
      if (current !== absolute) throw new Error(`Conflicting resource status: ${resource.name}`);
      return;
    }
    const draft = this.options.draft();
    if (!draft)
      throw new Error(`Cannot declare resource after initial publication: ${resource.name}`);
    const stateKey = statusPath.slice('state.'.length);
    if (!/^state\.[a-zA-Z][a-zA-Z0-9]*$/.test(statusPath) || Object.hasOwn(draft.state, stateKey))
      throw new Error(`Invalid or conflicting resource state: ${statusPath}`);
    const data = draft.data as { resources?: { runtime?: Record<string, unknown> } };
    if (!data.resources?.runtime) throw new Error('Surface has no resource projection.');
    data.resources.runtime[resource.name] = structuredClone(resource.initialValue);
    draft.state[stateKey] = { status: resource.initialStatus ?? 'idle', error: null };
    this.resourceStatusPaths.set(resource.name, absolute);
  }

  private requireResource(name: string): string {
    this.ensureActive();
    const path = this.resourceStatusPaths.get(name);
    if (!path) throw new Error(`Resource not declared on this surface: ${name}`);
    return path;
  }

  private ensureActive(): void {
    if (this.disposed) throw new Error('Embedded surface is disposed.');
  }
}
