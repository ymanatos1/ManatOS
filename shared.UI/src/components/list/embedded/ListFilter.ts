import type {
  UiEmbeddedLayoutWriter,
  UiSemanticLayoutNode,
  UiEmbeddedActionEvent,
} from '../../../runtime/component.js';
import { ListEmbeddedBase, listPlacement, type UiListEffect } from './base.js';
import { uiListFilterFields } from '../ListMetadata.js';

/**
 * The Filter owner declares the toggle, dock action and per-view Field children. It validates
 * actions before producing UIS List effects; never let the host compose arbitrary filter
 * fields. Debug: handleAction() and populateLayout().
 */
export class ListFilterEmbedded extends ListEmbeddedBase {
  /** DOM adapters identify a semantic action; this component interprets it. */
  handleAction(event: UiEmbeddedActionEvent): UiListEffect | null {
    const status = this.context().readStatus<{
      filtersVisible?: boolean;
      filtersDocked?: boolean;
    }>();
    if (event.action === 'refresh') return { type: 'refresh-list' };
    if (event.action === 'toggle')
      return { type: 'filters-visible', value: !status?.filtersVisible };
    if (event.action === 'dock') return { type: 'filters-docked', value: !status?.filtersDocked };
    return null;
  }
  private view = '';
  private currentView(): string {
    return this.context().readStatus<{ view?: string }>()?.view ?? 'main';
  }
  populateLayout(target: UiSemanticLayoutNode, writer: UiEmbeddedLayoutWriter): void {
    writer.add(target, 'refresh', 'action', '[data-list-refresh]');
    writer.add(target, 'toggle', 'action', '[data-list-toggle-filters]');
    const panel = writer.add(target, 'panel', 'region', '[data-list-filter-panel]');
    this.view = this.currentView();
    this.populateFields(panel, writer, this.view);
  }
  onDataChanged(_paths: readonly string[], writer: UiEmbeddedLayoutWriter): void {
    const view = this.currentView();
    if (view === this.view) return;
    // The filter component reconciles its own children on a metadata-view change.
    writer.replaceChildren(['panel'], (panel, scoped) => this.populateFields(panel, scoped, view));
    this.view = view;
  }
  private populateFields(
    panel: UiSemanticLayoutNode,
    writer: UiEmbeddedLayoutWriter,
    view: string,
  ): void {
    writer.add(panel, 'dock', 'action', '[data-list-filter-dock]');
    for (const filter of uiListFilterFields(
      this.definition.entityKey,
      'EN' /* Language-neutral identities; only display labels are localized by adapters. */,
      view,
    )) {
      writer.mount(
        panel,
        listPlacement(
          filter.field,
          'list-filter-field',
          `[data-list-filter-name="${filter.field}"]`,
          this.definition.entityKey,
          { field: filter.field },
        ),
        ['panel'],
      );
    }
  }
}
