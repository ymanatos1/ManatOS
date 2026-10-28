import { Component, computed, inject, input } from '@angular/core';
import { uiEntrySummaryRows, type UiEntryLayoutItem } from '@manatos/shared-ui';
import { EntryContext } from './EntryContext';

type SummaryItem = Extract<UiEntryLayoutItem, { kind: 'summary' }>;

/** Compact, read-only, metadata-defined summary; values stay in the owning Entry CTX. */
@Component({
  selector: 'manatos-entry-layout-summary',
  standalone: true,
  host: { style: 'display: contents' },
  templateUrl: './EntryLayoutSummaryComponent.html',
})
export class EntryLayoutSummaryComponent {
  readonly item = input.required<SummaryItem>();
  protected readonly entry = inject(EntryContext);
  protected readonly rows = computed(() => {
    const level = this.entry.level();
    return uiEntrySummaryRows(
      this.entry.entityKey(),
      this.item().fields,
      level?.data.current ?? null,
      this.entry.language(),
      level?.data.references ?? {},
    );
  });
}
