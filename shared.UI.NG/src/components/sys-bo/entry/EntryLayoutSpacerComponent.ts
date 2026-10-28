import { Component, input } from '@angular/core';
import { type UiEntryLayoutItem } from '@manatos/shared-ui';

/** Owns a metadata spacer and its grid placement; never convert spacing into an anonymous host-only node. Breakpoint: this component's HTML slot and its input projection. */
@Component({
  selector: 'manatos-entry-layout-spacer',
  standalone: true,
  host: { style: 'display: contents' },
  templateUrl: './EntryLayoutSpacerComponent.html',
})
export class EntryLayoutSpacerComponent {
  readonly item = input.required<UiEntryLayoutItem>();
}
