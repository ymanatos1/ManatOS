import { apiClient } from '../api-client.js';
import { config } from '../config.js';
const configFallback = { pageSizeOptions:config.UI_PAGE_SIZE_OPTIONS, defaultPageSize:config.UI_DEFAULT_PAGE_SIZE, showTechnicalErrorDetails:config.SHOW_TECHNICAL_ERROR_DETAILS, sessionErrorLogMaxEntries:config.SESSION_ERROR_LOG_MAX_ENTRIES }; 

/** Public server/API information needed before a user signs in. */
export interface UiBootstrapState {
  server: {
    alive: boolean;
    implementationVersion: string | null;
  };
  api: { version: string | null; };
  ui: { pageSizeOptions:number[]; defaultPageSize:number; showTechnicalErrorDetails:boolean; sessionErrorLogMaxEntries:number; donationsShow:boolean; };
}

/**
 * UI-local fallback used before the first successful API bootstrap refresh.
 * The UI can therefore start and render even when the API is unavailable.
 */
export const UI_BOOTSTRAP_DEFAULTS: Readonly<UiBootstrapState> = Object.freeze({
  server: Object.freeze({
    alive: false,
    implementationVersion: null,
  }),
  api: Object.freeze({ version:null }),
  ui: Object.freeze({ pageSizeOptions:[...configFallback.pageSizeOptions], defaultPageSize:configFallback.defaultPageSize, showTechnicalErrorDetails:configFallback.showTechnicalErrorDetails, sessionErrorLogMaxEntries:configFallback.sessionErrorLogMaxEntries, donationsShow:false }),
});

let currentState: Readonly<UiBootstrapState> = UI_BOOTSTRAP_DEFAULTS;

export function uiBootstrapState(): Readonly<UiBootstrapState> {
  return currentState;
}

/**
 * Refresh anonymous/public startup information from the API.
 *
 * A failed request marks the server unavailable but preserves the last known
 * version values. A later successful retry replaces the state again, so a
 * transient API outage is never treated as permanent for the lifetime of the
 * UI process.
 */
export async function refreshUiBootstrap(): Promise<boolean> {
  try {
    const response = await apiClient.get<UiBootstrapState>('/api/v1/public/ui-bootstrap');

    currentState = Object.freeze({
      server: Object.freeze({
        alive: response.data.server.alive,
        implementationVersion: response.data.server.implementationVersion,
      }),
      api: Object.freeze({ version: response.data.api.version }),
      ui: Object.freeze({ ...response.data.ui, pageSizeOptions:[...response.data.ui.pageSizeOptions] }),
    });

    return true;
  } catch {
    currentState = Object.freeze({
      server: Object.freeze({
        ...currentState.server,
        alive: false,
      }),
      api: currentState.api,
      ui: currentState.ui,
    });

    return false;
  }
}

/**
 * Start periodic non-blocking bootstrap refresh.
 *
 * The immediate refresh discovers an API that is already running. Repeating
 * the request means an API that starts later, restarts, or recovers from an
 * outage is discovered without restarting the UI process.
 */
export function startUiBootstrapRefresh(intervalMs = 30_000): NodeJS.Timeout {
  void refreshUiBootstrap();

  const timer = setInterval(() => {
    void refreshUiBootstrap();
  }, intervalMs);

  // The refresh timer is housekeeping and should not keep Node alive by itself.
  timer.unref();

  return timer;
}
