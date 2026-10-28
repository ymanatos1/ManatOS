import { Component, computed, inject, input, signal } from '@angular/core';
import {
  uiEntryRelatedCollection,
  uiEntryRelatedViews,
  uiEntryRelatedListProjection,
  type UiEntryLayoutItem,
} from '@manatos/shared-ui';
import { resolveMetadataText } from '@manatos/shared';
import { List } from '../list/List';
import { EntryContext } from './EntryContext';

type CollectionItem = Extract<UiEntryLayoutItem, { kind: 'collection' }>;

/** Registered metadata collection; it never owns an Entry #level or mutable record. */
@Component({
  selector: 'manatos-entry-layout-collection',
  standalone: true,
  host: { style: 'display: contents' },
  templateUrl: './EntryLayoutCollectionComponent.html',
  imports: [List],
})
export class EntryLayoutCollectionComponent {
  readonly item = input.required<CollectionItem>();
  protected readonly entry = inject(EntryContext);
  protected readonly viewsOpen = signal(false);
  protected readonly collection = computed(() =>
    uiEntryRelatedCollection(
      this.entry.entityKey(),
      this.item().reference,
      this.entry.level()?.state.entry.uiViewKey,
    ),
  );
  protected readonly views = computed(() => {
    const collection = this.collection();
    return collection ? uiEntryRelatedViews(collection, this.entry.language()) : [];
  });
  protected readonly view = computed(
    () =>
      this.views().find((view) => view.key === this.resource()?.viewKey) ??
      this.views().find((view) => view.key === this.collection()?.relatedListView) ??
      this.views()[0],
  );
  protected readonly resource = computed(
    () => this.entry.level()?.data.relatedCollections?.[this.item().reference],
  );
  protected readonly title = computed(() => {
    const collection = this.collection();
    return collection
      ? resolveMetadataText(collection.label, this.entry.language())
      : this.item().reference;
  });
  protected readonly list = computed(() =>
    this.view()
      ? uiEntryRelatedListProjection(this.view()!, this.resource()?.rows ?? [])
      : { columns: [], rows: [] },
  );
  protected readonly references = computed(() => ({
    ...this.entry.level()?.data.references,
    ...this.resource()?.references,
  }));
  protected readonly entityKey = computed(
    () => this.collection()?.relatedEntityKey ?? this.collection()?.entityKey ?? '',
  );
  protected open(row: Readonly<Record<string, unknown>>): void {
    const collection = this.collection();
    const id = row['id'];
    if (collection && typeof id === 'string')
      this.entry.viewRelatedEntry(collection.relatedEntityKey ?? collection.entityKey, id);
  }
}
