import { uiEntryFieldTools, type UiEntryFieldPresentation } from '../entry/EntryMetadata.js';
import { createUiFieldBehavior } from './registry.js';

/** Platform adapters own only the overlay portal and the semantic Entry command. */
export interface UiFieldToolsAdapter {
  mountOverlay(menu: HTMLElement, anchor: HTMLButtonElement, dismiss: () => void): () => void;
  perform(action: string): void;
  /** NG1 uses Entry's existing open-field signal; EJS1 uses the component's local state. */
  toggle?(nextOpen: boolean): void;
  dismissed?(): void;
}

const commonAction = (id: string): boolean =>
  id === 'copy' || id === 'revert' || id === 'inspect-ctx';

/** The *only* FieldTools DOM/button/menu renderer and click/keyboard handler.
 * Both Angular and EJS mount this same component into the concrete Field's slot.
 * It never owns a CTX node, a Field value, or Entry authorization state. */
export class UiFieldToolsView {
  private readonly root: HTMLSpanElement;
  private readonly button: HTMLButtonElement;
  private readonly icon: HTMLElement;
  private readonly menu: HTMLSpanElement;
  private release: (() => void) | null = null;
  private open = false;
  private field: UiEntryFieldPresentation | null = null;
  private actions = new Set<string>();

  constructor(
    private readonly slot: HTMLElement,
    private readonly adapter: UiFieldToolsAdapter,
  ) {
    const document = slot.ownerDocument;
    this.root = document.createElement('span');
    this.root.className = 'manatos-field-tools';
    this.button = document.createElement('button');
    this.button.type = 'button';
    this.button.className = 'manatos-field-tool-toggle manatos-form-leading';
    this.button.dataset['entryFieldTools'] = '';
    this.button.setAttribute('aria-expanded', 'false');
    this.button.setAttribute('aria-haspopup', 'menu');
    this.icon = document.createElement('i');
    this.icon.setAttribute('aria-hidden', 'true');
    this.button.append(this.icon);
    this.menu = document.createElement('span');
    this.menu.className = 'manatos-field-tool-menu';
    this.menu.setAttribute('role', 'menu');
    this.menu.hidden = true;
    this.root.append(this.button, this.menu);
    this.slot.append(this.root);
    this.button.addEventListener('click', this.onToggle);
    this.menu.addEventListener('click', this.onMenuClick);
  }

  /** Recompute from the authoritative Field presentation, not DOM state. */
  update(field: UiEntryFieldPresentation, inspectorAllowed: boolean): void {
    this.field = field;
    const policy = createUiFieldBehavior(field.entityKey, field.field).control;
    if (!policy.tools.length) {
      this.setOpen(false);
      this.actions.clear();
      this.root.hidden = true;
      return;
    }
    this.root.hidden = false;
    this.icon.className = `bi bi-${policy.icon}`;
    this.button.setAttribute('aria-label', `Field tools: ${field.label}`);
    const document = this.menu.ownerDocument;
    const children: HTMLElement[] = [];
    this.actions.clear();
    let preceding: string | null = null;
    for (const action of uiEntryFieldTools(field, { inspectCtx: true })) {
      if (action.visible === false || (action.id === 'inspect-ctx' && !inspectorAllowed)) continue;
      if (
        preceding &&
        (action.id === 'inspect-ctx' || (commonAction(preceding) && !commonAction(action.id)))
      ) {
        const divider = document.createElement('span');
        divider.className = 'manatos-field-tool-divider';
        divider.setAttribute('role', 'separator');
        children.push(divider);
      }
      const item = document.createElement('button');
      item.type = 'button';
      item.setAttribute('role', 'menuitem');
      item.dataset['entryFieldAction'] = action.id;
      item.disabled = !action.enabled || (action.id === 'edit' && field.canEditRelated !== true);
      if (!item.disabled) this.actions.add(action.id);
      const icon = document.createElement('i');
      icon.className = `bi bi-${action.icon}`;
      icon.setAttribute('aria-hidden', 'true');
      item.append(icon, document.createTextNode(` ${action.label}`));
      children.push(item);
      preceding = action.id;
    }
    this.menu.replaceChildren(...children);
  }

  /** The current shared policy is authoritative even for adapter callbacks. */
  allows(action: string): boolean {
    return this.actions.has(action);
  }

  /** A single open/close and overlay lifecycle for all supported Fields. */
  setOpen(next: boolean): void {
    if (this.open === next) return;
    this.open = next;
    this.button.setAttribute('aria-expanded', String(next));
    if (!next) {
      this.release?.();
      this.release = null;
      this.menu.hidden = true;
      return;
    }
    if (!this.field || this.root.hidden) {
      this.open = false;
      this.button.setAttribute('aria-expanded', 'false');
      return;
    }
    this.menu.hidden = false;
    this.release = this.adapter.mountOverlay(this.menu, this.button, () => {
      this.setOpen(false);
      this.adapter.dismissed?.();
    });
  }

  private readonly onToggle = (event: MouseEvent): void => {
    event.stopPropagation();
    if (this.adapter.toggle) this.adapter.toggle(!this.open);
    else this.setOpen(!this.open);
  };

  private readonly onMenuClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const action = target.closest<HTMLButtonElement>('[data-entry-field-action]');
    if (!action || action.disabled || !this.menu.contains(action)) return;
    event.stopPropagation();
    const id = action.dataset['entryFieldAction'];
    if (!id || !this.allows(id)) return;
    this.setOpen(false);
    this.adapter.dismissed?.();
    this.adapter.perform(id);
  };

  dispose(): void {
    this.setOpen(false);
    this.button.removeEventListener('click', this.onToggle);
    this.menu.removeEventListener('click', this.onMenuClick);
    this.root.remove();
  }
}
