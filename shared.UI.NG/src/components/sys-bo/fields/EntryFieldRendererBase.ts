import { Directive, input, type OnChanges } from '@angular/core';
import {
  createUiFieldBehavior,
  type UiFieldBehavior,
  type UiEntryFieldPresentation,
} from '@manatos/shared-ui';

/**
 * One inherited native Field contract for ALL registered Angular Field types.
 * It owns only metadata/Behavior preparation and displayText(). Concrete Field
 * HTML selects the actual native controls; the explicit manatosNativeFieldInteraction
 * directive marks controls whose generic DOM events participate in UIS transport.
 * This base MUST NOT attach DOM listeners, mutate #data.current, or choose a type's
 * layout. @Directive metadata preserves required inputs through NgComponentOutlet.
 */
@Directive()
export abstract class EntryFieldRendererBase implements OnChanges {
  readonly field = input.required<UiEntryFieldPresentation>();
  protected behavior: UiFieldBehavior | null = null;
  private behaviorKey = '';

  ngOnChanges(): void {
    const model = this.field();
    const key = `${model.entityKey}.${model.field}`;
    if (this.behaviorKey !== key) {
      this.behavior = createUiFieldBehavior(model.entityKey, model.field);
      this.behaviorKey = key;
    }
  }

  protected displayText(): string {
    const model = this.field();
    return this.behavior?.formatText(model.value, model.language) ?? model.text;
  }
}
