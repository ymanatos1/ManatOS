import type {
  UiEmbeddedLayoutWriter,
  UiSemanticLayoutNode,
  UiEmbeddedControlEvent,
} from '../../../runtime/component.js';
import { ListEmbeddedBase, type UiListEffect } from './base.js';

/**
 * The Search owner declares its own input and accepts bounded query values (512 characters).
 * The List runtime applies the effect; native adapters must not duplicate search state. Debug:
 * handleControl() -> set-search and populateLayout().
 */
export class ListSearchEmbedded extends ListEmbeddedBase {
  handleControl(event: UiEmbeddedControlEvent): UiListEffect | null {
    return event.value.length <= 512 ? { type: 'set-search', value: event.value } : null;
  }
  populateLayout(target: UiSemanticLayoutNode, writer: UiEmbeddedLayoutWriter): void {
    writer.add(target, 'input', 'input', '[data-list-search]', 'search');
  }
}
