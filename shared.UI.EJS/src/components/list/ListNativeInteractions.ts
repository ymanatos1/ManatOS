import { EjsTransientMenus } from '../../runtime/transient-menu.js';
import { listFilterClickRoutes } from './header/ListFilter.js';
import { listViewsClickRoutes } from './header/ListViews.js';
import { listColumnHeaderClickRoutes } from './columns/ListColumnHeader.js';
import {
  listPaginationClickRoutes,
  listPaginationValueRoutes,
} from './pagination/ListPagination.js';
import { listSearchValueRoutes } from './header/ListSearch.js';
import { listFilterFieldValueRoutes } from './header/ListFilterField.js';
import {
  dispatchUiNativeComponentEvent,
  type UiEmbeddedInteractionEvent,
  type UiListPageRuntime,
} from '@manatos/shared-ui';

/**
 * EJS native List bindings. Each declarative route identifies its registered
 * semantic owner; ListPageHost owns the Surface, not individual List controls.
 * The framework dispatches to that owner and its parents. New List components
 * register another route without modifying host conditionals or CTX policy.
 */
/** Native routing mechanics only. Concrete children declare selectors/actions next
 * to the TS renderer whose HTML owns the corresponding control. */
export interface ListNativeRoute {
  readonly selector: string;
  readonly kind: string;
  readonly action?: string;
  readonly actionAttribute?: string;
  readonly fieldAttribute?: string;
}

const clickRoutes: readonly ListNativeRoute[] = [
  ...listFilterClickRoutes,
  ...listViewsClickRoutes,
  ...listColumnHeaderClickRoutes,
  ...listPaginationClickRoutes,
];
const valueRoutes: readonly ListNativeRoute[] = [
  ...listSearchValueRoutes,
  ...listPaginationValueRoutes,
  ...listFilterFieldValueRoutes,
];

/** Native DOM listeners are installed once; replacement markup retains them.
 * UIS ownership: native event wiring against the List control selectors, translating DOM events into Surface intents. */
export function mountListNativeInteractions(
  host: HTMLElement,
  runtime: UiListPageRuntime,
  onRowSelected?: (id: string) => void,
): () => void {
  const overlays = EjsTransientMenus.forDocument(host.ownerDocument);
  const belongs = (node: Node): boolean => host.contains(node) || overlays.owns(host, node);
  const onClick = (native: MouseEvent): void => {
    if (!(native.target instanceof Element) || !belongs(native.target)) return;
    const row = native.target.closest<HTMLElement>('[data-list-row-index]');
    if (
      row &&
      belongs(row) &&
      !native.target.closest('button, input, select, textarea') &&
      runtime.level.state.list.selectionMode !== 'none'
    ) {
      const id = runtime.level.data.list[Number(row.dataset['listRowIndex'])]?.id;
      if (native.target.closest('a')) native.preventDefault();
      if (typeof id === 'string') runtime.selectRow(id);
      return;
    }
    for (const route of clickRoutes) {
      const target = native.target.closest<HTMLElement>(route.selector);
      if (!target || !belongs(target)) continue;
      const action =
        route.action ?? (route.actionAttribute && target.getAttribute(route.actionAttribute));
      const field = route.fieldAttribute && target.getAttribute(route.fieldAttribute);
      if (action) {
        const facts: UiEmbeddedInteractionEvent = {
          type: 'action',
          action,
          ...(field ? { field } : {}),
        };
        dispatchUiNativeComponentEvent(native, route.kind, facts, () =>
          runtime.dispatchInteraction(route.kind, facts, field || undefined),
        );
      }
      return;
    }
  };
  const onValue = (native: Event): void => {
    const target = native.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
    if (native.type !== 'change') return;
    if (!belongs(target)) return;
    for (const route of valueRoutes) {
      if (!target.matches(route.selector)) continue;
      const field = route.fieldAttribute && target.getAttribute(route.fieldAttribute);
      const facts: UiEmbeddedInteractionEvent = {
        type: 'control-input',
        control: target instanceof HTMLSelectElement ? 'select' : 'text',
        value: target.value,
        ...(field ? { field } : {}),
      };
      dispatchUiNativeComponentEvent(native, route.kind, facts, () =>
        runtime.dispatchInteraction(route.kind, facts, field || undefined),
      );
      return;
    }
  };
  const onKeydown = (native: KeyboardEvent): void => {
    if (native.key !== 'Enter' && native.key !== ' ') return;
    const row =
      native.target instanceof Element
        ? native.target.closest<HTMLElement>('[data-list-row-index]')
        : null;
    if (
      row &&
      belongs(row) &&
      native.target === row &&
      runtime.level.state.list.selectionMode !== 'none'
    ) {
      const id = runtime.level.data.list[Number(row.dataset['listRowIndex'])]?.id;
      if (typeof id === 'string' && runtime.selectRow(id)) {
        native.preventDefault();
        onRowSelected?.(id);
      }
      return;
    }
    const target = native.target;
    if (!(target instanceof Element)) return;
    const header = target.closest<HTMLElement>('[data-list-sort-field]');
    if (!header || !belongs(header)) return;
    const field = header.dataset['listSortField'];
    if (!field) return;
    // Native keyboard activation of non-button headings must not scroll.
    native.preventDefault();
    const facts: UiEmbeddedInteractionEvent = { type: 'action', action: 'sort', field };
    dispatchUiNativeComponentEvent(native, 'list-column-header', facts, () =>
      runtime.dispatchInteraction('list-column-header', facts, field),
    );
  };
  // Portaled menus are outside the List subtree: route their events to the same semantic owner.
  const onExternalClick = (event: MouseEvent): void => {
    if (!(event.target instanceof Node) || host.contains(event.target)) return;
    onClick(event);
  };
  const onExternalValue = (event: Event): void => {
    if (!(event.target instanceof Node) || host.contains(event.target)) return;
    onValue(event);
  };
  const onDoubleClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element) || runtime.level.state.list.selectionMode !== 'single') return;
    const row = target.closest<HTMLElement>('[data-list-row-index]');
    if (!row || !belongs(row) || target.closest('button, input, select, textarea')) return;
    if (target.closest('a')) event.preventDefault();
    const id = runtime.level.data.list[Number(row.dataset['listRowIndex'])]?.id;
    if (typeof id === 'string' && runtime.selectRow(id)) onRowSelected?.(id);
  };
  host.addEventListener('click', onClick);
  host.addEventListener('dblclick', onDoubleClick);
  host.ownerDocument.addEventListener('click', onExternalClick);
  host.ownerDocument.addEventListener('input', onExternalValue);
  host.ownerDocument.addEventListener('change', onExternalValue);
  host.addEventListener('input', onValue);
  host.addEventListener('change', onValue);
  host.addEventListener('keydown', onKeydown);
  return () => {
    host.removeEventListener('click', onClick);
    host.removeEventListener('dblclick', onDoubleClick);
    host.ownerDocument.removeEventListener('click', onExternalClick);
    host.ownerDocument.removeEventListener('input', onExternalValue);
    host.ownerDocument.removeEventListener('change', onExternalValue);
    host.removeEventListener('input', onValue);
    host.removeEventListener('change', onValue);
    host.removeEventListener('keydown', onKeydown);
  };
}
