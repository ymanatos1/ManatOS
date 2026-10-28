import type { UiEmbeddedLayoutWriter, UiSemanticLayoutNode } from '../../../runtime/component.js';
import { uiListColumns } from '../ListMetadata.js';
import { ListEmbeddedBase, listPlacement } from './base.js';

/**
 * ColumnsRow declares one indexed ColumnHeader child for each canonical view column. Index
 * stability preserves Field formatting and semantic sort paths; never manufacture Header
 * children in the List host. Debug: populateLayout().
 */
export class ListColumnsRowEmbedded extends ListEmbeddedBase {
  private signature = '';
  populateLayout(target: UiSemanticLayoutNode, writer: UiEmbeddedLayoutWriter): void {
    const view = this.context().readStatus<{ view?: string }>()?.view ?? 'main';
    this.mountHeaders(target, writer, view);
    this.signature = view;
  }
  onDataChanged(_paths: readonly string[], writer: UiEmbeddedLayoutWriter): void {
    const view = this.context().readStatus<{ view?: string }>()?.view ?? 'main';
    if (this.signature === view) return;
    writer.replaceChildren([], (root, scoped) => this.mountHeaders(root, scoped, view));
    this.signature = view;
  }
  private mountHeaders(
    target: UiSemanticLayoutNode,
    writer: UiEmbeddedLayoutWriter,
    view: string,
  ): void {
    uiListColumns(
      this.definition.entityKey,
      'EN' /* Language-neutral identities; only display labels are localized by adapters. */,
      view,
    ).forEach((column, index) => {
      writer.mount(
        target,
        listPlacement(
          `ListColumnHeader${index}`,
          'list-column-header',
          `[data-list-layout="ListColumnHeader"][data-list-column-index="${index}"]`,
          this.definition.entityKey,
          { columnIndex: index, field: column.field },
        ),
        [],
      );
    });
  }
}
