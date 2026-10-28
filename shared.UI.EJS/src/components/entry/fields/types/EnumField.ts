import { EntryFieldComponent } from '../EntryFieldComponent.js';
import { EjsTransientMenus } from '../../../../runtime/transient-menu.js';
import { renderNativeComponent } from '../../../native-template.js';
import type { UiEntryFieldPresentation } from '@manatos/shared-ui';

/** The native select remains the sole event source; rich option buttons provide
 * metadata icons and captions and forward one normalized change through it.
 */
export class EnumField extends EntryFieldComponent {
  static readonly type = 'enum' as const;
  readonly templateName = 'EnumField';
  private readOnly = true;
  private menuElement: HTMLElement | null = null;
  private readonly onPortalClick = (event: MouseEvent): void => {
    if (!this.root.contains(event.target as Node)) this.onClick(event);
  };
  constructor(root: HTMLElement) {
    super(root);
  }
  override mount(): void {
    super.mount();
    this.root.addEventListener('click', this.onClick);
    this.root.addEventListener('keydown', this.onKeydown);
    this.menuElement = this.root.querySelector<HTMLElement>('[data-entry-enum-menu]');
    this.menuElement?.addEventListener('click', this.onPortalClick);
  }
  private readonly onKeydown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return;
    this.toggleMenu(false);
  };
  private toggleMenu(open: boolean): void {
    const menu = this.menuElement;
    const trigger = this.root.querySelector<HTMLButtonElement>('[data-entry-enum-trigger]');
    if (!menu || !trigger) return;
    const coordinator = EjsTransientMenus.forDocument(this.root.ownerDocument);
    if (open && !this.readOnly) {
      menu.hidden = false;
      coordinator.open(menu, trigger, this.root, () => {
        menu.hidden = true;
        trigger.setAttribute('aria-expanded', 'false');
      });
    } else {
      if (coordinator.isOpen(menu)) coordinator.close();
      menu.hidden = true;
    }
    trigger.setAttribute('aria-expanded', String(open && !this.readOnly));
  }
  private readonly onClick = (event: MouseEvent): void => {
    if (this.readOnly) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const trigger = target.closest('[data-entry-enum-trigger]');
    if (trigger) {
      this.toggleMenu(
        !EjsTransientMenus.forDocument(this.root.ownerDocument).isOpen(this.menuElement!),
      );
      return;
    }
    const choice = target.closest<HTMLButtonElement>('[data-entry-enum-choice]');
    if (!choice) return;
    const select = this.root.querySelector<HTMLSelectElement>('select[data-entry-control]');
    if (!select) return;
    const value = choice.dataset['entryEnumChoice'] ?? '';
    if (Array.from(select.options).some((option) => option.value === value)) {
      this.toggleMenu(false);
      if (select.value !== value) {
        select.value = value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  };
  override update(field: UiEntryFieldPresentation): void {
    this.readOnly = field.readOnly || !field.options?.length;
    const select = this.root.querySelector<HTMLSelectElement>('select[data-entry-control]');
    const trigger = this.root.querySelector<HTMLButtonElement>('[data-entry-enum-trigger]');
    const current = this.root.querySelector<HTMLElement>('[data-entry-enum-current]');
    const menu = this.menuElement;
    if (!select || !trigger || !current || !menu) return;
    const options = field.options ?? [];
    const selected = String(field.value ?? '');
    const signature = JSON.stringify(options);
    if (select.dataset['optionSignature'] !== signature) {
      select.innerHTML = [
        renderNativeComponent('EntryEnumOption', { Value: '', Label: '—' }),
        ...options.map((item) =>
          renderNativeComponent('EntryEnumOption', { Value: item.value, Label: item.label }),
        ),
      ].join('');
      select.dataset['optionSignature'] = signature;
      menu.replaceChildren();
      for (const item of options) {
        const button = menu.ownerDocument.createElement('button');
        button.type = 'button';
        button.setAttribute('role', 'option');
        button.className = 'manatos-enum-choice';
        button.dataset['entryEnumChoice'] = item.value;
        if (item.icon && /^[a-z][a-z0-9-]*$/.test(item.icon)) {
          const icon = menu.ownerDocument.createElement('i');
          icon.className = `bi bi-${item.icon}`;
          icon.setAttribute('aria-hidden', 'true');
          button.append(icon);
        }
        const text = menu.ownerDocument.createElement('span');
        text.textContent = item.label;
        button.append(text);
        menu.append(button);
      }
    }
    select.value = selected;
    select.disabled = this.readOnly;
    trigger.disabled = this.readOnly;
    trigger.setAttribute('aria-label', field.label);
    current.replaceChildren();
    const choice = options.find((item) => item.value === selected);
    if (choice?.icon && /^[a-z][a-z0-9-]*$/.test(choice.icon)) {
      const icon = current.ownerDocument.createElement('i');
      icon.className = `bi bi-${choice.icon}`;
      icon.setAttribute('aria-hidden', 'true');
      current.append(icon);
    }
    const text = current.ownerDocument.createElement('span');
    text.textContent = choice?.label ?? '—';
    current.append(text);
    for (const button of menu.querySelectorAll<HTMLButtonElement>('[data-entry-enum-choice]'))
      button.setAttribute('aria-selected', String(button.dataset['entryEnumChoice'] === selected));
    if (this.readOnly) this.toggleMenu(false);
  }
  override dispose(): void {
    this.root.removeEventListener('click', this.onClick);
    this.root.removeEventListener('keydown', this.onKeydown);
    if (this.menuElement) {
      const coordinator = EjsTransientMenus.forDocument(this.root.ownerDocument);
      if (coordinator.isOpen(this.menuElement)) coordinator.close();
      this.menuElement.removeEventListener('click', this.onPortalClick);
    }
    this.menuElement = null;
    super.dispose();
  }
}
