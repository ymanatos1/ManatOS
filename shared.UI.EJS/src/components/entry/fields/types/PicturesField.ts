import { EntryFieldComponent } from '../EntryFieldComponent.js';
import type { UiEntryFieldPresentation } from '@manatos/shared-ui';

/** Collection picture controls and ordering gestures; CTX and bytes are Entry-owned. */
export class PicturesField extends EntryFieldComponent {
  static readonly type = 'pictures' as const;
  readonly templateName = 'PicturesField';
  private editable = false;
  private fieldName = '';
  private current: readonly Record<string, unknown>[] = [];
  private releasePicker: ReturnType<typeof setTimeout> | null = null;
  private pickerOpen = false;
  private choosing = false;
  private launchFrame: number | null = null;
  private launchTask: ReturnType<typeof setTimeout> | null = null;
  constructor(root: HTMLElement) {
    super(root);
  }
  override mount(): void {
    super.mount();
    this.root.addEventListener('click', this.onClick);
    this.root.addEventListener('dragstart', this.onDragStart);
    this.root.addEventListener('dragover', this.onDragOver);
    this.root.addEventListener('drop', this.onDrop);
    this.root.querySelector('[data-picture-input]')?.addEventListener('change', this.onChange);
    this.root.querySelector('[data-picture-input]')?.addEventListener('cancel', this.onCancel);
    window.addEventListener('focus', this.onFocusReturned);
  }
  override update(field: UiEntryFieldPresentation): void {
    this.fieldName = field.field;
    this.editable = !field.readOnly;
    this.current = Array.isArray(field.value)
      ? field.value.filter(
          (v): v is Record<string, unknown> =>
            v !== null && typeof v === 'object' && !Array.isArray(v),
        )
      : [];
    const list = this.root.querySelector<HTMLElement>('[data-pictures-items]');
    if (list) {
      list.replaceChildren();
      this.current.forEach((picture, index) => {
        const item = document.createElement('div');
        item.className = 'manatos-pictures-item';
        item.dataset.pictureIndex = String(index);
        item.draggable = this.editable;
        const preview = document.createElement('img');
        preview.dataset.pictureItemImage = String(index);
        preview.alt = field.label;
        preview.loading = 'lazy';
        const recordId = this.root
          .closest<HTMLElement>('[data-entry-page-host]')
          ?.getAttribute('data-entry-record-id');
        if (!picture.pending && picture.id && recordId) {
          preview.src = `/_manatos/auth/resources/pictures/${encodeURIComponent(field.entityKey)}/${encodeURIComponent(recordId)}/${encodeURIComponent(field.field)}/${encodeURIComponent(String(picture.id))}?revision=${encodeURIComponent(String(picture.revision ?? ''))}`;
        }
        item.append(preview);
        if (this.editable) {
          for (const [action, icon, label, disabled] of [
            ['remove', 'bi-trash', 'Remove picture', false],
            ['left', 'bi-arrow-left', 'Move picture left', index === 0],
            ['right', 'bi-arrow-right', 'Move picture right', index === this.current.length - 1],
          ] as const) {
            const button = document.createElement('button');
            button.type = 'button';
            button.dataset.pictureAction = action;
            button.title = label;
            button.setAttribute('aria-label', label);
            button.disabled = disabled;
            button.innerHTML = `<i class="bi ${icon}" aria-hidden="true"></i>`;
            item.append(button);
          }
        }
        list.append(item);
      });
    }
    const add = this.root.querySelector<HTMLButtonElement>('[data-picture-choose]');
    if (add) add.hidden = !this.editable;
  }
  private emit(action: string, detail: Record<string, unknown> = {}): void {
    this.root.dispatchEvent(
      new CustomEvent('manatos:entry-picture', {
        bubbles: true,
        detail: { field: this.fieldName, action, ...detail },
      }),
    );
  }
  private readonly onClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element) || !this.editable) return;
    if (target.closest('[data-picture-choose]')) {
      if (this.choosing) return;
      const input = this.root.querySelector<HTMLInputElement>('[data-picture-input]');
      if (!input) return;
      const busy = this.root.querySelector<HTMLElement>('[data-picture-loading]');
      this.choosing = true;
      if (busy) busy.hidden = false;
      this.launchFrame = requestAnimationFrame(() => {
        this.launchFrame = null;
        this.launchTask = setTimeout(() => {
          this.launchTask = null;
          if (!this.root.isConnected || !this.editable || !this.choosing) {
            this.onCancel();
            return;
          }
          this.pickerOpen = true;
          input.value = '';
          try {
            input.click();
          } catch (error) {
            this.onCancel();
            const message = this.root.querySelector<HTMLElement>('[data-picture-error]');
            if (message) {
              message.textContent = error instanceof Error ? error.message : String(error);
              message.hidden = false;
            }
          }
        }, 0);
      });
      this.releasePicker = setTimeout(() => this.onCancel(), 15000);
      return;
    }
    const button = target.closest<HTMLButtonElement>('[data-picture-action]');
    const item = button?.closest<HTMLElement>('[data-picture-index]');
    if (!button || !item || button.disabled) return;
    const index = Number(item.dataset.pictureIndex);
    if (!Number.isInteger(index)) return;
    if (button.dataset.pictureAction === 'remove') this.emit('remove', { index });
    else
      this.emit('move', {
        from: index,
        to: index + (button.dataset.pictureAction === 'left' ? -1 : 1),
      });
  };
  private readonly onDragStart = (event: DragEvent): void => {
    const item = (event.target as Element)?.closest<HTMLElement>('[data-picture-index]');
    if (!this.editable || !item || !event.dataTransfer) return;
    event.dataTransfer.setData('text/plain', item.dataset.pictureIndex ?? '');
    event.dataTransfer.effectAllowed = 'move';
  };
  private readonly onDragOver = (event: DragEvent): void => {
    if (this.editable) event.preventDefault();
  };
  private readonly onDrop = (event: DragEvent): void => {
    if (!this.editable) return;
    event.preventDefault();
    const item = (event.target as Element)?.closest<HTMLElement>('[data-picture-index]');
    const from = Number(event.dataTransfer?.getData('text/plain'));
    const to = Number(item?.dataset.pictureIndex);
    if (item && Number.isInteger(from) && Number.isInteger(to)) this.emit('move', { from, to });
  };
  private readonly onChange = (event: Event): void => {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    this.onCancel();
    if (files.length) this.emit('choose', { files, collection: true });
  };
  private readonly onFocusReturned = (): void => {
    if (!this.pickerOpen) return;
    setTimeout(() => {
      if (this.pickerOpen) this.onCancel();
    }, 250);
  };
  private readonly onCancel = (): void => {
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
  };
  override dispose(): void {
    this.root.removeEventListener('click', this.onClick);
    this.root.removeEventListener('dragstart', this.onDragStart);
    this.root.removeEventListener('dragover', this.onDragOver);
    this.root.removeEventListener('drop', this.onDrop);
    this.root.querySelector('[data-picture-input]')?.removeEventListener('change', this.onChange);
    this.root.querySelector('[data-picture-input]')?.removeEventListener('cancel', this.onCancel);
    window.removeEventListener('focus', this.onFocusReturned);
    this.onCancel();
    super.dispose();
  }
}
