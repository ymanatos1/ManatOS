import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiClient } from '../src/api-client.js';
import {
  refreshUiBootstrap,
  UI_BOOTSTRAP_DEFAULTS,
  uiBootstrapState,
} from '../src/bootstrap/ui-bootstrap.js';

describe('UI bootstrap state', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('starts from API-unavailable local defaults', () => {
    expect(UI_BOOTSTRAP_DEFAULTS).toEqual({
      server: { alive: false, implementationVersion: null },
      api: { version: null },
    });
  });

  it('refreshes server availability and version information after a successful API request', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValueOnce({
      success: true,
      data: {
        server: { alive: true, implementationVersion: '0.1.0' },
        api: { version: 'v1' },
      },
    });

    expect(await refreshUiBootstrap()).toBe(true);
    expect(uiBootstrapState()).toEqual({
      server: { alive: true, implementationVersion: '0.1.0' },
      api: { version: 'v1' },
    });
  });

  it('marks the API unavailable on failure while allowing a later refresh to recover', async () => {
    vi.spyOn(apiClient, 'get')
      .mockRejectedValueOnce(new Error('API unavailable'))
      .mockResolvedValueOnce({
        success: true,
        data: {
          server: { alive: true, implementationVersion: '0.1.0' },
          api: { version: 'v1' },
        },
      });

    expect(await refreshUiBootstrap()).toBe(false);
    expect(uiBootstrapState().server.alive).toBe(false);

    expect(await refreshUiBootstrap()).toBe(true);
    expect(uiBootstrapState().server.alive).toBe(true);
  });
});
