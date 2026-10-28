/** UIS Entry invariant for future maintainers/AI:
 * Entry -> Tabs -> Tab -> layout group -> typed Field is an
 * ownership chain, not a request for the generic framework to render it.
 * Each Field is one #layout node, with no child layout nodes; the
 * matching Angular/EJS HTML declares native children. EntryRuntime alone
 * commits changes to #data.current. NEVER flatten or bypass these boundaries.
 */
import { allSysBOMetadata, allSysBOUIMetadata } from '@manatos/shared';
import type {
  UiEmbeddedComponent,
  UiEmbeddedContextBinding,
  UiEmbeddedLayoutWriter,
  UiEmbeddedControlEvent,
  UiEmbeddedActionEvent,
  UiEmbeddedFieldEffect,
  UiSemanticContentDefinition,
  UiSemanticLayoutNode,
} from '../../../runtime/component.js';
import { UI_COMPONENT_LANGUAGE } from '../../../runtime/component.js';
import { uiEntryTabs, uiEntryFieldPresentation, uiEntryFieldTools } from '../EntryMetadata.js';
import {
  uiEntryRelatedCollection,
  uiEntryRelatedViews,
  UI_ENTRY_RELATED_VIEW_ACTION_FIELD,
} from '../EntrySections.js';
import { mountEntryLayoutItems, type EntryLayoutDefinition } from './LayoutComposition.js';
import { createUiFieldBehavior } from '../../fields/registry.js';
import { createUiSemanticLayoutNode } from '../../../runtime/layout/node.js';
import type { UiFieldBehavior } from '../../fields/field-types.js';

export interface EntryDefinition extends UiSemanticContentDefinition {
  readonly entityKey: string;
  readonly selector: string;
  readonly field?: string;
  readonly tabIndex?: number;
  readonly fieldIndex?: number;
  readonly fieldType?: string;
  readonly collectionReference?: string;
  readonly entryViewKey?: string;
  readonly rowIndex?: number;
  readonly columnIndex?: number;
  readonly hostKind?: 'page' | 'popup';
  /** Action composition comes from the Host; the Actions child owns its nodes. */
  readonly actionIds?: readonly string[];
  readonly permissions?: Readonly<Record<string, boolean>>;
}

/** UIS ownership: the bound UIS context and definition shared by Entry children; each concrete class declares its own layout. */
export abstract class EntryComponent implements UiEmbeddedComponent {
  protected binding: UiEmbeddedContextBinding | null = null;
  constructor(protected readonly definition: EntryDefinition) {}
  bindContext(binding: UiEmbeddedContextBinding): void {
    this.binding = binding;
  }
  protected context(): UiEmbeddedContextBinding {
    if (!this.binding) throw new Error(`Entry component is not bound: ${this.definition.id}`);
    return this.binding;
  }
  dispose(): void {
    this.binding = null;
  }
  abstract populateLayout(target: UiSemanticLayoutNode, writer: UiEmbeddedLayoutWriter): void;
}

/** Entry composes its children; each registered child owns its own layout internals.
 * UIS ownership: the header, Tabs subtree and Actions child; field layout must remain under its registered tabs. Do not recreate tab, FormField, typed Field or Tools layout in the Entry host. */
export class EntryEmbedded extends EntryComponent {
  private viewKey = '';
  override populateLayout(target: UiSemanticLayoutNode, writer: UiEmbeddedLayoutWriter): void {
    this.viewKey = this.context().readStatus<{ uiViewKey?: string }>()?.uiViewKey ?? 'main';
    this.populate(target, writer);
  }
  onDataChanged(_paths: readonly string[], writer: UiEmbeddedLayoutWriter): void {
    const next = this.context().readStatus<{ uiViewKey?: string }>()?.uiViewKey ?? 'main';
    if (next === this.viewKey) return;
    writer.replaceChildren([], (target, scoped) => this.populate(target, scoped));
    this.viewKey = next; // Do not advance the key if remount failed.
  }
  private populate(target: UiSemanticLayoutNode, writer: UiEmbeddedLayoutWriter): void {
    writer.add(target, 'header', 'region', '[data-entry-layout="Header"]');
    writer.mount(
      target,
      {
        id: 'EntryTabs',
        kind: 'entry-tabs',
        entityKey: this.definition.entityKey,
        permissions: this.definition.permissions,
        selector: '[data-entry-layout="Tabs"]',
      } as EntryDefinition,
      [],
    );
    writer.mount(
      target,
      {
        id: 'EntryChangeStatus',
        kind: 'entry-change-status',
        entityKey: this.definition.entityKey,
        selector: '[data-entry-layout="ChangeStatus"]',
      } as EntryDefinition,
      [],
    );
    writer.mount(
      target,
      {
        id: 'actions',
        kind: 'entry-actions',
        entityKey: this.definition.entityKey,
        actionIds: this.definition.actionIds,
        selector: '[data-entry-layout="Actions"]',
      } as EntryDefinition,
      [],
    );
  }
}

