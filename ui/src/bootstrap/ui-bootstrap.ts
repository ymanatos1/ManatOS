import { apiClient } from '../api/client.js';
import { config } from '../config.js';

const configFallback = {
  pageSizeOptions: config.UI_PAGE_SIZE_OPTIONS,
  defaultPageSize: config.UI_DEFAULT_PAGE_SIZE,
  showTechnicalErrorDetails: config.SHOW_TECHNICAL_ERROR_DETAILS,
  sessionErrorLogMaxEntries: config.SESSION_ERROR_LOG_MAX_ENTRIES,
};

/** Public server/API information needed before a user signs in. */
export interface UiBootstrapState {
  server: {
    alive: boolean;
    implementationVersion: string | null;
  };
  api: { version: string | null };
  ui: {
    pageSizeOptions: number[];
    defaultPageSize: number;
    showTechnicalErrorDetails: boolean;
    sessionErrorLogMaxEntries: number;
    donationsShow: boolean;
  };
}

interface ApiHealthState {
  status: 'ok';
  service: string;
  version: string;
  environment: string;
  timestamp: string;
  uptimeSeconds: number;
  nodeVersion: string;
}

/**
 * UI-local fallback used before the first successful API bootstrap refresh.
 * The UI can therefore start and render even when the API is unavailable.
 */
export const UI_BOOTSTRAP_DEFAULTS: Readonly<UiBootstrapState> = Object.freeze({
  server: Object.freeze({ alive: false, implementationVersion: null }),
  api: Object.freeze({ version: null }),
  ui: Object.freeze({
    pageSizeOptions: [...configFallback.pageSizeOptions],
    defaultPageSize: configFallback.defaultPageSize,
    showTechnicalErrorDetails: configFallback.showTechnicalErrorDetails,
    sessionErrorLogMaxEntries: configFallback.sessionErrorLogMaxEntries,
    donationsShow: false,
  }),
});

let currentState: Readonly<UiBootstrapState> = UI_BOOTSTRAP_DEFAULTS;
let currentRevision = 0;
let bootstrapRefreshInFlight: Promise<boolean> | null = null;

export function uiBootstrapState(): Readonly<UiBootstrapState> {
  return currentState;
}

/** Monotonic process-local version of the browser-visible bootstrap projection. */
export function uiBootstrapRevision(): number {
  return currentRevision;
}

function replaceState(next: Readonly<UiBootstrapState>): void {
  if (JSON.stringify(next) === JSON.stringify(currentState)) return;
  currentState = next;
  currentRevision += 1;
}

/**
 * Refresh the complete anonymous/public startup projection.
 *
 * This is intentionally not the routine heartbeat. It is used at startup,
 * after API recovery, and occasionally to pick up changed public UI settings.
 */
export function refreshUiBootstrap(): Promise<boolean> {
  if (bootstrapRefreshInFlight) return bootstrapRefreshInFlight;

  bootstrapRefreshInFlight = (async () => {
    try {
      const response = await apiClient.get<UiBootstrapState>('/api/v1/public/ui-bootstrap');

      replaceState(
        Object.freeze({
          server: Object.freeze({
            alive: response.data.server.alive,
            implementationVersion: response.data.server.implementationVersion,
          }),
          api: Object.freeze({ version: response.data.api.version }),
          ui: Object.freeze({
            ...response.data.ui,
            pageSizeOptions: [...response.data.ui.pageSizeOptions],
          }),
        }),
      );

      return true;
    } catch {
      replaceState(
        Object.freeze({
          server: Object.freeze({ ...currentState.server, alive: false }),
          api: currentState.api,
          ui: currentState.ui,
        }),
      );
      return false;
    } finally {
      bootstrapRefreshInFlight = null;
    }
  })();

  return bootstrapRefreshInFlight;
}

/**
 * Lightweight API heartbeat.
 *
 * `/health` is sufficient for routine liveness. A transition from unavailable
 * to available immediately refreshes the full bootstrap projection so browser
 * configuration/version facts recover without waiting for the slower refresh.
 */
export async function refreshUiBootstrapHealth(): Promise<boolean> {
  const wasAlive = currentState.server.alive;

  try {
    const response = await apiClient.get<ApiHealthState>('/health');
    const alive = response.data.status === 'ok';

    if (!wasAlive && alive) return refreshUiBootstrap();

    replaceState(
      Object.freeze({
        server: Object.freeze({
          alive,
          implementationVersion: response.data.version ?? currentState.server.implementationVersion,
        }),
        api: currentState.api,
        ui: currentState.ui,
      }),
    );

    return alive;
  } catch {
    replaceState(
      Object.freeze({
        server: Object.freeze({ ...currentState.server, alive: false }),
        api: currentState.api,
        ui: currentState.ui,
      }),
    );
    return false;
  }
}

/**
 * Maintain public bootstrap state without repeatedly downloading the complete
 * `/public/ui-bootstrap` payload.
 *
 * Routine checks use `/health`. A full refresh is performed at startup, after
 * recovery, and every ten heartbeats (five minutes at the default cadence) so
 * public UI configuration changes are still discovered automatically.
 */
export function startUiBootstrapRefresh(intervalMs = 30_000): NodeJS.Timeout {
  void refreshUiBootstrap();

  let heartbeatCount = 0;
  let refreshInFlight = false;

  const timer = setInterval(() => {
    if (refreshInFlight) return;
    refreshInFlight = true;

    void (async () => {
      try {
        const healthy = await refreshUiBootstrapHealth();
        heartbeatCount += 1;
        if (healthy && heartbeatCount % 10 === 0) await refreshUiBootstrap();
      } finally {
        refreshInFlight = false;
      }
    })();
  }, intervalMs);

  timer.unref();
  return timer;
}
