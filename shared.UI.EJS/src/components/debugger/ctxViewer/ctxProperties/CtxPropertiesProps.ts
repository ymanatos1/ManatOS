import type { CtxPropertyRow } from '@manatos/shared-ui';

export function renderCtxPropertiesProps(host: HTMLElement, rows: readonly CtxPropertyRow[]): void {
  const document = host.ownerDocument;
  const list = document.createElement('div');
  list.className = 'ctx-property-list';

  if (!rows.length) {
    const empty = document.createElement('div');
    empty.className = 'ctx-debug-properties-empty';
    empty.textContent = 'No properties.';
    empty.dataset.multilingualText = 'NoProperties';
    list.appendChild(empty);
  }

  for (const row of rows) {
    const item = document.createElement('div');
    item.className = 'ctx-debug-property-row';
    const label = document.createElement('span');
    label.className = 'ctx-debug-property-label';
    label.textContent = row.name;

    if (row.path) {
      const value = document.createElement('button');
      value.className = 'ctx-debug-property-value is-link';
      value.type = 'button';
      value.title = row.path;
      value.textContent = row.value;
      value.dataset.ctxPropertyPath = row.path;
      item.append(label, value);
    } else {
      const value = document.createElement('code');
      value.className = 'ctx-debug-property-value';
      value.textContent = row.value;
      item.append(label, value);
    }

    list.appendChild(item);
  }

  host.replaceChildren(list);
}
