import type { UiEmbeddedDispatchResult, UiEmbeddedInteractionEvent } from '../runtime/component.js';

/**
 * Native adapter boundary for all DOM event kinds, including non-bubbling
 * focus/blur events delivered through capture or focusin/focusout.
 * The adapter supplies normalized, non-secret facts and a semantic owner path.
 * A consumed semantic event stops DOM propagation; preventDefault is separate.
 */
export function dispatchUiNativeComponentEvent(
  native: Event,
  ownerPath: string,
  event: UiEmbeddedInteractionEvent,
  dispatch: (path: string, value: UiEmbeddedInteractionEvent) => UiEmbeddedDispatchResult,
): UiEmbeddedDispatchResult {
  const outcome = dispatch(ownerPath, event);
  if (outcome.preventDefault && native.cancelable) native.preventDefault();
  if (outcome.consumed) native.stopPropagation();
  return outcome;
}

/**
 * Normalize a native control event once, at the owning renderer boundary.
 * A native `change` following `input` must not commit the same edit twice.
 * Other DOM events carry only non-sensitive facts and follow semantic ancestry.
 * Credentials MUST use their dedicated Auth native-only policy, never this bridge.
 */
/** Deduplicate native input/change pairs without retaining elements after disposal. */
const recentInput = new WeakMap<Element, string>();

export function uiNativeFieldInteraction(native: Event): UiEmbeddedInteractionEvent | null {
  const target = native.target;
  if (
    !(
      target instanceof HTMLInputElement ||
      target instanceof HTMLSelectElement ||
      target instanceof HTMLTextAreaElement
    ) ||
    !target.hasAttribute('data-entry-control')
  )
    return null;
  if (target instanceof HTMLInputElement && target.type === 'password') return null;
  if (native.type === 'input' || native.type === 'change') {
    const isSelect = target instanceof HTMLSelectElement;
    const isCheck = target instanceof HTMLInputElement && target.type === 'checkbox';
    if (native.type === 'input' && (isSelect || isCheck)) return null;
    if (!isSelect && !isCheck) {
      if (native.type === 'change' && recentInput.get(target) === target.value) return null;
      if (native.type === 'input') recentInput.set(target, target.value);
    }
    const control = isSelect
      ? 'select'
      : isCheck
        ? 'checkbox'
        : target instanceof HTMLInputElement && target.type === 'number'
          ? 'number'
          : 'text';
    return {
      type: 'control-input',
      control,
      value: target.value,
      ...(isCheck && target instanceof HTMLInputElement ? { checked: target.checked } : {}),
    };
  }
  if (typeof KeyboardEvent !== 'undefined' && native instanceof KeyboardEvent)
    return { type: native.type, key: native.key, code: native.code };
  if (
    native.type === 'click' ||
    native.type === 'focusin' ||
    native.type === 'focusout' ||
    native.type === 'pointerdown' ||
    native.type === 'pointerup'
  )
    return { type: native.type };
  return null;
}
