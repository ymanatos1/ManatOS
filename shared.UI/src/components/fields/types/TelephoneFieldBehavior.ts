import { UiSimpleFieldBehavior } from '../field-types.js';

/** Behavior display skeleton for EJS0's canonical telephone field component.
 * UIS FieldBehavior: Defines telephone formatting/validation independently of the native input and link presentation. Never relocate semantic child composition to this policy object. */
export class TelephoneFieldBehavior extends UiSimpleFieldBehavior {
  readonly type = 'telephone' as const;
  override readonly editable = true;
  override readonly control = {
    input: 'text',
    semantic: false,
    tools: ['copy', 'revert', 'inspect-ctx', 'trim', 'clear'],
    icon: 'telephone',
  } as const;
}
