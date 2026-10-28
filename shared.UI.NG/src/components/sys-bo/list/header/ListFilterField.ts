import { Component, inject, input } from '@angular/core';
import { ListContext } from '../ListContext';

/** One List filter Field owns its native label, options, value and control dispatch.
 * Canonical filtering remains with ListFilterFieldEmbedded / ListPageRuntime.
 */
/** UIS ownership: one named filter input/selection and its validated field-change intent. */
@Component({
  selector: 'manatos-list-filter-field',
  standalone: true,
  host: { style: 'display: contents' },
  templateUrl: './ListFilterField.html',
})
export class ListFilterField {
  readonly filter = input.required<ReturnType<ListContext['filterFields']>[number]>();
  protected readonly context = inject(ListContext);

  protected change(event: Event): void {
    const control = event.target;
    if (control instanceof HTMLSelectElement || control instanceof HTMLInputElement)
      this.context.dispatchControl('list-filter-field', control.value, this.filter().field);
  }
}
