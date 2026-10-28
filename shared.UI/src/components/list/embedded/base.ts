import type {
  UiEmbeddedComponent,
  UiEmbeddedContextBinding,
  UiEmbeddedEffect,
  UiSemanticContentDefinition,
} from '../../../runtime/component.js';

/**
 * LIST COMPONENT NAVIGATION
 * - List.ts composes Header, ColumnsRow, Rows and Pagination.
 * - Individual modules declare local controls and interpret user events.
 * - ListPageRuntime dispatches to these mounted owners and commits effects.
 * - NG/EJS adapters translate native events only; neither owns List policy.
 * - #data.list and #state.list remain Surface-owned; child bindings are read-only.
 */
/** Component-owned intents. Only UiListPageRuntime mutates canonical List state. */
export type UiListEffect = UiEmbeddedEffect &
  (
    | { readonly type: 'refresh-list' }
    | { readonly type: 'filters-visible'; readonly value: boolean }
    | { readonly type: 'filters-docked'; readonly value: boolean }
    | { readonly type: 'views-open'; readonly value: boolean }
    | { readonly type: 'set-filter'; readonly field: string; readonly value: string }
    | { readonly type: 'set-search'; readonly value: string }
    | { readonly type: 'set-view'; readonly value: string }
    | { readonly type: 'set-sort'; readonly value: string }
    | { readonly type: 'set-page'; readonly value: number }
    | { readonly type: 'set-page-size'; readonly value: number }
  );

/** A placement is semantic metadata, never a copy of a List record. */
export interface ListEmbeddedDefinition extends UiSemanticContentDefinition {
  readonly selector: string;
  readonly entityKey: string;
  readonly rowIndex?: number;
  readonly columnIndex?: number;
  readonly field?: string;
  /** Host-declared action capability; List knows no host implementation type. */
  readonly showActions?: boolean;
  readonly hostKind?: 'page' | 'popup';
}

/** UIS ownership: the bound UIS context and definition shared by List children; it must not compose their subtrees. */
export abstract class ListEmbeddedBase implements UiEmbeddedComponent {
  protected binding: UiEmbeddedContextBinding | null = null;
  constructor(protected readonly definition: ListEmbeddedDefinition) {}
  bindContext(binding: UiEmbeddedContextBinding): void {
    this.binding = binding;
  }
  protected context(): UiEmbeddedContextBinding {
    if (!this.binding) throw new Error(`List embedded component not bound: ${this.definition.id}`);
    return this.binding;
  }
  dispose(): void {
    this.binding = null;
  }
  abstract populateLayout(
    target: import('../../../runtime/component.js').UiSemanticLayoutNode,
    writer: import('../../../runtime/component.js').UiEmbeddedLayoutWriter,
  ): void;
}

/** UIS ownership: stable List component identity/selector mapping, not an HTML renderer. */
export function listPlacement(
  id: string,
  kind: string,
  selector: string,
  entityKey: string,
  extra: Partial<ListEmbeddedDefinition> = {},
): ListEmbeddedDefinition {
  return { id, kind, selector, entityKey, ...extra };
}
