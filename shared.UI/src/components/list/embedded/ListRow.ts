import type { UiEmbeddedLayoutWriter, UiSemanticLayoutNode } from '../../../runtime/component.js';
import { uiListColumns } from '../ListMetadata.js';
import { ListEmbeddedBase, listPlacement } from './base.js';

/** UIS ownership: one row and the ordered Cell children for the selected view; do not move cell ownership to List. */
export class ListRowEmbedded extends ListEmbeddedBase {
  private view = '';

  populateLayout(target: UiSemanticLayoutNode, writer: UiEmbeddedLayoutWriter): void {
    const view = this.currentView();
    this.mountCells(target, writer, view);
    this.view = view;
  }

  onDataChanged(_paths: readonly string[], writer: UiEmbeddedLayoutWriter): void {
    const view = this.currentView();
    if (view === this.view) return;
    writer.replaceChildren([], (row, scoped) => this.mountCells(row, scoped, view));
    this.view = view;
  }

  private currentView(): string {
    return this.context().readStatus<{ view?: string }>()?.view ?? 'main';
  }

  private mountCells(
    target: UiSemanticLayoutNode,
    writer: UiEmbeddedLayoutWriter,
    view: string,
  ): void {
    const rowIndex = this.definition.rowIndex;
    if (rowIndex === undefined) throw new Error('List row has no index.');
    uiListColumns(
      this.definition.entityKey,
      'EN' /* Language-neutral identities; only display labels are localized by adapters. */,
      view,
    ).forEach((column, columnIndex) => {
      writer.mount(
        target,
        listPlacement(
          `ListCell${columnIndex}`,
          'list-cell',
          `[data-list-layout="ListRow"][data-list-row-index="${rowIndex}"] [data-list-layout="ListCell"][data-list-cell-index="${columnIndex}"]`,
          this.definition.entityKey,
          { rowIndex, columnIndex, field: column.field },
        ),
        [],
      );
    });
  }
}
