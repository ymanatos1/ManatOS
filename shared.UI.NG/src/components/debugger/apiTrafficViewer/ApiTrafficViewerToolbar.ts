import { multilingual } from '@manatos/shared-ui';
import { Component, input, output, computed } from '@angular/core';
import type { ApiTrafficRouteFilterItem } from '@manatos/shared-ui';

@Component({
  selector: 'manatos-api-traffic-toolbar',
  standalone: true,
  templateUrl: './ApiTrafficViewerToolbar.html',
  styleUrl: './ApiTrafficViewerToolbar.css',
})
export class ApiTrafficViewerToolbar {
  protected readonly multilingual = computed(() =>
    multilingual(this.language(), [
      'ApiTrafficControls',
      'ClearApiTraffic',
      'ShowApiErrors',
      'ChooseApiCalls',
      'IgnoreRouteVisibility',
      'SearchTraffic',
      'SearchCapturedTraffic',
      'All',
      'None',
      'NoApiRoutes',
      'ResumeLiveUpdates',
      'PauseLiveUpdates',
      'Requests',
    ] as const),
  );

  readonly language = input<'EN' | 'EL'>('EN');
  readonly paused = input(false);
  readonly errorsOnly = input(false);
  readonly ignoreRoutes = input(false);
  readonly searchText = input('');
  readonly visibleCount = input(0);
  readonly totalCount = input(0);
  readonly routes = input.required<readonly ApiTrafficRouteFilterItem[]>();

  readonly pause = output<void>();
  readonly clear = output<void>();
  readonly errors = output<void>();
  readonly toggleIgnoreRoutes = output<void>();
  readonly searchChanged = output<string>();
  readonly routeVisibilityChanged = output<{ key: string; visible: boolean }>();
  readonly showAllRoutes = output<void>();
  readonly hideAllRoutes = output<void>();

  protected changeSearch(event: Event): void {
    this.searchChanged.emit((event.target as HTMLInputElement).value);
  }

  protected changeRoute(route: ApiTrafficRouteFilterItem, event: Event): void {
    this.routeVisibilityChanged.emit({
      key: route.key,
      visible: (event.target as HTMLInputElement).checked,
    });
  }
}
