import type { ApiTrafficEntry } from '@manatos/shared-ui';

export interface ApiTrafficTransactionTabController {
  readonly element: HTMLElement;
  update(transactionId: string, entries: readonly ApiTrafficEntry[]): void;
  destroy(): void;
}

export function createApiTrafficTransactionTab(
  document: Document,
  transactionId: string,
  entries: readonly ApiTrafficEntry[],
): ApiTrafficTransactionTabController {
  const element = document.createElement('div');
  element.className = 'api-traffic-transaction';

  function render(id: string, values: readonly ApiTrafficEntry[]): void {
    const heading = document.createElement('strong');
    heading.textContent = `Transaction ${id}`;
    element.replaceChildren(
      heading,
      ...values.map((entry) => {
        const row = document.createElement('div');
        row.className = 'api-traffic-transaction-row';
        const call = document.createElement('code');
        call.textContent = `${entry.method} ${entry.path}`;
        const status = document.createElement('span');
        status.textContent = entry.status === null ? '…' : String(entry.status);
        const duration = document.createElement('span');
        duration.textContent = entry.durationMs === null ? '…' : `${entry.durationMs} ms`;
        row.append(call, status, duration);
        return row;
      }),
    );
  }

  render(transactionId, entries);
  return {
    element,
    update: render,
    destroy() {
      element.remove();
    },
  };
}
