import { Component, computed, input } from '@angular/core';
import { NgComponentOutlet } from '@angular/common';
import { createUiFieldBehavior } from '@manatos/shared-ui';
import { ngEntryFieldRegistry } from './FieldComponentRegistry';
import type { UiEntryFieldPresentation } from '@manatos/shared-ui';
/** Canonical form label/control wrapper; typed controls own their presentations.
 * UIS ownership: the field label/container and mounted typed control; the Field child, not FormField, owns tools and decoding. */
@Component({
  selector: 'manatos-form-field',
  standalone: true,
  imports: [NgComponentOutlet],
  templateUrl: './FormField.html',
})
export class FormField {
  readonly field = input.required<UiEntryFieldPresentation>();
  readonly changed = input(false);
  /** Registry resolution is the only type-selection step in this adapter. */
  protected readonly controlType = computed(() => {
    const type = ngEntryFieldRegistry.get(this.field().type);
    if (!type) throw new Error(`Unregistered Angular Field: ${this.field().type}`);
    return type;
  });
  protected readonly componentInputs = computed(() => ({ field: this.field() }));
  protected readonly policy = computed(
    () => createUiFieldBehavior(this.field().entityKey, this.field().field).control,
  );
}
