import type { UiComponentInstance } from './component.js';
import type { UiContext } from './ui-context.js';
import type { UiLevel } from './ui-level.js';

export type UiRegionId = string;
export type UiTabId = string;
export type UiPresentationLifecycle = 'created' | 'mounted' | 'unmounted' | 'disposed';

/** Resolved, executable-free placement metadata consumed by the presentation runtime. */
export type UiCompositionNodeKind =
  'field' | 'break' | 'spacer' | 'column' | 'inline' | 'action' | 'collection' | 'component';

/** Host-neutral ordered composition resolved from canonical UI metadata. */
export interface UiCompositionNode {
  readonly key: string;
  readonly kind: UiCompositionNodeKind;
  readonly field?: string;
  readonly action?: string;
  readonly collection?: string;
  readonly component?: string;
  readonly representation?: string;
  readonly label?: string;
  /** Static 12-grid span declared by metadata; dynamic spans remain renderer-resolved. */
  readonly span?: number;
  /** Optional physical renderer identity used by inspection/highlighting adapters. */
  readonly rendererRef?: string;
  readonly children?: readonly UiCompositionNode[];
}

export interface UiRegionDefinition {
  readonly id: UiRegionId;
  readonly role?: string;
  readonly composition?: readonly UiCompositionNode[];
}

export interface UiTabDefinition {
  readonly id: UiTabId;
  readonly label?: string;
  readonly regions: readonly UiRegionDefinition[];
  readonly lazy?: boolean;
}

export interface UiPresentationChromeElement {
  readonly key: string;
  readonly kind: 'action' | 'status';
  readonly label?: string;
  readonly rendererRef?: string;
  readonly modes?: readonly string[];
}

export interface UiPresentationDefinition {
  readonly regions?: readonly UiRegionDefinition[];
  readonly tabs?: readonly UiTabDefinition[];
  readonly initialTabId?: UiTabId;
  /** Rendered surface chrome. Values describe presentation only; semantic state remains in CTX. */
  readonly chrome?: {
    readonly title?: { readonly rendererRef?: string };
    /** Physical container for the rendered terminal action/status area, when one exists. */
    readonly actionsRendererRef?: string;
    readonly actions?: readonly UiPresentationChromeElement[];
  };
}

/** One live region in one view materialization. Components are presentation-owned. */
export class UiRegionInstance {
  readonly #components: UiComponentInstance[] = [];

  constructor(readonly definition: UiRegionDefinition) {}

  get components(): readonly UiComponentInstance[] {
    return this.#components;
  }

  add(component: UiComponentInstance): void {
    if (this.#components.includes(component)) return;
    this.#components.push(component);
  }

  mount(): void {
    for (const component of this.#components) component.mount();
  }

  unmount(): void {
    for (const component of [...this.#components].reverse()) component.unmount();
  }

  dispose(): void {
    for (const component of [...this.#components].reverse()) component.dispose();
    this.#components.length = 0;
  }
}

/** Optional tab composition. Tab activation is presentation lifecycle, not UiLevel lifecycle. */
export class UiTabInstance {
  readonly regions: ReadonlyMap<UiRegionId, UiRegionInstance>;
  #active = false;

  constructor(readonly definition: UiTabDefinition) {
    this.regions = new Map(
      definition.regions.map((region) => [region.id, new UiRegionInstance(region)]),
    );
  }

  get active(): boolean {
    return this.#active;
  }

  activate(): void {
    if (this.#active) return;
    this.#active = true;
    for (const region of this.regions.values()) region.mount();
  }

  deactivate(): void {
    if (!this.#active) return;
    for (const region of [...this.regions.values()].reverse()) region.unmount();
    this.#active = false;
  }

  dispose(): void {
    this.deactivate();
    for (const region of [...this.regions.values()].reverse()) region.dispose();
  }
}

/**
 * View-owned presentation composition for one UiLevel.
 *
 * It owns regions/tabs/components only. Semantic state remains in the level/surface CTX and
 * therefore survives disposal/rematerialization of this object.
 */
export class UiPresentationInstance {
  readonly regions: ReadonlyMap<UiRegionId, UiRegionInstance>;
  readonly tabs: ReadonlyMap<UiTabId, UiTabInstance>;
  #lifecycle: UiPresentationLifecycle = 'created';
  #selectedTabId: UiTabId | null = null;

  constructor(
    readonly level: UiLevel,
    readonly context: UiContext,
    readonly definition: UiPresentationDefinition,
  ) {
    this.regions = new Map(
      (definition.regions ?? []).map((region) => [region.id, new UiRegionInstance(region)]),
    );
    this.tabs = new Map((definition.tabs ?? []).map((tab) => [tab.id, new UiTabInstance(tab)]));
    this.#selectedTabId = this.#resolveInitialTab();
  }

  get lifecycle(): UiPresentationLifecycle {
    return this.#lifecycle;
  }

  get selectedTabId(): UiTabId | null {
    return this.#selectedTabId;
  }

  region(regionId: UiRegionId, tabId?: UiTabId): UiRegionInstance {
    const region = tabId ? this.tabs.get(tabId)?.regions.get(regionId) : this.regions.get(regionId);
    if (!region) {
      throw new Error(`Unknown UI presentation region: ${tabId ? `${tabId}.` : ''}${regionId}`);
    }
    return region;
  }

  addComponent(component: UiComponentInstance, regionId: UiRegionId, tabId?: UiTabId): void {
    this.#assertAlive();
    this.region(regionId, tabId).add(component);
  }

  mount(): void {
    this.#assertAlive();
    if (this.#lifecycle === 'mounted') return;
    for (const region of this.regions.values()) region.mount();
    if (this.#selectedTabId) this.tabs.get(this.#selectedTabId)?.activate();
    this.#lifecycle = 'mounted';
  }

  selectTab(tabId: UiTabId): void {
    this.#assertAlive();
    const next = this.tabs.get(tabId);
    if (!next) throw new Error(`Unknown UI presentation tab: ${tabId}`);
    if (this.#selectedTabId === tabId) return;
    if (this.#selectedTabId) this.tabs.get(this.#selectedTabId)?.deactivate();
    this.#selectedTabId = tabId;
    this.context.set('state.presentation.selectedTabId', tabId, {
      source: 'presentation:tab-select',
    });
    if (this.#lifecycle === 'mounted') next.activate();
  }

  unmount(): void {
    if (this.#lifecycle !== 'mounted') return;
    if (this.#selectedTabId) this.tabs.get(this.#selectedTabId)?.deactivate();
    for (const region of [...this.regions.values()].reverse()) region.unmount();
    this.#lifecycle = 'unmounted';
  }

  dispose(): void {
    if (this.#lifecycle === 'disposed') return;
    this.unmount();
    for (const tab of [...this.tabs.values()].reverse()) tab.dispose();
    for (const region of [...this.regions.values()].reverse()) region.dispose();
    this.#lifecycle = 'disposed';
  }

  #resolveInitialTab(): UiTabId | null {
    if (this.tabs.size === 0) return null;
    const remembered = this.context.get('state.presentation.selectedTabId');
    if (typeof remembered === 'string' && this.tabs.has(remembered)) return remembered;
    if (this.definition.initialTabId && this.tabs.has(this.definition.initialTabId)) {
      return this.definition.initialTabId;
    }
    return this.tabs.keys().next().value ?? null;
  }

  #assertAlive(): void {
    if (this.#lifecycle === 'disposed') throw new Error('UI presentation is disposed.');
  }
}
