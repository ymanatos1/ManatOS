import { Component, inject, input } from '@angular/core';
import { EntryContext } from './EntryContext';
import { type EntryLayoutDeferred } from './EntryLayoutItems';

/** Owns the unavailable metadata slot. Never invent an editor or mutate CTX because a deferred child is not yet implemented. Breakpoint: this component's HTML slot and its input projection. */
@Component({
  selector: 'manatos-entry-layout-deferred',
  standalone: true,
  host: { style: 'display: contents' },
  templateUrl: './EntryLayoutDeferredComponent.html',
})
export class EntryLayoutDeferredComponent {
  readonly item = input.required<EntryLayoutDeferred>();
  protected readonly entry = inject(EntryContext);
}
