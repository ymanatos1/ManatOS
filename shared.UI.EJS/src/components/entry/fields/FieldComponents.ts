import type { UiEntryFieldHistory, UiEntryFieldPresentation } from '@manatos/shared-ui';
import { BooleanField } from './types/BooleanField.js';
import { DateField } from './types/DateField.js';
import { DatetimeField } from './types/DatetimeField.js';
import { DurationField } from './types/DurationField.js';
import { EmailField } from './types/EmailField.js';
import { EnumField } from './types/EnumField.js';
import { GuidField } from './types/GuidField.js';
import { NumberField } from './types/NumberField.js';
import { PictureField } from './types/PictureField.js';
import { PicturesField } from './types/PicturesField.js';
import { ReferenceField } from './types/ReferenceField.js';
import { RichTextField } from './types/RichTextField.js';
import { TelephoneField } from './types/TelephoneField.js';
import { TextField } from './types/TextField.js';
import { VersionField } from './types/VersionField.js';

import { EntryFieldComponent, type EjsFieldControlDispatch } from './EntryFieldComponent.js';

/** One instance per mounted field; no duplicate Surface or CTX ownership. */
export const entryFieldComponents: ReadonlyMap<
  string,
  new (root: HTMLElement) => EntryFieldComponent
> = new Map<string, new (root: HTMLElement) => EntryFieldComponent>([
  ['boolean', BooleanField],
  ['date', DateField],
  ['datetime', DatetimeField],
  ['duration', DurationField],
  ['email', EmailField],
  ['enum', EnumField],
  ['guid', GuidField],
  ['number', NumberField],
  ['picture', PictureField],
  ['pictures', PicturesField],
  ['reference', ReferenceField],
  ['richText', RichTextField],
  ['telephone', TelephoneField],
  ['string', TextField],
  ['version', VersionField],
]);

const mounted = new WeakMap<HTMLElement, EntryFieldComponent>();

/** Mount only unmounted typed controls; each registered class supplies its own native HTML. */
export function mountEntryFieldControls(
  root: ParentNode,
  dispatch?: EjsFieldControlDispatch,
): void {
  for (const slot of root.querySelectorAll<HTMLElement>('[data-entry-typed-field]')) {
    if (mounted.has(slot)) continue;
    const type = slot.dataset['entryTypedField'];
    const ComponentType = type && entryFieldComponents.get(type);
    if (!ComponentType) continue;
    const component = new ComponentType(slot);
    // Track it before mounting so a partial mount can always be disposed.
    mounted.set(slot, component);
    try {
      component.mount();
      if (dispatch) component.attachControl(dispatch);
    } catch (error) {
      mounted.delete(slot);
      try {
        component.dispose();
      } catch {
        /* preserve the mount error */
      }
      throw error;
    }
  }
}

/** Refresh the field-owned control and accessibility state without re-mounting it. */
export function updateEntryFieldControl(
  root: HTMLElement,
  field: UiEntryFieldPresentation,
  history?: UiEntryFieldHistory,
): void {
  const slot = root.querySelector<HTMLElement>('[data-entry-typed-field]');
  const component = slot && mounted.get(slot);
  if (slot && component) {
    slot.setAttribute('role', 'group');
    slot.setAttribute('aria-label', field.label);
    const control = slot.querySelector<HTMLElement>('[data-entry-control]');
    control?.setAttribute('aria-label', field.label);
    component.prepare(field);
    component.update(field);
    component.updateHistory(history);
    if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) {
      control.readOnly = field.readOnly;
      if (control instanceof HTMLInputElement && control.type === 'checkbox')
        control.disabled = field.readOnly;
    } else if (control instanceof HTMLSelectElement) control.disabled = field.readOnly;
  }
}

/** Dispose each mounted field exactly once when its containing layout is removed. */
export function disposeEntryFieldControls(root: ParentNode): void {
  for (const slot of root.querySelectorAll<HTMLElement>('[data-entry-typed-field]')) {
    const component = mounted.get(slot);
    if (component) {
      // Remove ownership first: a failed cleanup must not poison a retry.
      mounted.delete(slot);
      component.dispose();
    }
  }
}
