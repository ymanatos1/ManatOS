import { Component, input } from '@angular/core';
import { type UiEntryLayoutItem } from '@manatos/shared-ui';

/** Owns a metadata break in the grid, not field content. Keep its explicit HTML/layout identity to preserve recursive structure. Breakpoint: this component's HTML slot and its input projection. */
@Component({
  selector: 'manatos-entry-layout-break',
  standalone: true,
  host: { style: 'display: contents' },
  templateUrl: './EntryLayoutBreakComponent.html',
})
export class EntryLayoutBreakComponent {
  readonly item = input.required<UiEntryLayoutItem>();
}
