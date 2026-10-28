import { Component, computed, inject, input } from '@angular/core';
import { FormField } from '../fields/FormField';
import { uiEntryReadOnlyRepresentation } from '@manatos/shared-ui';
import { EntryContext } from './EntryContext';
import { type EntryLayoutField } from './EntryLayoutItems';

/** Owns one metadata Field slot and its FormField child, retaining the layoutId for duplicate-tab contexts. No Field type switching here. Breakpoint: this component's HTML slot and its input projection. */
@Component({
  selector: 'manatos-entry-layout-field',
  standalone: true,
  imports: [FormField],
  host: { style: 'display: contents' },
  templateUrl: './EntryLayoutFieldComponent.html',
})
export class EntryLayoutFieldComponent {
  readonly item = input.required<EntryLayoutField>();
  protected readonly entry = inject(EntryContext);
  /** Preserve the exact semantic Field identity across duplicate tab presentations. */
  protected readonly fieldPresentation = computed(() => {
    const item = this.item();
    const field = this.entry.field(item.field, item.label);
    return field ? { ...field, layoutId: item.layoutId } : null;
  });
  protected readonly representation = computed(() => {
    const item = this.item();
    const field = this.fieldPresentation();
    return item.representation && item.representation !== 'default' && field
      ? uiEntryReadOnlyRepresentation(
          field,
          item.representation,
          this.entry.level()?.data.current ?? null,
          item.relatedFields,
        )
      : null;
  });
}
