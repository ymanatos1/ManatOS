import { UiSimpleFieldBehavior } from '../field-types.js';

/** Behavior display skeleton for EJS0's canonical guid field component.
 * UIS FieldBehavior: Owns GUID value formatting and validation, not the Entry Field identity or DOM node declarations. Never relocate semantic child composition to this policy object. */
export class GuidFieldBehavior extends UiSimpleFieldBehavior {
  readonly type = 'guid' as const;
  override readonly control = {
    input: 'none',
    semantic: true,
    tools: [],
    icon: 'fingerprint',
  } as const;
}