/** UIS ownership: the canonical tab navigation and per-tab child mounts; tab visibility is recalculated from metadata and permissions. */
export class EntryTabsEmbedded extends EntryComponent {
  private tabSignature = '';

  private visibleTabs() {
    const state = this.context().readStatus<{
      mode?: 'edit' | 'view' | 'create';
      permissions?: Readonly<Record<string, boolean>>;
      uiViewKey?: string;
    }>();
    return uiEntryTabs(
      this.definition.entityKey,
      this.context().services.resolve(UI_COMPONENT_LANGUAGE)?.() ?? 'EN',
      {
        mode: state?.mode ?? 'edit',
        permissions: state?.permissions ?? this.definition.permissions ?? {},
        record: this.context().readData<Readonly<Record<string, unknown>> | null>() ?? null,
        viewKey: state?.uiViewKey,
      },
    );
  }

  private compose(target: UiSemanticLayoutNode, writer: UiEmbeddedLayoutWriter): void {
    const tabs = this.visibleTabs();
    this.tabSignature = tabs.map((tab) => tab.id).join('|');
    writer.add(target, 'navigation', 'region', '[data-entry-layout="Tabs"]');
    tabs.forEach((tab, index) => {
      if (!tab.id) throw new Error('Entry tab is missing its canonical identity.');
      writer.mount(
        target,
        {
          id: `Tab${index}`,
          kind: 'entry-tab',
          entityKey: this.definition.entityKey,
          tabIndex: index,
          permissions:
            this.context().readStatus<{ permissions?: Readonly<Record<string, boolean>> }>()
              ?.permissions ?? this.definition.permissions,
          selector: `[data-entry-tab-index="${index}"]`,
        } as EntryDefinition,
        [],
      );
    });
  }

  override populateLayout(target: UiSemanticLayoutNode, writer: UiEmbeddedLayoutWriter): void {
    this.compose(target, writer);
  }

  onDataChanged(paths: readonly string[], writer: UiEmbeddedLayoutWriter): void {
    if (!paths.length) return;
    const next = this.visibleTabs()
      .map((tab) => tab.id)
      .join('|');
    if (next === this.tabSignature) return;
    writer.replaceChildren([], (target, scoped) => this.compose(target, scoped));
  }
}

/** UIS ownership: one tab content subtree generated from canonical layout metadata rather than host-created markup. */
export class EntryTabEmbedded extends EntryComponent {
  override populateLayout(target: UiSemanticLayoutNode, writer: UiEmbeddedLayoutWriter): void {
    const index = this.definition.tabIndex;
    if (index === undefined) throw new Error('Entry Tab is missing its index.');
    const status = this.context().readStatus<{
      mode?: 'edit' | 'view' | 'create';
      permissions?: Readonly<Record<string, boolean>>;
      uiViewKey?: string;
    }>();
    const tab = uiEntryTabs(
      this.definition.entityKey,
      this.context().services.resolve(UI_COMPONENT_LANGUAGE)?.() ?? 'EN',
      {
        mode: status?.mode ?? 'edit',
        permissions: status?.permissions ?? this.definition.permissions ?? {},
        record: this.context().readData<Readonly<Record<string, unknown>> | null>() ?? null,
        viewKey: status?.uiViewKey,
      },
    )[index];
    if (!tab) throw new Error('Unknown Entry Tab.');
    mountEntryLayoutItems(target, writer, this.definition, tab.layout);
  }
}

