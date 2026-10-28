import type {
  UiEmbeddedLayoutWriter,
  UiSemanticLayoutNode,
  UiEmbeddedActionEvent,
} from '../../../runtime/component.js';
import { ListEmbeddedBase, type UiListEffect } from './base.js';
import { uiListResolvedColumns } from '../ListMetadata.js';

/**
 * The semantic Header owns exactly one column identity and a validated sort intent. Only
 * metadata-sortable fields produce sort effects; other columns are presentation-only. Debug:
 * handleAction() / populateLayout().
 */
export class ListColumnHeaderEmbedded extends ListEmbeddedBase {
  handleAction(event: UiEmbeddedActionEvent): UiListEffect | null {
    if (event.action !== 'sort' || event.field !== this.definition.field) return null;
    const view = this.context().readStatus<{ view?: string }>()?.view ?? 'main';
    const column = uiListResolvedColumns(this.definition.entityKey, view)[
      this.definition.columnIndex ?? -1
    ];
    return column?.field === event.field && column.sortable
      ? { type: 'set-sort', value: column.field }
      : null;
  }
  populateLayout(target: UiSemanticLayoutNode, writer: UiEmbeddedLayoutWriter): void {
    const i = this.definition.columnIndex;
    if (i === undefined) throw new Error('List heading has no column index.');
    const view = this.context().readStatus<{ view?: string }>()?.view ?? 'main';
    if (uiListResolvedColumns(this.definition.entityKey, view)[i]?.sortable)
      writer.add(target, 'sort', 'action', `[data-list-sort-field="${this.definition.field}"]`);
    writer.add(
      target,
      'caption',
      'value',
      `[data-list-layout="ListColumnHeader"][data-list-column-index="${i}"] [data-list-column-caption]`,
    );
  }
}
