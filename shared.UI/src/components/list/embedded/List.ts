import type { UiEmbeddedLayoutWriter, UiSemanticLayoutNode } from '../../../runtime/component.js';
import { ListEmbeddedBase, listPlacement } from './base.js';

/** Owns only the List's composition; child components register their own layouts.
 * UIS ownership: the header, columns, keyed rows, pagination and optional actions; only row children are replaced when record identities change. Do not merge header/cell/column/filter child declarations into List or a generic UIS renderer. */
export class ListEmbedded extends ListEmbeddedBase {
  private signature = '';
  populateLayout(target: UiSemanticLayoutNode, writer: UiEmbeddedLayoutWriter): void {
    const entity = this.definition.entityKey;
    writer.mount(
      target,
      listPlacement('ListHeader', 'list-header', '[data-list-layout="ListHeader"]', entity),
      [],
    );
    writer.mount(
      target,
      listPlacement(
        'ListColumnsRow',
        'list-columns-row',
        '[data-list-layout="ListColumnsRow"]',
        entity,
      ),
      [],
    );
    const rows = writer.add(target, 'rows', 'region', '.manatos-list-rows');
    this.mountRows(rows, writer);
    writer.mount(
      target,
      listPlacement(
        'ListPagination',
        'list-pagination',
        '[data-list-layout="ListPagination"]',
        entity,
      ),
      [],
    );
    if (this.definition.showActions)
      writer.mount(
        target,
        listPlacement('actions', 'list-actions', '[data-list-layout="Actions"]', entity),
        [],
      );
    this.signature = this.currentSignature();
  }
  onDataChanged(_paths: readonly string[], writer: UiEmbeddedLayoutWriter): void {
    const next = this.currentSignature();
    if (next === this.signature) return;
    writer.replaceChildren(['rows'], (rows, scoped) => this.mountRows(rows, scoped));
    this.signature = next;
  }
  private currentSignature(): string {
    const rows = this.context().readData<readonly Record<string, unknown>[]>() ?? [];
    return JSON.stringify(rows.map((row) => row.id));
  }
  private mountRows(target: UiSemanticLayoutNode, writer: UiEmbeddedLayoutWriter): void {
    const rows = this.context().readData<readonly Record<string, unknown>[]>() ?? [];
    rows.forEach((_row, index) =>
      writer.mount(
        target,
        listPlacement(
          `ListRow${index}`,
          'list-row',
          `[data-list-layout="ListRow"][data-list-row-index="${index}"]`,
          this.definition.entityKey,
          { rowIndex: index },
        ),
        ['rows'],
      ),
    );
  }
}
