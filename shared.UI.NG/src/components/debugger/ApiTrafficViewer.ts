import {
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import {
  apiTrafficHistory,
  clearApiTrafficView,
  findApiTrafficEntry,
  projectApiTrafficEntries,
  projectApiTrafficRoutes,
  toggleApiTrafficPause,
  type ApiTrafficSnapshot,
  type ApplicationState,
  multilingual,
} from '@manatos/shared-ui';

import { ApiTrafficViewerToolbar } from './apiTrafficViewer/ApiTrafficViewerToolbar';
import { ApiTrafficViewerList } from './apiTrafficViewer/ApiTrafficViewerList';
import { ApiTrafficViewerProperties } from './apiTrafficViewer/ApiTrafficViewerProperties';

@Component({
  selector: 'manatos-api-traffic-viewer',
  standalone: true,
  imports: [ApiTrafficViewerToolbar, ApiTrafficViewerList, ApiTrafficViewerProperties],
  templateUrl: './ApiTrafficViewer.html',
  styleUrl: './ApiTrafficViewer.css',
})
export class ApiTrafficViewer implements OnInit, OnDestroy {
  protected readonly multilingual = computed(() =>
    multilingual(this.state()?.currentLanguage.id === 'el' ? 'EL' : 'EN', [
      'ApiTrafficViewer',
    ] as const),
  );

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly state = input<ApplicationState | null>(null);

  protected readonly revision = signal(apiTrafficHistory.revision);
  protected readonly selectedId = signal<number | null>(null);
  protected readonly pausedSnapshot = signal<ApiTrafficSnapshot | null>(null);
  protected readonly errorsOnly = signal(false);
  protected readonly ignoreRoutes = signal(false);
  protected readonly searchText = signal('');
  protected readonly hiddenRoutes = signal<ReadonlySet<string>>(new Set());
  protected readonly columnWidths = signal<readonly number[]>([]);
  protected readonly detailsHeight = signal<number | null>(null);

  private unsubscribeHistory: (() => void) | null = null;
  private unsubscribeState: (() => void) | null = null;

  protected readonly baseEntries = computed(() => {
    const paused = this.pausedSnapshot();
    if (paused) return paused.entries;
    this.revision();
    return apiTrafficHistory.entries();
  });

  protected readonly routes = computed(() =>
    projectApiTrafficRoutes(this.baseEntries(), this.hiddenRoutes()),
  );

  protected readonly visibleEntries = computed(() =>
    projectApiTrafficEntries(this.baseEntries(), {
      errorsOnly: this.errorsOnly(),
      ignoreRoutes: this.ignoreRoutes(),
      searchText: this.searchText(),
      hiddenRoutes: this.hiddenRoutes(),
    }),
  );

  protected readonly selectedEntry = computed(() =>
    findApiTrafficEntry(this.baseEntries(), this.selectedId()),
  );

  ngOnInit(): void {
    this.loadState();
    this.unsubscribeHistory = apiTrafficHistory.subscribe((revision) =>
      this.revision.set(revision),
    );
    const state = this.state();
    if (state) {
      this.unsubscribeState = state.subscribe((change) => {
        if (change === 'uiState') this.loadState();
      });
    }
  }

  ngOnDestroy(): void {
    this.unsubscribeHistory?.();
    this.unsubscribeHistory = null;
    this.unsubscribeState?.();
    this.unsubscribeState = null;
    this.pausedSnapshot.set(null);
  }

  protected toggleErrorsOnly(): void {
    const value = !this.errorsOnly();
    this.errorsOnly.set(value);
    this.state()?.debuggerState.updateApiTraffic({ errorsOnly: value });
  }

  protected toggleIgnoreRoutes(): void {
    const value = !this.ignoreRoutes();
    this.ignoreRoutes.set(value);
    this.state()?.debuggerState.updateApiTraffic({ ignoreRoutes: value });
  }

  protected togglePause(): void {
    const next = toggleApiTrafficPause(apiTrafficHistory, {
      pausedSnapshot: this.pausedSnapshot(),
      selectedId: this.selectedId(),
    });
    this.pausedSnapshot.set(next.pausedSnapshot);
    this.selectedId.set(next.selectedId);
  }

  protected clear(): void {
    const next = clearApiTrafficView(apiTrafficHistory, {
      pausedSnapshot: this.pausedSnapshot(),
      selectedId: this.selectedId(),
    });
    this.pausedSnapshot.set(next.pausedSnapshot);
    this.selectedId.set(next.selectedId);
  }

  protected setRouteVisibility(change: { key: string; visible: boolean }): void {
    const next = new Set(this.hiddenRoutes());
    if (change.visible) next.delete(change.key);
    else next.add(change.key);
    this.saveHiddenRoutes(next);
  }

  protected showAllRoutes(): void {
    this.saveHiddenRoutes(new Set());
  }

  protected hideAllRoutes(): void {
    this.saveHiddenRoutes(new Set(this.routes().map((route) => route.key)));
  }

  protected saveColumnWidths(widths: readonly number[]): void {
    this.columnWidths.set(widths);
    this.state()?.debuggerState.saveBrowserPreferences({ apiColumnWidths: widths });
  }

  protected selectEntry(id: number): void {
    const openingDetails = this.selectedId() === null;
    this.selectedId.set(id);
    if (openingDetails) queueMicrotask(() => this.revealSelectedEntry(id));
  }

  private revealSelectedEntry(id: number): void {
    this.host.nativeElement
      .querySelector<HTMLElement>(`[data-api-entry-id="${id}"]`)
      ?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }

  private saveHiddenRoutes(routes: ReadonlySet<string>): void {
    this.hiddenRoutes.set(routes);
    this.state()?.debuggerState.updateApiTraffic({ hiddenRoutes: [...routes] });
  }

  private loadState(): void {
    const state = this.state();
    if (!state) return;
    const api = state.debuggerState.apiTraffic;
    this.errorsOnly.set(api.errorsOnly);
    this.ignoreRoutes.set(api.ignoreRoutes);
    this.hiddenRoutes.set(new Set(api.hiddenRoutes));
    this.columnWidths.set(state.debuggerState.browser.apiColumnWidths);
    this.detailsHeight.set(state.debuggerState.browser.apiDetailsHeight);
  }
}
