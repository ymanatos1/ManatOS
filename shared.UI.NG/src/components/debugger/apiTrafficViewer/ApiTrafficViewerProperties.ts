import {
  AfterViewInit,
  Component,
  ElementRef,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  computed,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import {
  projectApiTrafficTransactionEntries,
  correlatedUiResourceResponse,
  apiTrafficResponseBody,
  type ApiTrafficEntry,
  multilingual,
} from '@manatos/shared-ui';

import { ApiTrafficViewerCaption } from './ApiTrafficViewerCaption';
import { ApiTrafficPayloadTab } from './tabs/ApiTrafficPayloadTab';
import { ApiTrafficContextTab } from './tabs/ApiTrafficContextTab';
import { ApiTrafficLogsTab } from './tabs/ApiTrafficLogsTab';
import { ApiTrafficTransactionTab } from './tabs/ApiTrafficTransactionTab';

type ApiTrafficDetailsTab =
  'request' | 'response' | 'apiCtx' | 'storageCtx' | 'logs' | 'transaction';

interface ApiTrafficDetailsTabItem {
  readonly id: ApiTrafficDetailsTab;
  readonly label: string;
  readonly detail: string;
}

@Component({
  selector: 'manatos-api-traffic-properties',
  standalone: true,
  imports: [
    ApiTrafficViewerCaption,
    ApiTrafficPayloadTab,
    ApiTrafficContextTab,
    ApiTrafficLogsTab,
    ApiTrafficTransactionTab,
  ],
  templateUrl: './ApiTrafficViewerProperties.html',
  styleUrl: './ApiTrafficViewerProperties.css',
  host: {
    'data-debug-resizable-panel': 'api-details',
    '[attr.data-debug-preferred-height]': 'preferredHeight()',
  },
})
export class ApiTrafficViewerProperties implements AfterViewInit, OnChanges, OnDestroy {
  protected readonly multilingual = computed(() =>
    multilingual(this.language(), [
      'SelectedApiDetails',
      'CloseRequestDetails',
      'ApiRequestDetails',
      'ShowAllApiTabs',
      'DragResize',
      'Time',
      'Method',
      'Path',
      'Status',
      'Duration',
      'Request',
      'Response',
      'RequestInfo',
      'ResponseInfo',
      'ApiCtxTab',
      'ApiCtxDescription',
      'StorageCtxTab',
      'StorageCtxDescription',
      'Logs',
      'LogsDescription',
      'Transaction',
      'TransactionDescription',
      'RequestId',
      'Started',
      'State',
      'Error',
    ] as const),
  );

  readonly language = input<'EN' | 'EL'>('EN');
  readonly entry = input.required<ApiTrafficEntry>();
  readonly allEntries = input.required<readonly ApiTrafficEntry[]>();
  readonly heightPreference = input<number | null>(null);
  readonly closeRequested = output<void>();

  private readonly tabStrip = viewChild<ElementRef<HTMLElement>>('tabStrip');

  protected readonly activeTab = signal<ApiTrafficDetailsTab>('request');
  protected readonly tabsOverflowing = signal(false);
  protected readonly overflowOpen = signal(false);

  protected readonly availableTabs = computed<readonly ApiTrafficDetailsTabItem[]>(() => {
    const entry = this.entry();
    return [
      {
        id: 'request' as const,
        label: this.multilingual().Request,
        detail: this.multilingual().RequestInfo,
      },
      {
        id: 'response' as const,
        label: this.multilingual().Response,
        detail: this.multilingual().ResponseInfo,
      },
      ...(entry.diagnostics?.apiContext
        ? [
            {
              id: 'apiCtx' as const,
              label: this.multilingual().ApiCtxTab,
              detail: this.multilingual().ApiCtxDescription,
            },
          ]
        : []),
      ...(entry.diagnostics?.storageContexts?.length
        ? [
            {
              id: 'storageCtx' as const,
              label: this.multilingual().StorageCtxTab,
              detail: this.multilingual().StorageCtxDescription,
            },
          ]
        : []),
      ...(entry.diagnostics?.logs?.length
        ? [
            {
              id: 'logs' as const,
              label: this.multilingual().Logs,
              detail: this.multilingual().LogsDescription,
            },
          ]
        : []),
      ...(entry.transactionId
        ? [
            {
              id: 'transaction' as const,
              label: this.multilingual().Transaction,
              detail: this.multilingual().TransactionDescription,
            },
          ]
        : []),
    ];
  });

  protected readonly effectiveTab = computed<ApiTrafficDetailsTab>(() => {
    const requested = this.activeTab();
    return this.availableTabs().some((tab) => tab.id === requested) ? requested : 'request';
  });

  protected readonly preferredHeight = computed(() => this.resolveHeight(this.heightPreference()));
  private resizeObserver: ResizeObserver | null = null;
  private mutationObserver: MutationObserver | null = null;

  protected readonly requestMetadata = computed(() => {
    const entry = this.entry();
    return [
      { label: this.multilingual().RequestId, value: entry.requestId },
      { label: this.multilingual().Method, value: entry.method },
      { label: this.multilingual().Path, value: entry.path },
      { label: this.multilingual().Started, value: entry.startedAt },
      ...(entry.source === 'surface-upstream'
        ? [{ label: 'Capture', value: 'UI server → API (upstream summary)' }]
        : []),
      ...(entry.transactionId
        ? [{ label: this.multilingual().Transaction, value: entry.transactionId }]
        : []),
    ];
  });

  protected readonly responseMetadata = computed(() => {
    const entry = this.entry();
    return [
      {
        label: this.multilingual().Status,
        value: `${entry.status ?? '…'} ${entry.statusText}`.trim(),
      },
      {
        label: this.multilingual().Duration,
        value: entry.durationMs === null ? '…' : `${entry.durationMs} ms`,
      },
      { label: this.multilingual().State, value: entry.state },
      ...(this.entry().responseBody === undefined && this.correlatedResponse()
        ? [
            {
              label: 'Body source',
              value: 'Correlated UI resource response (not raw upstream API)',
            },
          ]
        : entry.source === 'surface-upstream'
          ? [{ label: 'Body source', value: 'Upstream body not captured' }]
          : []),
      ...(entry.error ? [{ label: this.multilingual().Error, value: entry.error }] : []),
    ];
  });

  // The UI server's actual, captured resource result can be inspected here.
  // Never mislabel it as the raw upstream API body.
  protected readonly correlatedResponse = computed(() =>
    correlatedUiResourceResponse(this.allEntries(), this.entry()),
  );
  protected readonly responseBody = computed(() =>
    apiTrafficResponseBody(this.allEntries(), this.entry()),
  );

  protected readonly transactionEntries = computed(() =>
    projectApiTrafficTransactionEntries(this.allEntries(), this.entry().transactionId),
  );

  ngOnChanges(changes: SimpleChanges): void {
    const entryChange = changes['entry'];
    if (entryChange && !entryChange.firstChange) {
      const previous = entryChange.previousValue as ApiTrafficEntry | undefined;
      const current = entryChange.currentValue as ApiTrafficEntry | undefined;
      if (previous?.requestId !== current?.requestId) {
        this.activeTab.set('request');
        this.overflowOpen.set(false);
      }
    }
  }

  ngAfterViewInit(): void {
    const strip = this.tabStrip()?.nativeElement;
    if (!strip) return;

    this.refreshTabsOverflow();
    if (typeof ResizeObserver === 'function') {
      this.resizeObserver = new ResizeObserver(() => this.refreshTabsOverflow());
      this.resizeObserver.observe(strip);
    }
    if (typeof MutationObserver === 'function') {
      this.mutationObserver = new MutationObserver(() => this.refreshTabsOverflow());
      this.mutationObserver.observe(strip, { childList: true });
    }
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.mutationObserver?.disconnect();
    this.mutationObserver = null;
    this.overflowOpen.set(false);
  }

  protected selectTab(tab: ApiTrafficDetailsTab): void {
    this.activeTab.set(tab);
    this.overflowOpen.set(false);
    const button = this.tabStrip()?.nativeElement.querySelector<HTMLElement>(
      `[data-api-detail-tab="${tab}"]`,
    );
    button?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  protected toggleOverflow(event: MouseEvent): void {
    event.stopPropagation();
    this.overflowOpen.update((value) => !value);
  }

  private resolveHeight(value: number | null): number {
    return value === null ? 260 : Math.max(140, Math.round(value));
  }

  private refreshTabsOverflow(): void {
    const strip = this.tabStrip()?.nativeElement;
    const overflowing = strip ? strip.scrollWidth > strip.clientWidth + 2 : false;
    this.tabsOverflowing.set(overflowing);
    if (!overflowing) this.overflowOpen.set(false);
  }
}