/** A registered structural group owns the recursive population of its children.
 * UIS ownership: the recursive nested layout items contained in this group; layout groups are first-class owners. */
export class EntryLayoutGroupEmbedded extends EntryComponent {
  createLayoutNode(): UiSemanticLayoutNode {
    return createUiSemanticLayoutNode(
      'region',
      this.definition.id,
      `entry:${this.definition.id}`,
      this.definition.selector,
    );
  }
  override populateLayout(target: UiSemanticLayoutNode, writer: UiEmbeddedLayoutWriter): void {
    const group = this.definition as EntryLayoutDefinition;
    mountEntryLayoutItems(target, writer, group, group.items ?? []);
  }
}

/** A spacing slot is a real semantic owner, with no child contributions.
 * UIS ownership: one intentional spacer/break slot; register its node without inventing editing behavior. */
export class EntryLayoutSlotEmbedded extends EntryComponent {
  createLayoutNode(): UiSemanticLayoutNode {
    return createUiSemanticLayoutNode(
      'region',
      this.definition.id,
      `entry:${this.definition.id}`,
      this.definition.selector,
    );
  }
  override populateLayout(): void {
    // The registered node itself is this component's entire semantic structure.
  }
}

/** Summary owns its compact read-only field presentation in the existing Entry level. */
export class EntrySummaryEmbedded extends EntryComponent {
  createLayoutNode(): UiSemanticLayoutNode {
    return createUiSemanticLayoutNode(
      'region',
      this.definition.id,
      `entry:${this.definition.id}`,
      this.definition.selector,
    );
  }
  override populateLayout(target: UiSemanticLayoutNode, writer: UiEmbeddedLayoutWriter): void {
    writer.add(target, 'values', 'region', `${this.definition.selector}[data-entry-summary]`);
  }
}

/** RelatedEntries owns its header and View selector; the nested List owns columns and rows. */
export class EntryRelatedCollectionEmbedded extends EntryComponent {
  private hasList = false;
  createLayoutNode(): UiSemanticLayoutNode {
    return createUiSemanticLayoutNode(
      'region',
      this.definition.id,
      `entry:${this.definition.id}`,
      this.definition.selector,
    );
  }
  private hasRows(): boolean {
    const resources =
      this.context().readData<
        Readonly<Record<string, { rows?: readonly Readonly<Record<string, unknown>>[] }>>
      >();
    return (resources?.[this.definition.collectionReference ?? '']?.rows?.length ?? 0) > 0;
  }
  private populate(target: UiSemanticLayoutNode, writer: UiEmbeddedLayoutWriter): void {
    const scope = this.definition.selector;
    writer.add(target, 'header', 'region', `${scope} .manatos-entry-related-header`);
    writer.add(target, 'views', 'control', `${scope} .manatos-entry-related-views`);
    if (!this.hasRows()) return; // No phantom List node for the empty-state message.
    writer.mount(
      target,
      {
        id: 'List',
        kind: 'entry-related-list',
        entityKey: this.definition.entityKey,
        collectionReference: this.definition.collectionReference,
        entryViewKey: this.context().readStatus<{ uiViewKey?: string }>()?.uiViewKey,
        selector: `${scope} [data-list-layout="List"]`,
      } as EntryDefinition,
      [],
    );
  }
  override populateLayout(target: UiSemanticLayoutNode, writer: UiEmbeddedLayoutWriter): void {
    this.populate(target, writer);
    this.hasList = this.hasRows();
  }
  onDataChanged(_paths: readonly string[], writer: UiEmbeddedLayoutWriter): void {
    const next = this.hasRows();
    if (next === this.hasList) return;
    writer.replaceChildren([], (target, scoped) => this.populate(target, scoped));
    this.hasList = next;
  }
}

