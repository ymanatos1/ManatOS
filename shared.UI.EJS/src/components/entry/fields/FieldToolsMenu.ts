import {
  createUiFieldBehavior,
  UiFieldToolsView,
  type UiEntryFieldPresentation,
} from '@manatos/shared-ui';
import { EjsTransientMenus } from '../../../runtime/transient-menu.js';

const mounted = new WeakMap<HTMLElement, UiFieldToolsView>();

/** EJS1 lifecycle/overlay adapter; all FieldTools markup and interactions are
 * implemented by the identical shared component used in NG1. */
export function mountFieldToolsMenu(slot: HTMLElement, field: UiEntryFieldPresentation): void {
  if (
    mounted.has(slot) ||
    !createUiFieldBehavior(field.entityKey, field.field).control.tools.length
  )
    return;
  const coordinator = EjsTransientMenus.forDocument(slot.ownerDocument);
  const view = new UiFieldToolsView(slot, {
    mountOverlay: (menu, anchor, dismiss) => {
      coordinator.open(menu, anchor, slot, dismiss);
      return () => {
        if (coordinator.isOpen(menu)) coordinator.close();
      };
    },
    perform: (action) => {
      slot.dispatchEvent(
        new CustomEvent('manatos:entry-field-tool', {
          bubbles: true,
          detail: { field: field.field, action },
        }),
      );
    },
  });
  mounted.set(slot, view);
  view.update(field, false);
}

export function updateFieldToolAvailability(
  fieldNode: HTMLElement,
  model: UiEntryFieldPresentation,
  inspectAllowed = false,
): void {
  const slot = fieldNode.querySelector<HTMLElement>('[data-entry-field-tools-slot]');
  if (slot) mounted.get(slot)?.update(model, inspectAllowed);
}

export function disposeFieldToolsMenu(slot: HTMLElement): void {
  mounted.get(slot)?.dispose();
  mounted.delete(slot);
}

export function dismissFieldTools(element: HTMLElement): void {
  const coordinator = EjsTransientMenus.forDocument(element.ownerDocument);
  const menu = coordinator.panelFor(element, '.manatos-field-tool-menu');
  if (menu && coordinator.isOpen(menu)) coordinator.close();
}

/** Delegate only semantic Entry actions; visual/menu ownership is shared.UI. */
export function performFieldToolAction(
  fieldName: string,
  actionId: string,
  element: HTMLElement,
  dismiss: () => void,
  perform: (field: string, action: string) => Promise<string | null>,
  inspect?: (field: string) => void,
): void {
  const fieldNode = Array.from(element.querySelectorAll<HTMLElement>('[data-entry-field]')).find(
    (item) => item.dataset['entryField'] === fieldName,
  );
  const slot = fieldNode?.querySelector<HTMLElement>('[data-entry-field-tools-slot]');
  if (!slot || !mounted.get(slot)?.allows(actionId)) return;
  if (['select', 'view', 'add'].includes(actionId)) {
    const reference = Array.from(element.querySelectorAll<HTMLElement>('[data-entry-field]'))
      .find((item) => item.dataset['entryField'] === fieldName)
      ?.querySelector<HTMLElement>('[data-entry-typed-field="reference"]');
    if (actionId === 'select')
      reference?.dispatchEvent(
        new CustomEvent('manatos:reference-browse', {
          bubbles: true,
          detail: { field: fieldName },
        }),
      );
    else if (actionId === 'add')
      reference?.dispatchEvent(
        new CustomEvent('manatos:reference-create', {
          bubbles: true,
          detail: { field: fieldName },
        }),
      );
    else {
      const id = reference?.querySelector<HTMLSelectElement>('select[data-entry-control]')?.value;
      const entityKey = reference?.querySelector<HTMLElement>('[data-entry-related-entity]')
        ?.dataset['entryRelatedEntity'];
      if (id && entityKey)
        reference?.dispatchEvent(
          new CustomEvent('manatos:reference-view', {
            bubbles: true,
            detail: { id, entityKey },
          }),
        );
    }
    dismiss();
    return;
  }
  if (actionId === 'inspect-ctx') {
    inspect?.(fieldName);
    dismiss();
    return;
  }
  void perform(fieldName, actionId).then((text) => {
    if (text !== null) void navigator.clipboard?.writeText(text).catch(() => {});
  });
  dismiss();
}
