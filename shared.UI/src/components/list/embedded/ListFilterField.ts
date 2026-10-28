import type {
  UiEmbeddedControlEvent,
  UiEmbeddedLayoutWriter,
  UiSemanticLayoutNode,
} from '../../../runtime/component.js';
import { uiListFilterFields } from '../ListMetadata.js';
import { ListEmbeddedBase, type UiListEffect } from './base.js';

/** One metadata Field owns its filter control and allowed input interpretation.
 * UIS ownership: one named filter input/selection and its validated field-change intent. */
export class ListFilterFieldEmbedded extends ListEmbeddedBase {
  populateLayout(target: UiSemanticLayoutNode, writer: UiEmbeddedLayoutWriter): void {
    if (!this.definition.field) throw new Error('List Filter Field has no metadata identity.');
    writer.add(target, 'control', 'input', this.definition.selector, this.definition.field);
  }

  handleControl(event: UiEmbeddedControlEvent): UiListEffect | null {
    const field = this.definition.field;
    if (!field || event.field !== field || event.value.length > 512) return null;
    const view = this.context().readStatus<{ view?: string }>()?.view ?? 'main';
    if (
      !uiListFilterFields(
        this.definition.entityKey,
        'EN' /* Language-neutral identities; only display labels are localized by adapters. */,
        view,
      ).some((candidate) => candidate.field === field)
    )
      return null;
    return { type: 'set-filter', field, value: event.value };
  }
}
