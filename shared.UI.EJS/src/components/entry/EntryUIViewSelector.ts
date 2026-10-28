import { uiEntryUIViewOptions, type UiEntryUIViewOption } from '@manatos/shared-ui';
import type { MetadataLanguage } from '@manatos/shared';

export interface MountedEntryUIViewSelector {
  readonly element: HTMLElement;
  refresh(): void;
  dispose(): void;
}

/** Native EJS adapter. The Entry runtime alone owns the selected UI view. */
export function mountEntryUIViewSelector(
  host: HTMLElement,
  entityKey: string,
  language: () => MetadataLanguage,
  selection: () => { key: string; mode: 'view' | 'edit' | 'create'; busy?: boolean },
  select: (key: string) => void | Promise<void>,
): MountedEntryUIViewSelector {
  const doc = host.ownerDocument;
  const element = doc.createElement('div');
  element.className = 'manatos-entry-ui-view-selector';
  const trigger = doc.createElement('button');
  trigger.type = 'button';
  trigger.className = 'manatos-entry-ui-view-trigger';
  trigger.setAttribute('aria-haspopup', 'true');
  trigger.setAttribute('aria-expanded', 'false');
  const icon = doc.createElement('i');
  icon.className = 'bi bi-grid';
  icon.setAttribute('aria-hidden', 'true');
  const label = doc.createElement('span');
  const chevron = doc.createElement('i');
  chevron.className = 'bi bi-chevron-down';
  chevron.setAttribute('aria-hidden', 'true');
  trigger.append(icon, label, chevron);
  const menu = doc.createElement('div');
  menu.className = 'manatos-entry-ui-view-menu';
  menu.setAttribute('role', 'group');
  const errorNode = doc.createElement('span');
  errorNode.className = 'manatos-entry-ui-view-error';
  errorNode.setAttribute('role', 'alert');
  errorNode.hidden = true;
  element.append(errorNode);
  menu.hidden = true;
  element.append(trigger, menu);
  host.append(element);
  const dismiss = (): void => {
    menu.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
  };
  let disposed = false;
  let renderedSignature = '';
  const refresh = (): void => {
    if (disposed) return;
    const current = selection();
    const views: readonly UiEntryUIViewOption[] = uiEntryUIViewOptions(
      entityKey,
      current.key,
      current.mode,
      language(),
    );
    trigger.disabled = current.busy === true;
    if (current.busy) dismiss();
    const signature = JSON.stringify([current.key, views, current.busy === true, language()]);
    if (signature === renderedSignature) return;
    renderedSignature = signature;
    const name = views.find((view) => view.key === current.key)?.label ?? current.key;
    label.textContent = `${language() === 'EL' ? 'Προβολή' : 'View'} (${name})`;
    menu.replaceChildren();
    for (const view of views) {
      const button = doc.createElement('button');
      button.type = 'button';
      button.textContent = view.label;
      button.disabled = current.busy === true || !view.available;
      button.setAttribute('aria-pressed', String(view.key === current.key));
      button.addEventListener('click', () => {
        dismiss();
        // Acknowledgment may be asynchronous (Angular); do not clear a pending
        // error or claim success before the shared transition Promise settles.
        void (async () => {
          try {
            await select(view.key);
            errorNode.hidden = true;
            errorNode.textContent = '';
          } catch (error) {
            errorNode.textContent = error instanceof Error ? error.message : String(error);
            errorNode.hidden = false;
          } finally {
            refresh();
          }
        })();
      });
      menu.append(button);
    }
  };
  trigger.addEventListener('click', () => {
    if (selection().busy) return;
    if (menu.hidden) refresh();
    menu.hidden = !menu.hidden;
    trigger.setAttribute('aria-expanded', String(!menu.hidden));
  });
  const outside = (event: MouseEvent): void => {
    if (event.target instanceof Node && !element.contains(event.target)) dismiss();
  };
  const escape = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') dismiss();
  };
  doc.addEventListener('click', outside);
  doc.addEventListener('keydown', escape);
  refresh();
  return {
    element,
    refresh,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      doc.removeEventListener('click', outside);
      doc.removeEventListener('keydown', escape);
      element.remove();
    },
  };
}
