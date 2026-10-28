import { Component, input, output } from '@angular/core';
import type { UiEntryTab } from '@manatos/shared-ui';
/** Presentation only; Entry runtime remains authoritative for tab state.
 * UIS ownership: the canonical tab navigation and per-tab child mounts; tab visibility is recalculated from metadata and permissions. */
@Component({ selector: 'manatos-entry-tabs', standalone: true, templateUrl: './EntryTabs.html' })
export class EntryTabs {
  readonly tabs = input.required<readonly UiEntryTab[]>();
  readonly active = input.required<string>();
  readonly selected = output<string>();
}
