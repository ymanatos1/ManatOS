import { resolveMetadataText } from '@manatos/shared';
import {
  pictureEditorPolicy,
  type UiEntryFieldHistory,
  type UiEntryFieldPresentation,
} from '@manatos/shared-ui';
import { EntryFieldComponent } from '../EntryFieldComponent.js';

/** Owns scalar-picture controls. The Entry host owns picture resources and CTX edits. */
export class PictureField extends EntryFieldComponent {
  static readonly type = 'picture' as const;
  readonly templateName = 'PictureField';
  constructor(root: HTMLElement) {
    super(root);
  }
  private editable = false;
  private fieldName = '';
  private language = 'EN';
  private releasePicker: ReturnType<typeof setTimeout> | null = null;
  private pickerOpen = false;
  private choosing = false;
  private launchFrame: number | null = null;
  private launchTask: ReturnType<typeof setTimeout> | null = null;
  override mount(): void {
    super.mount();
    this.root.querySelector('[data-picture-choose]')?.addEventListener('click', this.onChoose);
    this.root.querySelector('[data-picture-delete]')?.addEventListener('click', this.onDelete);
    this.root.querySelector('[data-picture-undo]')?.addEventListener('click', this.onUndo);
    this.root.querySelector('[data-picture-redo]')?.addEventListener('click', this.onRedo);
    this.root.querySelector('[data-picture-input]')?.addEventListener('change', this.onChange);
    this.root.querySelector('[data-picture-input]')?.addEventListener('cancel', this.onCancel);
    window.addEventListener('focus', this.onFocusReturned);
  }
  override update(field: UiEntryFieldPresentation): void {
    this.fieldName = field.field;
    this.language = field.language;
    this.editable = !field.readOnly;
    const value = field.value;
    const isPending =
      value !== null &&
      typeof value === 'object' &&
      'id' in value &&
      String(value.id).startsWith('pending:');
    const source = isPending
      ? (this.root.getAttribute('data-picture-pending-source') ?? '')
      : (field.imageUrl ?? '');
    const image = this.root.querySelector<HTMLImageElement>('[data-entry-photo-thumbnail]');
    if (image) {
      if (!source) image.removeAttribute('src');
      else if (image.getAttribute('src') !== source) image.src = source;
      image.hidden = !source;
      image.alt = field.label;
    }
    const empty = this.root.querySelector<HTMLElement>('[data-entry-photo-empty]');
    if (empty) empty.hidden = !!source;
    const choose = this.root.querySelector<HTMLButtonElement>('[data-picture-choose]');
    if (choose) {
      choose.disabled = field.readOnly;
      choose.title =
        field.language === 'EL'
          ? source
            ? 'Κλικ για αντικατάσταση εικόνας'
            : 'Κλικ για επιλογή εικόνας'
          : source
            ? 'Click to replace picture'
            : 'Click to choose picture';
      choose.setAttribute('aria-label', choose.title);
    }
    const remove = this.root.querySelector<HTMLButtonElement>('[data-picture-delete]');
    if (remove) {
      remove.hidden = field.readOnly || !source;
      remove.title = this.language === 'EL' ? 'Διαγραφή εικόνας' : 'Delete picture';
      remove.setAttribute('aria-label', remove.title);
    }
    for (const [selector, english, greek] of [
      ['[data-picture-undo]', 'Undo', 'Αναίρεση'],
      ['[data-picture-redo]', 'Redo', 'Επανάληψη'],
    ]) {
      const button = this.root.querySelector<HTMLButtonElement>(selector);
      if (button) {
        button.title = this.language === 'EL' ? greek : english;
        button.setAttribute('aria-label', button.title);
      }
    }
    const policy = pictureEditorPolicy(field.entityKey, field.field);
    const help = this.root.querySelector<HTMLElement>('[data-picture-help]');
    if (help)
      help.textContent = resolveMetadataText('@CM.PictureHelp', field.language)
        .replace('{maxMb}', String(Math.round(policy.maxSourceBytes / 1_000_000)))
        .replace('{size}', String(policy.outputSize));
    const input = this.root.querySelector<HTMLInputElement>('[data-picture-input]');
    if (input) input.disabled = field.readOnly;
  }
  override updateHistory(history: UiEntryFieldHistory | undefined): void {
    const tools = this.root.querySelector<HTMLElement>('[data-picture-history]');
    if (tools) tools.hidden = !history?.changes.length;
    const undo = this.root.querySelector<HTMLButtonElement>('[data-picture-undo]');
    const redo = this.root.querySelector<HTMLButtonElement>('[data-picture-redo]');
    if (undo) undo.disabled = !this.editable || !history || history.cursor <= 0;
    if (redo)
      redo.disabled = !this.editable || !history || history.cursor >= history.changes.length;
  }
  private emit(action: string, detail: Record<string, unknown> = {}): void {
    this.root.dispatchEvent(
      new CustomEvent('manatos:entry-picture', {
        bubbles: true,
        detail: { field: this.fieldName, action, ...detail },
      }),
    );
  }
  private readonly onChoose = (): void => {
    if (!this.editable || this.choosing) return;
    const input = this.root.querySelector<HTMLInputElement>('[data-picture-input]');
    const busy = this.root.querySelector<HTMLElement>('[data-picture-loading]');
    if (!input) return;
    this.choosing = true;
    if (busy) busy.hidden = false;
    // One rendering opportunity before the blocking OS file chooser.
    this.launchFrame = requestAnimationFrame(() => {
      this.launchFrame = null;
      this.launchTask = setTimeout(() => {
        this.launchTask = null;
        if (!this.root.isConnected || !this.editable || !this.choosing) {
          this.endChoose();
          return;
        }
        input.value = '';
        this.pickerOpen = true;
        try {
          input.click();
        } catch (error) {
          this.endChoose();
          const message = this.root.querySelector<HTMLElement>('[data-picture-error]');
          if (message) {
            message.textContent = error instanceof Error ? error.message : String(error);
            message.hidden = false;
          }
        }
      }, 0);
    });
    this.releasePicker = setTimeout(() => this.endChoose(), 15000);
  };
  private readonly onCancel = (): void => this.endChoose();
  private readonly onFocusReturned = (): void => {
    if (this.pickerOpen)
      setTimeout(() => {
        if (this.pickerOpen) this.endChoose();
      }, 250);
  };
  private endChoose(): void {
    this.pickerOpen = false;
    this.choosing = false;
    if (this.launchFrame !== null) cancelAnimationFrame(this.launchFrame);
    if (this.launchTask !== null) clearTimeout(this.launchTask);
    this.launchFrame = null;
    this.launchTask = null;
    if (this.releasePicker) clearTimeout(this.releasePicker);
    this.releasePicker = null;
    const busy = this.root.querySelector<HTMLElement>('[data-picture-loading]');
    if (busy) busy.hidden = true;
  }
  private readonly onChange = (event: Event): void => {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    this.endChoose();
    if (files.length) this.emit('choose', { files, collection: false });
  };
  private readonly onDelete = (): void => this.emit('remove');
  private readonly onUndo = (): void => this.emit('undo');
  private readonly onRedo = (): void => this.emit('redo');
  override dispose(): void {
    this.endChoose();
    this.root.querySelector('[data-picture-choose]')?.removeEventListener('click', this.onChoose);
    this.root.querySelector('[data-picture-delete]')?.removeEventListener('click', this.onDelete);
    this.root.querySelector('[data-picture-undo]')?.removeEventListener('click', this.onUndo);
    this.root.querySelector('[data-picture-redo]')?.removeEventListener('click', this.onRedo);
    this.root.querySelector('[data-picture-input]')?.removeEventListener('change', this.onChange);
    this.root.querySelector('[data-picture-input]')?.removeEventListener('cancel', this.onCancel);
    window.removeEventListener('focus', this.onFocusReturned);
    super.dispose();
  }
}
