import type { UiEmbeddedLayoutWriter, UiSemanticLayoutNode } from '../../../runtime/component.js';
import { uiSurfaceActions } from '../../../runtime/surface/actions.js';
import { ListEmbeddedBase } from './base.js';

/** Popup-only actions share the Surface action contract, not a second List dispatcher.
 * UIS ownership: the available row-independent page action controls, leaving the Surface to commit the resulting action. */
export class ListActionsEmbedded extends ListEmbeddedBase {
  populateLayout(target: UiSemanticLayoutNode, writer: UiEmbeddedLayoutWriter): void {
    for (const action of uiSurfaceActions('list', 'popup'))
      writer.add(target, action.id, 'action', `[data-surface-action="${action.id}"]`);
  }
}
