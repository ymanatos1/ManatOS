/**
 * POPUP ROOT — the Host instantiates this one component; it owns composition.
 * - PopupTitle declares title tools.
 * - PopupTab owns its content and legacy tab actions; root actions are optional.
 * - A single-view popup mounts directly at #layout.content (no fake tabs).
 * - The framework mounts all descendants and owns lifecycle/disposal.
 */
import type {
  UiEmbeddedComponent,
  UiEmbeddedLayoutWriter,
  UiSemanticContentDefinition,
  UiSemanticLayoutNode,
} from '../../runtime/component.js';
import type { UiPopupActionDefinition, UiPopupTabDefinition } from '../popup-definition.js';
import { popupComponentLayout, type UiPopupEmbeddedDefinition } from './PopupComponents.js';

export interface UiPopupTabsDefinition extends UiSemanticContentDefinition {
  readonly views: readonly UiPopupTabDefinition[];
  readonly rootActions?: boolean;
}

export interface UiPopupRootDefinition extends UiSemanticContentDefinition {
  readonly views: readonly UiPopupTabDefinition[];
  readonly titleTools: UiPopupEmbeddedDefinition['titleTools'];
  readonly actions?: readonly UiPopupActionDefinition[];
}

/** Owns only its immediate children; never reimplements their internals.
 * UIS ownership: the Popup Title, tab navigation and active Tab child; no popup-wide generic renderer should fabricate descendants. Do not migrate title/tab/section/credential child composition into the shared popup engine. */
export class PopupRootEmbedded implements UiEmbeddedComponent {
  constructor(private readonly definition: UiPopupRootDefinition) {}
  bindContext(): void {
    // Root composition uses its declaration, not Surface data or host APIs.
  }
  populateLayout(target: UiSemanticLayoutNode, writer: UiEmbeddedLayoutWriter): void {
    writer.mount(
      target,
      {
        id: 'title',
        kind: 'popup-title',
        titleTools: this.definition.titleTools,
      } as UiPopupEmbeddedDefinition,
      [],
    );
    if (this.definition.views.length > 1) {
      writer.mount(
        target,
        {
          id: 'tabs',
          kind: 'popup-tabs',
          views: this.definition.views,
          rootActions: !!this.definition.actions,
        } as UiPopupTabsDefinition,
        [],
      );
    } else {
      const tab = this.definition.views[0];
      if (!tab) throw new Error('Popup root requires at least one view.');
      writer.mount(
        target,
        {
          id: 'content',
          kind: 'popup-view',
          tab,
          rootActions: !!this.definition.actions,
        } as UiPopupEmbeddedDefinition,
        [],
      );
    }
    if (this.definition.actions) {
      writer.mount(
        target,
        {
          id: 'actions',
          kind: 'popup-actions',
          actions: this.definition.actions,
        } as UiPopupEmbeddedDefinition,
        [],
      );
    }
  }
}

/** Optional reusable Tabs capability: owns all tab identities and their mounting.
 * UIS ownership: tab navigation and active tab semantics while preserving one popup #level. */
export class PopupTabsEmbedded implements UiEmbeddedComponent {
  constructor(private readonly definition: UiPopupTabsDefinition) {}
  createLayoutNode(): UiSemanticLayoutNode {
    // The optional Tabs owner maps to the existing tab panes in both NG/EJS.
    // No renderer emits an empty popup-layout-id, so that selector cannot highlight.
    return popupComponentLayout('region', this.definition.id, '[data-popup-tab]');
  }
  bindContext(): void {
    // Active selection is hosted by the owning Surface's #state.tab.
  }
  populateLayout(target: UiSemanticLayoutNode, writer: UiEmbeddedLayoutWriter): void {
    for (const tab of this.definition.views)
      writer.mount(
        target,
        {
          id: tab.id,
          kind: 'popup-tab',
          tab,
          rootActions: this.definition.rootActions,
        } as UiPopupEmbeddedDefinition,
        [],
      );
  }
}
