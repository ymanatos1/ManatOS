import {
  multilingual,
  type UiDiagnosticEntry,
  type UiDiagnosticsRuntime,
} from '@manatos/shared-ui';

export interface CtxDiagnosticsController {
  refreshLanguage(): void;
  destroy(): void;
}

export function mountCtxDiagnostics(
  document: Document,
  runtime: UiDiagnosticsRuntime,
  language: () => 'EN' | 'EL' = () => 'EN',
): CtxDiagnosticsController {
  let panel: HTMLElement | null = null;

  const removePanel = (): void => {
    panel?.remove();
    panel = null;
  };

  const render = (): void => {
    const entries = runtime.entries;
    if (!entries.length) {
      removePanel();
      return;
    }

    const labels = multilingual(language(), [
      'CtxDiagnostics',
      'CloseDiagnostics',
      'Details',
    ] as const);
    if (!panel) {
      panel = document.createElement('section');
      panel.className = 'ctx-diagnostic-panel';
      panel.setAttribute('role', 'region');
      const body = document.createElement('div');
      body.className = 'ctx-diagnostic-panel-body';
      panel.append(
        createHeader(document, runtime, labels.CtxDiagnostics, labels.CloseDiagnostics),
        body,
      );
      document.body.appendChild(panel);
    }
    panel.setAttribute('aria-label', labels.CtxDiagnostics);
    const heading = panel.querySelector<HTMLElement>('.ctx-diagnostic-panel-header');
    if (heading) {
      const title = heading.querySelector<HTMLElement>('.ctx-diagnostic-panel-heading strong');
      if (title) title.textContent = labels.CtxDiagnostics;
      const count = heading.querySelector<HTMLElement>('.ctx-diagnostic-total');
      if (count) count.textContent = String(runtime.totalCount);
      const close = heading.querySelector<HTMLButtonElement>('.ctx-diagnostic-close');
      if (close) {
        close.title = labels.CloseDiagnostics;
        close.setAttribute('aria-label', labels.CloseDiagnostics);
      }
    }
    const body = panel.querySelector<HTMLElement>('.ctx-diagnostic-panel-body');
    if (!body) return;
    const existing = new Map(
      [...body.children]
        .filter((item): item is HTMLElement => item instanceof HTMLElement)
        .map((item) => [item.dataset['diagnosticKey'], item] as const),
    );
    // Angular @for tracks by entry.key. Keep that same identity in EJS so an
    // arriving diagnostic does not discard focused summaries or expanded traces.
    for (const [index, entry] of entries.entries()) {
      const item = existing.get(entry.key) ?? createItem(document, entry, labels.Details);
      updateItem(item, entry, labels.Details);
      existing.delete(entry.key);
      if (body.children[index] !== item) body.insertBefore(item, body.children[index] ?? null);
    }
    for (const item of existing.values()) item.remove();
  };

  const unsubscribe = runtime.subscribe(render);
  render();

  return {
    refreshLanguage: render,
    destroy(): void {
      unsubscribe();
      removePanel();
    },
  };
}

function createHeader(
  document: Document,
  runtime: UiDiagnosticsRuntime,
  titleText: string,
  closeText: string,
): HTMLElement {
  const header = document.createElement('header');
  header.className = 'ctx-diagnostic-panel-header';

  const heading = document.createElement('div');
  heading.className = 'ctx-diagnostic-panel-heading';

  const icon = document.createElement('i');
  icon.className = 'bi bi-exclamation-triangle';
  icon.setAttribute('aria-hidden', 'true');

  const title = document.createElement('strong');
  title.textContent = titleText;

  const total = document.createElement('span');
  total.className = 'ctx-diagnostic-total';
  total.textContent = String(runtime.totalCount);

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'ctx-diagnostic-close';
  close.title = closeText;
  close.setAttribute('aria-label', closeText);
  close.textContent = '×';
  close.addEventListener('click', () => runtime.clear(), { once: true });

  heading.append(icon, title, total);
  header.append(heading, close);
  return header;
}

function createItem(
  document: Document,
  entry: UiDiagnosticEntry,
  detailsText: string,
): HTMLElement {
  const item = document.createElement('article');
  item.className = 'ctx-diagnostic-item';
  item.dataset['diagnosticKey'] = entry.key;

  const heading = document.createElement('div');
  heading.className = 'ctx-diagnostic-item-title';

  const title = document.createElement('strong');
  title.textContent =
    entry.diagnostic.phase === 'parse'
      ? 'CTX expression parse error'
      : 'CTX expression evaluation error';
  heading.appendChild(title);

  if (entry.count > 1) {
    const count = document.createElement('span');
    count.className = 'ctx-diagnostic-count';
    count.textContent = `×${entry.count}`;
    heading.appendChild(count);
  }

  const message = document.createElement('div');
  message.className = 'ctx-diagnostic-message';
  message.textContent = entry.diagnostic.message;

  const details = document.createElement('details');
  const summary = document.createElement('summary');
  summary.textContent = detailsText;
  const pre = document.createElement('pre');
  pre.textContent = JSON.stringify(entry.diagnostic, null, 2);
  details.append(summary, pre);

  item.append(heading, message, details);
  return item;
}

/** Update an existing diagnostic node without replacing its focused/expanded controls. */
function updateItem(item: HTMLElement, entry: UiDiagnosticEntry, detailsText: string): void {
  const header = item.querySelector<HTMLElement>('.ctx-diagnostic-item-title');
  const count = header?.querySelector<HTMLElement>('.ctx-diagnostic-count');
  if (entry.count > 1) {
    if (count) count.textContent = `×${entry.count}`;
    else if (header) {
      const badge = item.ownerDocument.createElement('span');
      badge.className = 'ctx-diagnostic-count';
      badge.textContent = `×${entry.count}`;
      header.append(badge);
    }
  } else count?.remove();
  const message = item.querySelector<HTMLElement>('.ctx-diagnostic-message');
  if (message && message.textContent !== entry.diagnostic.message)
    message.textContent = entry.diagnostic.message;
  const summary = item.querySelector<HTMLElement>('details > summary');
  if (summary) summary.textContent = detailsText;
  const trace = item.querySelector<HTMLElement>('details > pre');
  const value = JSON.stringify(entry.diagnostic, null, 2);
  if (trace && trace.textContent !== value) trace.textContent = value;
}
