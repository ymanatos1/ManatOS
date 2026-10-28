/**
 * UIS COMPONENT CONTRACT — start here when adding a semantic component.
 *
 * 1. Declare a UiSemanticContentDefinition and register its kind.
 * 2. Implement bindContext/populateLayout; optionally handle input/reactivity.
 * 3. Mount through UiEmbeddedLayoutWriter.mount(), never mutate #layout directly.
 * 4. SurfaceEmbeddedRuntime handles binding, reconciliation and disposal.
 *
 * See: runtime/layout/writer.ts, runtime/surface/embedded-runtime.ts.
 * Consumers: components/{entry,list}/embedded, popups/embedded.
 * Invariant: only the owning Surface creates/disposes #level; no component
 * may duplicate a canonical data value in its private state.
 */
import type { MetadataLanguage } from '@manatos/shared';

/** Framework-independent semantic content and tree contracts. */
export interface UiSemanticContentDefinition {
  readonly id: string;
  readonly kind: string;
}
export interface UiSemanticLayoutNode {
  [child: string]: UiSemanticLayoutNode;
}

/**
 * Host-neutral dependency token. Export tokens from capability modules; do not
 * dispatch by Page/Popup or component kinds. Token identity, not its label,
 * selects the implementation supplied by a Host or ancestor component.
 */
export interface UiComponentServiceToken<T> {
  readonly id: symbol;
  readonly label: string;
  /** Compile-time marker only; never materialized or stored in CTX. */
  readonly __serviceType?: T;
}

export function uiComponentServiceToken<T>(label: string): UiComponentServiceToken<T> {
  return Object.freeze({ id: Symbol(label), label });
}

/** Language is a live Host capability: no embedded component caches locale in CTX. */
export const UI_COMPONENT_LANGUAGE =
  uiComponentServiceToken<() => MetadataLanguage>('uis.current-language');

/** Services are ordinary injected capabilities, never copied into CTX. */
export interface UiEmbeddedServiceResolver {
  resolve<T>(token: UiComponentServiceToken<T>): T | undefined;
}

/**
 * Restricted, read-only access to the embedded component's
 * declared CTX data and optional status projection.
 *
 * The hosting surface owns all mutations and resource loading.
 * The component cannot arbitrarily modify the popup CTX.
 */
export interface UiEmbeddedContextBinding {
  readonly dataPath: string;
  readonly statusPath: string | null;
  readonly tabId?: string;
  /** Stable semantic location, not a DOM selector or a new Surface #level. */
  readonly layoutPath: string;
  /** Immediate registered ancestor, or null for a Surface root component. */
  readonly parentLayoutPath: string | null;
  /** Host/ancestor services resolved by DI token; optional capabilities stay optional. */
  readonly services: UiEmbeddedServiceResolver;

  readData<T = unknown>(): T | undefined;
  readStatus<T = unknown>(): T | undefined;
}

/**
 * Writer scoped to an embedded component's semantic #layout.
 *
 * add() constructs named children directly.
 * mount() delegates to another registered embedded component.
 * replaceChildren() publishes asynchronous changes through CTX.
 *
 * All nodes retain rendererRef/domSelector metadata.
 */
/**
 * Stable semantic scope for a child in either a Page or Popup.
 * Existing tabbed popups retain their tab-based DOM identities; a standalone
 * host needs no synthetic tab state or host-kind branch in the child.
 */
export function uiEmbeddedScopeId(binding: UiEmbeddedContextBinding, fallbackId: string): string {
  return binding.tabId || fallbackId;
}

export interface UiEmbeddedLayoutWriter {
  add(
    parent: UiSemanticLayoutNode,
    key: string,
    kind: string,
    elementId: string,
    fieldId?: string,
  ): UiSemanticLayoutNode;

  mount(
    parent: UiSemanticLayoutNode,
    definition: UiSemanticContentDefinition,
    relativePath: readonly string[],
  ): UiSemanticLayoutNode;

  replaceChildren(
    relativePath: readonly string[],
    populate: (target: UiSemanticLayoutNode, writer: UiEmbeddedLayoutWriter) => void,
  ): void;
}

/**
 * Framework-neutral input event. DOM adapters extract only native control facts;
 * the mounted component owns interpretation and returns an effect to its Surface.
 * Never pass an Event, HTMLElement, raw password or mutable CTX object here.
 */
export interface UiEmbeddedControlEvent {
  readonly type: 'control-input';
  readonly control: 'checkbox' | 'number' | 'select' | 'text' | 'duration';
  readonly value: string;
  readonly checked?: boolean;
  /** Semantic field identity supplied by the adapter; never a DOM element. */
  readonly field?: string;
}

/** Framework-neutral action facts, independent of native click/keyboard events. */
export interface UiEmbeddedActionEvent {
  readonly type: 'action';
  readonly action: string;
  readonly field?: string;
}

/**
 * One normalized interaction, independent of DOM event classes and host type.
 * Native adapters translate key, input, pointer and focus events into public
 * facts. Never place passwords, native Event objects or DOM references here.
 * The target is supplied separately by its registered #layout path.
 */
export interface UiEmbeddedInteractionEvent {
  readonly type: string;
  readonly key?: string;
  readonly code?: string;
  readonly field?: string;
  readonly action?: string;
  readonly control?: UiEmbeddedControlEvent['control'];
  readonly value?: string;
  readonly checked?: boolean;
}