/** Embedded List reads related records from the Entry's existing #data; never creates another #level. */
export class EntryRelatedListEmbedded extends EntryComponent {
  private rowSignature = '';
  override populateLayout(target: UiSemanticLayoutNode, writer: UiEmbeddedLayoutWriter): void {
    writer.mount(
      target,
      {
        id: 'ListColumnsRow',
        kind: 'entry-related-list-columns',
        entityKey: this.definition.entityKey,
        collectionReference: this.definition.collectionReference,
        entryViewKey: this.definition.entryViewKey,
        selector: `${this.definition.selector} [data-list-layout="ListColumnsRow"]`,
      } as EntryDefinition,
      [],
    );
    const rows = writer.add(
      target,
      'rows',
      'region',
      `${this.definition.selector} .manatos-list-rows`,
    );
    this.mountRows(rows, writer);
    this.rowSignature = this.signature();
  }
  onDataChanged(_paths: readonly string[], writer: UiEmbeddedLayoutWriter): void {
    const next = this.signature();
    if (next === this.rowSignature) return;
    writer.replaceChildren(['rows'], (rows, scoped) => this.mountRows(rows, scoped));
    this.rowSignature = next;
  }
  private records(): readonly Readonly<Record<string, unknown>>[] {
    const resources =
      this.context().readData<
        Readonly<Record<string, { rows?: readonly Readonly<Record<string, unknown>>[] }>>
      >();
    return resources?.[this.definition.collectionReference ?? '']?.rows ?? [];
  }
  private selectedView(): string | undefined {
    return this.context().readData<Readonly<Record<string, { viewKey?: string }>>>()?.[
      this.definition.collectionReference ?? ''
    ]?.viewKey;
  }
  private signature(): string {
    return JSON.stringify([this.selectedView(), this.records().map((row) => row['id'])]);
  }
  private mountRows(target: UiSemanticLayoutNode, writer: UiEmbeddedLayoutWriter): void {
    this.records().forEach((_row, index) =>
      writer.mount(
        target,
        {
          id: `ListRow${index}`,
          kind: 'entry-related-list-row',
          entityKey: this.definition.entityKey,
          collectionReference: this.definition.collectionReference,
          entryViewKey: this.definition.entryViewKey,
          rowIndex: index,
          selector: `${this.definition.selector} [data-list-layout="ListRow"][data-list-row-index="${index}"]`,
        } as EntryDefinition,
        ['rows'],
      ),
    );
  }
}

/** ListColumnsRow mounts indexed canonical column headers and tracks the selected view. */
export class EntryRelatedListColumnsEmbedded extends EntryComponent {
  private viewKey = '';
  override populateLayout(target: UiSemanticLayoutNode, writer: UiEmbeddedLayoutWriter): void {
    this.mountHeaders(target, writer);
    this.viewKey = this.selectedView();
  }
  onDataChanged(_paths: readonly string[], writer: UiEmbeddedLayoutWriter): void {
    const selected = this.selectedView();
    if (selected === this.viewKey) return;
    writer.replaceChildren([], (target, scoped) => this.mountHeaders(target, scoped));
    this.viewKey = selected;
  }
  private selectedView(): string {
    const resources = this.context().readData<Readonly<Record<string, { viewKey?: string }>>>();
    return resources?.[this.definition.collectionReference ?? '']?.viewKey ?? '';
  }
  private mountHeaders(target: UiSemanticLayoutNode, writer: UiEmbeddedLayoutWriter): void {
    relatedColumns(this.definition, this.selectedView()).forEach((_column, index) =>
      writer.mount(
        target,
        {
          id: `ListColumnHeader${index}`,
          kind: 'entry-related-list-header',
          entityKey: this.definition.entityKey,
          columnIndex: index,
          selector: `${this.definition.selector} [data-list-layout="ListColumnHeader"][data-list-column-index="${index}"]`,
        } as EntryDefinition,
        [],
      ),
    );
  }
}

export class EntryRelatedListHeaderEmbedded extends EntryComponent {
  override populateLayout(): void {
    // The ListColumnHeader's own DOM element is its semantic highlight target.
  }
}

