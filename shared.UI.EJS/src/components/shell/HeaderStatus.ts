export type UiHeaderApiStatus = 'checking' | 'retrying' | 'online' | 'offline';

export interface HeaderStatusOptions {
  readonly uiLabel: string;
  readonly versionLabel: string;
  readonly apiStatus: UiHeaderApiStatus;
  readonly apiFailureCount?: number;
}

/** Status and version presentation only; bootstrap runtime owns API health. */
export function renderHeaderStatus(options: HeaderStatusOptions): string {
  const status =
    options.apiStatus === 'retrying'
      ? `retrying (${options.apiFailureCount ?? 0}/3)`
      : options.apiStatus;
  return `<span class="header-status" aria-label="Application status">
    <span class="header-status-line">${options.uiLabel}</span>
    <span class="header-version-line" title="ManatOS version"><b>${options.versionLabel}</b></span>
    <span id="api-status" class="header-status-line header-api-status is-${options.apiStatus}" role="status" aria-live="polite">API ${status}<span class="header-api-indicator ${options.apiStatus === 'online' ? 'is-online' : ''}" aria-hidden="true"></span></span>
  </span>`;
}
