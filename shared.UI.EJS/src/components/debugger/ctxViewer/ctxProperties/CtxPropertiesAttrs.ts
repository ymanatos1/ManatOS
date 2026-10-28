import type { CtxPropertyRow } from '@manatos/shared-ui';

export function renderCtxPropertiesAttrs(host: HTMLElement, rows: readonly CtxPropertyRow[]): void {
  const document = host.ownerDocument;
  const list = document.createElement('div');
  list.className = 'ctx-property-list';

  if (!rows.length) {
    const empty = document.createElement('div');
    empty.className = 'ctx-debug-properties-empty';
    empty.textContent = 'No semantic attributes.';
    empty.dataset.multilingualText = 'NoSemanticAttributes';
    list.appendChild(empty);
  }

  for (const row of rows) {
    const item = document.createElement('div');
    item.className = 'ctx-debug-property-row';
    const label = document.createElement('span');
    label.className = 'ctx-debug-property-label';
    label.textContent = row.name;
    const value = document.createElement('code');
    value.className = 'ctx-debug-property-value';
    value.textContent = row.value;
    item.append(label, value);
    list.appendChild(item);
  }

  host.replaceChildren(list);
}
