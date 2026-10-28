export interface ApiTrafficHeadersController {
  readonly element: HTMLElement;
  update(headers: Readonly<Record<string, string>>): void;
  destroy(): void;
}

export function createApiTrafficHeaders(
  document: Document,
  headers: Readonly<Record<string, string>>,
): ApiTrafficHeadersController {
  const element = document.createElement('div');
  element.className = 'api-traffic-header-matrix';
  element.setAttribute('role', 'table');
  element.setAttribute('aria-label', 'HTTP headers');
  element.dataset.multilingualAriaLabel = 'HttpHeaders';

  function render(value: Readonly<Record<string, string>>): void {
    const heading = document.createElement('div');
    heading.className = 'api-traffic-header-matrix-heading';
    heading.setAttribute('role', 'row');
    for (const label of ['Name', 'Value']) {
      const cell = document.createElement('span');
      cell.setAttribute('role', 'columnheader');
      cell.textContent = label;
      cell.dataset.multilingualText = label;
      heading.appendChild(cell);
    }

    const rows = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
    if (!rows.length) {
      const empty = document.createElement('div');
      empty.className = 'api-traffic-empty';
      empty.textContent = 'No headers.';
      empty.dataset.multilingualText = 'NoHeaders';
      element.replaceChildren(heading, empty);
      return;
    }

    element.replaceChildren(
      heading,
      ...rows.map(([name, headerValue]) => {
        const row = document.createElement('div');
        row.className = 'api-traffic-header-matrix-row';
        row.setAttribute('role', 'row');
        const nameCell = document.createElement('code');
        nameCell.setAttribute('role', 'cell');
        nameCell.textContent = name;
        const valueCell = document.createElement('code');
        valueCell.setAttribute('role', 'cell');
        valueCell.textContent = headerValue;
        row.append(nameCell, valueCell);
        return row;
      }),
    );
  }

  render(headers);
  return {
    element,
    update: render,
    destroy() {
      element.remove();
    },
  };
}
