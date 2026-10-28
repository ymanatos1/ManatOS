import type { UiEmbeddedLayoutWriter, UiSemanticLayoutNode } from '../../../runtime/component.js';
import { ListEmbeddedBase, listPlacement } from './base.js';

/** Owns only the count and toolbar composition; children own their controls.
 * UIS ownership: the count region and the Filter, Views, Search and Add children; each child owns its own control. */
export class ListHeaderEmbedded extends ListEmbeddedBase {
  populateLayout(target: UiSemanticLayoutNode, writer: UiEmbeddedLayoutWriter): void {
    const count = writer.add(target, 'entryCount', 'region', '.manatos-list-count');
    writer.add(count, 'value', 'value', '[data-list-count]');
    const controls = writer.add(target, 'controls', 'region', '[data-list-controls]');
    const definitions = [
      ['ListFilter', 'list-filter'],
      ['ListViews', 'list-views'],
      ['ListSearch', 'list-search'],
      ['ListAdd', 'list-add'],
    ] as const;
    for (const [id, kind] of definitions) {
      writer.mount(
        controls,
        listPlacement(id, kind, `[data-list-layout="${id}"]`, this.definition.entityKey),
        ['controls'],
      );
    }
  }
}