/** ListRow owns its indexed canonical ListCell descendants for the active related view. */
export class EntryRelatedListRowEmbedded extends EntryComponent {
  private viewKey = '';
  override populateLayout(target: UiSemanticLayoutNode, writer: UiEmbeddedLayoutWriter): void {
    this.mountCells(target, writer);
    this.viewKey = this.selectedView();
  }
  onDataChanged(_paths: readonly string[], writer: UiEmbeddedLayoutWriter): void {
    const selected = this.selectedView();
    if (selected === this.viewKey) return;
    writer.replaceChildren([], (target, scoped) => this.mountCells(target, scoped));
    this.viewKey = selected;
  }
  private selectedView(): string {
    const resources = this.context().readData<Readonly<Record<string, { viewKey?: string }>>>();
    return resources?.[this.definition.collectionReference ?? '']?.viewKey ?? '';
  }
  private mountCells(target: UiSemanticLayoutNode, writer: UiEmbeddedLayoutWriter): void {
    relatedColumns(this.definition, this.selectedView()).forEach((_column, index) =>
      writer.mount(
        target,
        {
          id: `ListCell${index}`,
          kind: 'entry-related-list-cell',
          entityKey: this.definition.entityKey,
          rowIndex: this.definition.rowIndex,
          columnIndex: index,
          selector: `${this.definition.selector} [data-list-layout="ListCell"][data-list-cell-index="${index}"]`,
        } as EntryDefinition,
        [],
      ),
    );
  }
}
export class EntryRelatedListCellEmbedded extends EntryComponent {
  override populateLayout(target: UiSemanticLayoutNode, writer: UiEmbeddedLayoutWriter): void {
    writer.add(target, 'value', 'value', `${this.definition.selector} [data-list-cell-value]`);
  }
}
function relatedColumns(definition: EntryDefinition, viewKey?: string) {
  const collection = uiEntryRelatedCollection(
    definition.entityKey,
    definition.collectionReference ?? '',
    definition.entryViewKey,
  );
  if (!collection) return [];
  const views = uiEntryRelatedViews(collection, 'EN');
  return (
    (views.find((view) => view.key === (viewKey || collection.relatedListView)) ?? views[0])
      ?.columns ?? []
  ).concat([
    {
      field: UI_ENTRY_RELATED_VIEW_ACTION_FIELD,
      sourceField: UI_ENTRY_RELATED_VIEW_ACTION_FIELD,
      label: 'View',
    },
  ]);
}

/** Metadata-only slot for features awaiting a proper embedded implementation.
 * The Surface records the slot without inventing editor or mutation behavior.
 * UIS ownership: a declared-but-unavailable slot so the layout remains truthful without fake controls.
 */
export class EntryDeferredEmbedded extends EntryComponent {
  override populateLayout(target: UiSemanticLayoutNode, writer: UiEmbeddedLayoutWriter): void {
    writer.add(
      target,
      'availability',
      'value',
      `${this.definition.selector} [data-entry-deferred]`,
    );
  }
}

/** Tool action intent is interpreted by this Field's own component. */
export type UiEntryFieldToolEffect =
  | { readonly type: 'field-revert'; readonly field: string }
  | { readonly type: 'field-set'; readonly field: string; readonly value: unknown }
  | { readonly type: 'field-copy'; readonly field: string; readonly text: string };

/** All typed Fields use the same semantic control/Tools structure; their concrete
 * subclasses supply the actual type-specific FieldBehavior. Keep this single layout
 * path shared unless a type genuinely requires a different semantic subtree.
 * Field-specific decoding/parts/tools come from the prepared behavior, not a switch
 * in FormField or the Entry host. */
export abstract class EntryTypedFieldEmbedded extends EntryComponent {
  // Field, native control and floating Field Tools are one CTX layout entry.
  // Neither the control nor any menu internals publish additional layout nodes.
  override populateLayout(): void {
    // One semantic node represents this entire Field, including its native controls and Tools.
  }