/**
 * An event may be handled and still bubble. Consumption stops semantic bubbling;
 * preventDefault is an independent request to the native adapter, when legal.
 * Effects are interpreted by the Surface's authoritative data/state owner.
 */
export interface UiEmbeddedInteractionResult {
  readonly handled?: boolean;
  readonly consume?: boolean;
  readonly preventDefault?: boolean;
  readonly effects?: readonly UiEmbeddedEffect[];
}

export interface UiEmbeddedDispatchResult {
  readonly handled: boolean;
  readonly consumed: boolean;
  readonly preventDefault: boolean;
  readonly effects: readonly UiEmbeddedEffect[];
}

/** Effects are intents; only the owning Surface may turn one into a CTX mutation. */
export interface UiEmbeddedEffect {
  readonly type: string;
}

/** A typed Entry Field's effect. Other components can define their own effects. */
export interface UiEmbeddedFieldEffect extends UiEmbeddedEffect {
  readonly type: 'set-field';
  readonly field: string;
  readonly value: unknown;
}

/**
 * Framework-independent semantic component contract.
 *
 * bindContext() runs once before children are created.
 * populateLayout() declares children recursively through the scoped writer.
 * provideServices() supplies descendants with parent-owned capabilities.
 * onAttached() runs after publication, parent-before-child, once per instance.
 * onDataChanged() reacts to subscribed CTX changes after publication.
 * dispose() releases only component-owned resources, child-before-parent.
 *
 * The hosting surface owns the #level lifecycle.
 */
export interface UiEmbeddedComponent {
  bindContext(binding: UiEmbeddedContextBinding): void;

  /**
   * Optional component-owned root metadata. Use when the component needs a
   * specific semantic kind/selector/renderer reference. The framework supplies
   * the ordinary Host default otherwise; registries never author layouts.
   * Called once after creation and before bindContext; never mutate CTX here.
   */
  createLayoutNode?(): UiSemanticLayoutNode;

  populateLayout(target: UiSemanticLayoutNode, writer: UiEmbeddedLayoutWriter): void;

  onDataChanged?(changedPaths: readonly string[], writer: UiEmbeddedLayoutWriter): void;

  /** Provide contracts to descendants. Called after bindContext, before child mounting. */
  provideServices?(): ReadonlyMap<symbol, unknown> | undefined;

  /** Invoked once, parent-first, after this component's layout is published. */
  onAttached?(): void;

  /**
   * Preferred interaction hook. Invoked target-first through registered parents.
   * Returning nothing leaves the event unhandled; handling never implies consume.
   * No DOM side effects or native event objects enter the semantic component.
   */
  handleEvent?(event: UiEmbeddedInteractionEvent): UiEmbeddedInteractionResult | null;

  /** Optional component-owned input policy. Unsupported events return null. */
  handleControl?(event: UiEmbeddedControlEvent): UiEmbeddedEffect | null;

  /** Optional component-owned action policy; hosts execute effects, never DOM commands. */
  handleAction?(event: UiEmbeddedActionEvent): UiEmbeddedEffect | null;

  dispose?(): void;
}

export interface UiEmbeddedRegistration {
  /** Allow a one-child section to display this component directly in its column. */
  readonly inlineSection?: boolean;
  readonly dataPath: string | ((definition: UiSemanticContentDefinition) => string);
  readonly statusPath?: string | ((definition: UiSemanticContentDefinition) => string);

  readonly create: (definition: UiSemanticContentDefinition) => UiEmbeddedComponent;

  /**
   * Optional initial resource declaration.
   * Each registered API-backed component contributes its resource
   * and loading-state defaults without modifying UiPopupRuntime.
   */
  readonly resource?: {
    readonly name: string;
    readonly initialValue: unknown;
    readonly initialStatus?: 'idle' | 'loading' | 'ready' | 'error';
  };
}

/**
 * Surface-owned registry: explicit registration, no DOM inspection
 * or component-kind conditionals in the popup runtime.
 */
export class UiEmbeddedComponentRegistry {
  private readonly entries = new Map<string, UiEmbeddedRegistration>();

  register(kind: string, registration: UiEmbeddedRegistration): this {
    if (this.entries.has(kind)) throw new Error(`Embedded component already registered: ${kind}`);

    // Each resource has one declarative owner. Other components
    // may bind to it without declaring another copy.
    const resource = registration.resource;

    if (resource) {
      if (typeof registration.statusPath === 'function')
        throw new Error('Resource status path must be a static state member.');
      if (!/^[A-Za-z][A-Za-z0-9]*$/.test(resource.name))
        throw new Error(`Invalid embedded resource name: ${resource.name}`);

      if (
        typeof registration.statusPath === 'string' &&
        !/^state\.[A-Za-z][A-Za-z0-9]*$/.test(registration.statusPath)
      ) {
        throw new Error(`Invalid embedded resource status path: ${registration.statusPath}`);
      }

      for (const [existingKind, entry] of this.entries) {
        if (entry.resource?.name === resource.name) {
          throw new Error(
            `Embedded resource '${resource.name}' already declared by '${existingKind}'`,
          );
        }
      }
    }

    this.entries.set(kind, registration);
    return this;
  }

  get(kind: string): UiEmbeddedRegistration | undefined {
    return this.entries.get(kind);
  }

  has(kind: string): boolean {
    return this.entries.has(kind);
  }
}
