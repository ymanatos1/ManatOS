import type { ApiTrafficEntry } from '@manatos/shared-ui';

type ApiDiagnosticLogEntry = NonNullable<
  NonNullable<ApiTrafficEntry['diagnostics']>['logs']
>[number];

const PRIMARY_LOG_FIELDS = new Set(['timestamp', 'level', 'requestId', 'message']);

export interface ApiTrafficLogsTabController {
  readonly element: HTMLElement;
  update(logs: readonly ApiDiagnosticLogEntry[]): void;
  destroy(): void;
}

export function createApiTrafficLogsTab(
  document: Document,
  logs: readonly ApiDiagnosticLogEntry[],
): ApiTrafficLogsTabController {
  const element = document.createElement('div');
  element.className = 'api-traffic-log-host';

  function render(value: readonly ApiDiagnosticLogEntry[]): void {
    if (!value.length) {
      const empty = document.createElement('div');
      empty.className = 'api-traffic-empty';
      empty.textContent = 'No correlated API log entries.';
      empty.dataset.multilingualText = 'NoCorrelatedApiLogs';
      element.replaceChildren(empty);
      return;
    }
    const pre = document.createElement('pre');
    pre.className = 'api-traffic-log-text';
    pre.setAttribute('aria-label', 'Correlated API log entries');
    pre.dataset.multilingualAriaLabel = 'CorrelatedApiLogs';
    pre.textContent = value.map(formatLog).join('\n');
    element.replaceChildren(pre);
  }

  render(logs);
  return {
    element,
    update: render,
    destroy() {
      element.remove();
    },
  };
}

function formatLog(log: ApiDiagnosticLogEntry): string {
  const rest = Object.fromEntries(
    Object.entries(log).filter(([key]) => !PRIMARY_LOG_FIELDS.has(key)),
  );
  const detail = Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : '';
  return `${log.timestamp} ${log.level.toUpperCase()} ${log.message}${detail}`;
}
