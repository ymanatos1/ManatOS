import { Component, computed, input } from '@angular/core';
import { createUiFieldBehavior, type UiEntryFieldPresentation } from '@manatos/shared-ui';
import { FieldToolsMenu } from './FieldToolsMenu';

/**
 * Presentation-only frame: hosts a typed Field's projected native control and
 * its optional Tools component. Concrete Field templates own their native controls and opt explicitly into
 * NativeFieldInteraction only where they have value-bearing controls. This
 * shell must not intercept events, select Field types, or mutate #data.current.
 */
@Component({
  selector: 'manatos-field-control-shell',
  standalone: true,
  imports: [FieldToolsMenu],
  templateUrl: './FieldControlShell.html',
})
export class FieldControlShell {
  readonly field = input.required<UiEntryFieldPresentation>();
  protected readonly hasTools = computed(
    () =>
      createUiFieldBehavior(this.field().entityKey, this.field().field).control.tools.length > 0,
  );
}
