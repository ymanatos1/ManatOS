import type {
  UiEmbeddedLayoutWriter,
  UiSemanticLayoutNode,
  UiEmbeddedActionEvent,
  UiEmbeddedControlEvent,
} from '../../../runtime/component.js';
import { ListEmbeddedBase, type UiListEffect } from './base.js';

/**
 * Pagination owns first/previous/next/last intent and bounded page-size control under its
 * semantic node. The List runtime enforces valid page boundaries; do not duplicate that policy
 * in the native host. Debug: handleAction()/handleControl().
 */
export class ListPaginationEmbedded extends ListEmbeddedBase {
  handleAction(event: UiEmbeddedActionEvent): UiListEffect | null {
    const state = this.context().readStatus<{ page?: number; totalPages?: number }>();
    const page = state?.page ?? 1;
    const total = state?.totalPages ?? 1;
    const next =
      event.action === 'first'
        ? 1
        : event.action === 'previous'
          ? page - 1
          : event.action === 'next'
            ? page + 1
            : event.action === 'last'
              ? total
              : null;
    return next === null || next < 1 || next > Math.max(1, total)
      ? null
      : { type: 'set-page', value: next };
  }
  handleControl(event: UiEmbeddedControlEvent): UiListEffect | null {
    const size = Number(event.value);
    const allowed =
      this.context().readStatus<{ pageSizeOptions?: readonly number[] }>()?.pageSizeOptions ?? [];
    return Number.isSafeInteger(size) && allowed.includes(size)
      ? { type: 'set-page-size', value: size }
      : null;
  }
  populateLayout(target: UiSemanticLayoutNode, writer: UiEmbeddedLayoutWriter): void {
    writer.add(target, 'page', 'value', '[data-list-page-indicator]');
    for (const action of ['first', 'previous', 'next', 'last'])
      writer.add(target, action, 'action', `[data-list-page-action="${action}"]`);
    writer.add(target, 'pageSize', 'input', '[data-list-rows-per-page]');
  }
}
