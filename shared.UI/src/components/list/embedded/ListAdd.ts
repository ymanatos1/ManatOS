import type { UiEmbeddedLayoutWriter, UiSemanticLayoutNode } from '../../../runtime/component.js';
import { ListEmbeddedBase } from './base.js';

/**
 * Declares the Add action selector in semantic #layout. Its browser control is intentionally
 * disabled in the current slice; do not invent record creation here. Debug: populateLayout()
 * -> ListAdd native template.
 */
export class ListAddEmbedded extends ListEmbeddedBase {
  populateLayout(target: UiSemanticLayoutNode, writer: UiEmbeddedLayoutWriter): void {
    writer.add(target, 'button', 'action', '[data-list-add]');
  }
}
