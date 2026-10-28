import { Component, forwardRef, input } from '@angular/core';
import { EntryLayout } from './EntryLayout';
import { type EntryLayoutGroup } from './EntryLayoutItems';

/** Owns a first-class recursive group; EntryLayout is a child, not a generic host renderer flattening nested items. Breakpoint: this component's HTML slot and its input projection. */
@Component({
  selector: 'manatos-entry-layout-group',
  standalone: true,
  imports: [forwardRef(() => EntryLayout)],
  host: { style: 'display: contents' },
  templateUrl: './EntryLayoutGroupComponent.html',
})
export class EntryLayoutGroupComponent {
  readonly item = input.required<EntryLayoutGroup>();
}
