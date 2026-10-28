import { multilingual } from '@manatos/shared-ui';
import { Component, computed, input } from '@angular/core';
import type { ApiDiagnosticLogEntry } from '@manatos/shared';

const PRIMARY_LOG_FIELDS = new Set(['timestamp', 'level', 'requestId', 'message']);

@Component({
  selector: 'manatos-api-traffic-logs-tab',
  standalone: true,
  templateUrl: './ApiTrafficLogsTab.html',
  styleUrl: './ApiTrafficLogsTab.css',
})
export class ApiTrafficLogsTab {
  protected readonly multilingual = computed(() =>
    multilingual(this.language(), ['CorrelatedApiLogs', 'NoCorrelatedApiLogs'] as const),
  );

  readonly language = input<'EN' | 'EL'>('EN');
  readonly logs = input.required<readonly ApiDiagnosticLogEntry[]>();

  protected readonly text = computed(() =>
    this.logs()
      .map((log) => this.format(log))
      .join('\n'),
  );

  private format(log: ApiDiagnosticLogEntry): string {
    const rest = Object.fromEntries(
      Object.entries(log).filter(([key]) => !PRIMARY_LOG_FIELDS.has(key)),
    );
    const detail = Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : '';
    return `${log.timestamp} ${log.level.toUpperCase()} ${log.message}${detail}`;
  }
}
