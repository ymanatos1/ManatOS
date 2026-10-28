import { dispatchUiNativeComponentEvent, uiNativeFieldInteraction } from '@manatos/shared-ui';
import { mountFieldToolsMenu, disposeFieldToolsMenu } from './FieldToolsMenu.js';
import {
  createUiFieldBehavior,
  type UiFieldBehavior,
  type UiEntryFieldPresentation,
  type UiEntryFieldHistory,
  type UiEmbeddedInteractionEvent,
  type UiEmbeddedDispatchResult,
} from '@manatos/shared-ui';

/**
 * EJS typed Field renderer and native-input boundary.
 * Mounted Fields own their DOM listeners and prepared behavior; the Entry
 * Surface owns semantic effects and #data.current mutations.
 */
export type EjsFieldControlDispatch = (
  field: string,
  event: UiEmbeddedInteractionEvent,
  layoutId?: string,
  tabIndex?: number,
) => UiEmbeddedDispatchResult;

/** Shared EJS Field mount, normalizer and cleanup. Concrete Fields select and
 * update their controls; the concrete Field templates explicitly own the
 * FieldTools slot. FormField owns only the label and outer layout. */
export abstract class EntryFieldComponent {
  abstract readonly templateName: string;
  protected behavior: UiFieldBehavior | null = null;
  private behaviorKey = '';
  private field: UiEntryFieldPresentation | null = null;
  private dispatcher: EjsFieldControlDispatch | null = null;
  protected constructor(protected readonly root: HTMLElement) {}

  /** Each typed instance owns one metadata-prepared Behavior; no per-render lookup. */
  prepare(field: UiEntryFieldPresentation): void {
    this.field = field;
    // Render the child once inside this concrete Field's declared HTML slot.
    // FormField never creates tools or owns their state.
    const slot = this.root.querySelector<HTMLElement>('[data-entry-field-tools-slot]');
    if (slot) mountFieldToolsMenu(slot, field);
    const key = `${field.entityKey}.${field.field}`;
    if (this.behaviorKey !== key) {
      this.behavior = createUiFieldBehavior(field.entityKey, field.field);
      this.behaviorKey = key;
    }
  }

  protected displayText(field: UiEntryFieldPresentation): string {
    return this.behavior?.formatText(field.value, field.language) ?? field.text;
  }

  mount(): void {
    const template = document.querySelector<HTMLTemplateElement>(
      `template[data-manatos-field-template="${this.templateName}"]`,
    );
    if (!template) throw new Error(`Missing EJS Field template: ${this.templateName}`);
    this.root.appendChild(template.content.cloneNode(true));
  }

  abstract update(field: UiEntryFieldPresentation): void;

  /** The Entry runtime owns history; concrete Fields own their action controls. */
  updateHistory(_history: UiEntryFieldHistory | undefined): void {
    // Future typed fields may opt in without duplicating CTX history.
    void _history;
  }

  /** A composite Field can project a single canonical event from native parts. */
  protected nativeInteraction(native: Event): UiEmbeddedInteractionEvent | null {
    return uiNativeFieldInteraction(native);
  }

  /** Listen within this Field only; parents never decode field-type input. */
  attachControl(dispatch: EjsFieldControlDispatch): void {
    if (this.dispatcher) throw new Error('EJS Field input listener already attached.');
    this.dispatcher = dispatch;
    this.root.addEventListener('input', this.onInput);
    this.root.addEventListener('change', this.onInput);
    for (const name of [
      'keydown',
      'keyup',
      'click',
      'focusin',
      'focusout',
      'pointerdown',
      'pointerup',
    ])
      this.root.addEventListener(name, this.onInput);
  }

  private readonly onInput = (native: Event): void => {
    const field = this.field;
    if (!field || !this.dispatcher) return;
    const facts = this.nativeInteraction(native);
    if (!facts || (facts.type === 'control-input' && field.readOnly)) return;
    const tab = this.root.closest<HTMLElement>('[data-entry-tab-index]');
    const index = tab ? Number(tab.dataset['entryTabIndex']) : NaN;
    dispatchUiNativeComponentEvent(
      native,
      field.field,
      facts,
      (_target, event) =>
        this.dispatcher?.(
          field.field,
          event,
          field.layoutId,
          Number.isInteger(index) && index >= 0 ? index : undefined,
        ) ?? {
          handled: false,
          consumed: false,
          preventDefault: false,
          effects: [],
        },
    );
  };

  dispose(): void {
    this.root.removeEventListener('input', this.onInput);
    this.root.removeEventListener('change', this.onInput);
    for (const name of [
      'keydown',
      'keyup',
      'click',
      'focusin',
      'focusout',
      'pointerdown',
      'pointerup',
    ])
      this.root.removeEventListener(name, this.onInput);
    const slot = this.root.querySelector<HTMLElement>('[data-entry-field-tools-slot]');
    if (slot) disposeFieldToolsMenu(slot);
    this.dispatcher = null;
    this.field = null;
    this.behavior = null;
    this.behaviorKey = '';
  }
}
