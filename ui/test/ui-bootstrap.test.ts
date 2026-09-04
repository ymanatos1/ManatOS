import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiClient } from '../src/api/client.js';
import {
  refreshUiBootstrap,
  refreshUiBootstrapHealth,
  UI_BOOTSTRAP_DEFAULTS,
  uiBootstrapState,
} from '../src/bootstrap/ui-bootstrap.js';

describe('UI bootstrap state', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('starts from API-unavailable local defaults', () => {
    expect(UI_BOOTSTRAP_DEFAULTS.server).toEqual({ alive:false, implementationVersion:null });
    expect(UI_BOOTSTRAP_DEFAULTS.api).toEqual({ version:null });
    expect(UI_BOOTSTRAP_DEFAULTS.ui.pageSizeOptions.length).toBeGreaterThan(0);
    expect(UI_BOOTSTRAP_DEFAULTS.ui.donationsShow).toBe(false);
  });

  it('refreshes server availability and version information after a successful API request', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValueOnce({
      success: true,
      data: {
        server: { alive: true, implementationVersion: '0.1.0' },
        api: { version: 'v1' },
        ui: { pageSizeOptions:[2,5,10,20,50,100], defaultPageSize:10, showTechnicalErrorDetails:false, sessionErrorLogMaxEntries:20, donationsShow:true },
      },
    });

    expect(await refreshUiBootstrap()).toBe(true);
    expect(uiBootstrapState().server).toEqual({ alive:true, implementationVersion:'0.1.0' });
    expect(uiBootstrapState().api).toEqual({ version:'v1' });
    expect(uiBootstrapState().ui.defaultPageSize).toBe(10);
    expect(uiBootstrapState().ui.donationsShow).toBe(true);
  });


  it('uses /health for steady-state liveness without refetching the full bootstrap payload', async () => {
    vi.spyOn(apiClient, 'get')
      .mockResolvedValueOnce({
        success: true,
        data: {
          server: { alive: true, implementationVersion: '0.1.0' },
          api: { version: 'v1' },
          ui: { pageSizeOptions:[2,5,10,20,50,100], defaultPageSize:10, showTechnicalErrorDetails:false, sessionErrorLogMaxEntries:20, donationsShow:true },
        },
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          status: 'ok', service: 'ManatOS API', version: '0.1.0', environment: 'test',
          timestamp: new Date().toISOString(), uptimeSeconds: 10, nodeVersion: process.version,
        },
      });

    expect(await refreshUiBootstrap()).toBe(true);
    expect(await refreshUiBootstrapHealth()).toBe(true);
    expect(apiClient.get).toHaveBeenNthCalledWith(1, '/api/v1/public/ui-bootstrap');
    expect(apiClient.get).toHaveBeenNthCalledWith(2, '/health');
    expect(apiClient.get).toHaveBeenCalledTimes(2);
  });

  it('marks the API unavailable on failure while allowing a later refresh to recover', async () => {
    vi.spyOn(apiClient, 'get')
      .mockRejectedValueOnce(new Error('API unavailable'))
      .mockResolvedValueOnce({
        success: true,
        data: {
          server: { alive: true, implementationVersion: '0.1.0' },
          api: { version: 'v1' },
          ui: { pageSizeOptions:[2,5,10,20,50,100], defaultPageSize:10, showTechnicalErrorDetails:false, sessionErrorLogMaxEntries:20, donationsShow:true },
        },
      });

    expect(await refreshUiBootstrap()).toBe(false);
    expect(uiBootstrapState().server.alive).toBe(false);

    expect(await refreshUiBootstrap()).toBe(true);
    expect(uiBootstrapState().server.alive).toBe(true);
  });
});
