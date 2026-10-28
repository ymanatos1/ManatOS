import type { UiEmbeddedLayoutWriter, UiSemanticLayoutNode } from '../../../runtime/component.js';
import { ListEmbeddedBase } from './base.js';

/** UIS ownership: one column value within a specific indexed row; the field formatter supplies the value markup. */
export class ListCellEmbedded extends ListEmbeddedBase {
  populateLayout(target: UiSemanticLayoutNode, writer: UiEmbeddedLayoutWriter): void {
    const row = this.definition.rowIndex;
    const column = this.definition.columnIndex;
    if (row === undefined || column === undefined)
      throw new Error('List cell has no instance indices.');
    writer.add(
      target,
      'value',
      'value',
      `[data-list-layout="ListRow"][data-list-row-index="${row}"] [data-list-layout="ListCell"][data-list-cell-index="${column}"] [data-list-cell-value]`,
      this.definition.field,
    );
  }
}
