import type {
  UiEmbeddedLayoutWriter,
  UiSemanticLayoutNode,
  UiEmbeddedActionEvent,
} from '../../../runtime/component.js';
import { uiListAvailableViews } from '../ListMetadata.js';
import { ListEmbeddedBase, type UiListEffect } from './base.js';

/**
 * Views validates toggle/select intents against metadata-defined view keys and registers its
 * view menu children. Unknown view IDs must not change runtime state. Debug: handleAction() /
 * populateLayout().
 */
export class ListViewsEmbedded extends ListEmbeddedBase {
  handleAction(event: UiEmbeddedActionEvent): UiListEffect | null {
    if (event.action === 'toggle')
      return {
        type: 'views-open',
        value: !this.context().readStatus<{ viewsOpen?: boolean }>()?.viewsOpen,
      };
    if (
      !uiListAvailableViews(
        this.definition.entityKey,
        'EN' /* Language-neutral identities; only display labels are localized by adapters. */,
      ).some((view) => view.key === event.action)
    )
      return null;
    return { type: 'set-view', value: event.action };
  }
  populateLayout(target: UiSemanticLayoutNode, writer: UiEmbeddedLayoutWriter): void {
    writer.add(target, 'toggle', 'action', '[data-list-toggle-views]');
    const menu = writer.add(target, 'menu', 'region', '[data-list-view-menu]');
    for (const view of uiListAvailableViews(this.definition.entityKey, 'EN')) {
      writer.add(menu, view.key, 'action', `[data-list-view-key="${view.key}"]`);
    }
  }
}