  /** Feature policy comes from the same presentation contract used by NG/EJS. */
  handleAction(event: UiEmbeddedActionEvent): UiEntryFieldToolEffect | null {
    const field = this.definition.field;
    if (!field) return null;
    const current = this.context().readData<Record<string, unknown>>() ?? {};
    const state =
      this.context().readStatus<
        Record<string, import('../EntryEditState.js').UiEntryFieldState>
      >() ?? {};
    const presentation = uiEntryFieldPresentation(
      this.definition.entityKey,
      field,
      current[field],
      this.context().services.resolve(UI_COMPONENT_LANGUAGE)?.() ?? 'EN',
      undefined,
      typeof current.id === 'string' ? current.id : undefined,
      undefined,
      state[field],
    );
    if (
      !presentation ||
      !uiEntryFieldTools(presentation).some((tool) => tool.id === event.action && tool.enabled)
    )
      return null;
    // EJS0 parity: tool intent changes canonical Entry state, never native input DOM.
    // Local calendar values intentionally have no UTC conversion.
    if (event.action === 'zero') return { type: 'field-set', field, value: 0 };
    if (event.action === 'duration-zero') return { type: 'field-set', field, value: 'P0Y0M0D' };
    if (event.action === 'today' || event.action === 'now') {
      const now = new Date();
      const pad = (part: number): string => String(part).padStart(2, '0');
      const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      const value =
        presentation.type === 'date'
          ? date
          : `${date}T${event.action === 'today' ? '00:00' : `${pad(now.getHours())}:${pad(now.getMinutes())}`}`;
      return { type: 'field-set', field, value };
    }
    if (event.action === 'revert') return { type: 'field-revert', field };
    if (event.action === 'clear') return { type: 'field-set', field, value: null };
    if (event.action === 'trim' && typeof current[field] === 'string')
      return { type: 'field-set', field, value: current[field].trim() };
    if (event.action === 'copy')
      return {
        type: 'field-copy',
        field,
        text:
          presentation.type === 'reference'
            ? (presentation.relatedName ?? '')
            : presentation.type === 'enum'
              ? (presentation.options?.find((option) => option.value === String(current[field]))
                  ?.label ?? presentation.text)
              : presentation.type === 'duration'
                ? createUiFieldBehavior(this.definition.entityKey, field).formatText(
                    current[field],
                    presentation.language,
                  )
                : typeof current[field] === 'object'
                  ? presentation.text
                  : String(current[field] ?? ''),
      };
    return null;
  }
  /** Delegate to this Field's registered behavior, not a generic type switch. */
  handleControl(event: UiEmbeddedControlEvent): UiEmbeddedFieldEffect | null {
    const field = this.definition.field;
    if (!field || event.type !== 'control-input') return null;
    const value = this.fieldBehavior().decodeControl(event);
    return value === undefined ? null : { type: 'set-field', field, value };
  }

  /** Each typed Field injects its concrete behavior, prepared once per mount. */
  protected abstract createBehavior(): UiFieldBehavior;
  private behavior: UiFieldBehavior | null = null;
  protected fieldBehavior(): UiFieldBehavior {
    if (this.behavior) return this.behavior;
    const key = this.definition.field;
    const entity = allSysBOMetadata[this.definition.entityKey as keyof typeof allSysBOMetadata];
    const field = key && entity?.fieldDefinition[key];
    if (!key || !entity || !field || field.sensitive)
      throw new Error('Typed Field requires non-sensitive canonical metadata.');
    const behavior = this.createBehavior();
    if (behavior.type !== field.type) throw new Error(`Field registration mismatch: ${key}`);
    behavior.prepare({
      entityKey: this.definition.entityKey,
      fieldKey: key,
      entity: entity as Parameters<UiFieldBehavior['prepare']>[0]['entity'],
      field,
      ui: allSysBOUIMetadata[this.definition.entityKey as keyof typeof allSysBOUIMetadata] ?? null,
    });
    return (this.behavior = behavior);
  }
}

/** Entry-owned, reusable change status. It never computes its own dirty state. */
export class EntryChangeStatusEmbedded extends EntryComponent {
  override populateLayout(target: UiSemanticLayoutNode, writer: UiEmbeddedLayoutWriter): void {
    writer.add(target, 'review', 'action', '[data-entry-review-changes]');
  }
}

/** Actions own only semantic controls; dispatch remains with the owning Surface Host.
 * UIS ownership: available Entry action nodes; only Entry Surface Host applies resulting state changes. */
export class EntryActionsEmbedded extends EntryComponent {
  override populateLayout(target: UiSemanticLayoutNode, writer: UiEmbeddedLayoutWriter): void {
    for (const action of this.definition.actionIds ?? [])
      writer.add(target, action, 'action', `[data-surface-action="${action}"]`);
  }
}
