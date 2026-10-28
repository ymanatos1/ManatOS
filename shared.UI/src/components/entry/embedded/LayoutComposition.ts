import { allSysBOMetadata } from '@manatos/shared';
/**
 * ENTRY METADATA COMPOSITION — declarative per-kind factories, never host switches.
 *
 * EntryTab only selects metadata items. Each registered child populates its own
 * subtree; a group recursively delegates its content to further registered owners.
 * Add a new layout kind by registering its factory and embedded component.
 */
import type { UiEmbeddedLayoutWriter, UiSemanticLayoutNode } from '../../../runtime/component.js';
import type { UiEntryLayoutItem } from '../EntryMetadata.js';
import type { EntryDefinition } from './Entry.js';

/** A structural item may carry children, but only its owning component opens them. */
export interface EntryLayoutDefinition extends EntryDefinition {
  readonly items?: readonly UiEntryLayoutItem[];
}

type ItemFactory = (
  item: UiEntryLayoutItem,
  context: EntryDefinition,
  selector: string,
  id: string,
) => EntryLayoutDefinition;

/** Extension registry: metadata interpretation is independent of Page/Popup hosts. */
const factories = new Map<UiEntryLayoutItem['kind'], ItemFactory>();

/** UIS ownership: one canonical layout-kind mapping so structural children remain explicit. */
export function registerEntryLayoutKind(
  kind: UiEntryLayoutItem['kind'],
  factory: ItemFactory,
): void {
  if (factories.has(kind)) throw new Error(`Entry layout kind already registered: ${kind}`);
  factories.set(kind, factory);
}

registerEntryLayoutKind('field', (item, context, selector) => {
  if (item.kind !== 'field') throw new Error('Invalid Entry field declaration.');
  const entity = allSysBOMetadata[context.entityKey as keyof typeof allSysBOMetadata];
  const type = entity?.fieldDefinition[item.field]?.type;
  if (!type) throw new Error(`Unregistered Entry Field: ${item.field}`);
  return {
    id: item.field,
    kind: `field-${type}`,
    entityKey: context.entityKey,
    field: item.field,
    tabIndex: context.tabIndex,
    // Exactly one CTX layout node per entire Field, including its Tools and control.
    selector,
  };
});
registerEntryLayoutKind('summary', (item, context, selector, id) => {
  void item;
  return { id: `Summary${id}`, kind: 'entry-summary', entityKey: context.entityKey, selector };
});
registerEntryLayoutKind('collection', (item, context, selector, id) => {
  void item;
  return {
    id: `Collection${id}`,
    kind: 'entry-related-collection',
    entityKey: context.entityKey,
    collectionReference: item.kind === 'collection' ? item.reference : undefined,
    selector,
  };
});
registerEntryLayoutKind('deferred', (item, context, selector, id) => {
  void item;
  return { id: `Deferred${id}`, kind: 'entry-deferred', entityKey: context.entityKey, selector };
});
const group: ItemFactory = (item, context, selector, id) => {
  if (item.kind !== 'column' && item.kind !== 'inline')
    throw new Error('Invalid Entry group declaration.');
  return {
    id: `Group${id}`,
    kind: 'entry-layout-group',
    entityKey: context.entityKey,
    tabIndex: context.tabIndex,
    permissions: context.permissions,
    selector,
    items: item.content,
  };
};
registerEntryLayoutKind('column', group);
registerEntryLayoutKind('inline', group);
const slot: ItemFactory = (item, context, selector, id) => {
  void item;
  return { id: `Layout${id}`, kind: 'entry-layout-slot', entityKey: context.entityKey, selector };
};
registerEntryLayoutKind('break', slot);
registerEntryLayoutKind('spacer', slot);

/** Parent names the child and its position; the child owns all internal contributions.
 * UIS ownership: recursive registration of each named layout item beneath its actual owner. */
export function mountEntryLayoutItems(
  parent: UiSemanticLayoutNode,
  writer: UiEmbeddedLayoutWriter,
  context: EntryDefinition,
  items: readonly UiEntryLayoutItem[],
  path: readonly string[] = [],
): void {
  for (const item of items) {
    const factory = factories.get(item.kind);
    if (!factory) throw new Error(`Unregistered Entry layout kind: ${item.kind}`);
    const id = item.layoutId.replace(/-/g, '_');
    const selector = `[data-entry-layout-id="${item.layoutId}"]`;
    writer.mount(parent, factory(item, context, selector, id), path);
  }
}
