import { multilingual } from '@manatos/shared-ui';
import { Component, computed, input } from '@angular/core';

export type UiHeaderApiStatus = 'checking' | 'retrying' | 'online' | 'offline';

/**
 * Displays the UI/API status and application version as a
 * compact three-line block.
 *
 * The host supplies both values. This component does not own
 * application state or communicate with the API.
 */
@Component({
  selector: 'manatos-header-status',
  standalone: true,
  templateUrl: './HeaderStatus.html',
  styleUrl: './HeaderStatus.css',
})
export class HeaderStatus {
  protected readonly multilingual = computed(() =>
    multilingual(this.language(), ['ManatOsVersion', 'AngularUi'] as const),
  );

  readonly language = input<'EN' | 'EL'>('EN');
  readonly statusLabel = input.required<string>();
  readonly versionLabel = input.required<string>();

  /** Explicit API health state. Null retains the original label-based behavior for existing hosts. */
  readonly apiStatus = input<UiHeaderApiStatus | null>(null);
  readonly apiFailureCount = input(0);

  protected readonly effectiveApiStatus = computed<UiHeaderApiStatus>(() => {
    const explicit = this.apiStatus();
    if (explicit) return explicit;
    return this.statusLabel().toLowerCase().includes('online') ? 'online' : 'offline';
  });
}
