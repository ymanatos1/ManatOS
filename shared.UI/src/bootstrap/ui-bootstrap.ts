import type { ManatosApiClient } from '../api/api-client.js';

export interface UiBootstrapState {
  server: {
    alive: boolean;
    implementationVersion: string | null;
  };
  api: {
    version: string | null;
  };
  ui: {
    pageSizeOptions: number[];
    defaultPageSize: number;
    showTechnicalErrorDetails: boolean;
    sessionErrorLogMaxEntries: number;
    donationsShow: boolean;
  };
}

interface ApiHealthState {
  status: string;
  version: string;
}

export interface UiBootstrapHealth {
  alive: boolean;
  implementationVersion: string | null;
}

export class UiBootstrapClient {
  constructor(private readonly api: ManatosApiClient) {}

  async load(): Promise<UiBootstrapState> {
    const response = await this.api.get<UiBootstrapState>('/api/v1/public/ui-bootstrap');

    return response.data;
  }

  async health(): Promise<UiBootstrapHealth> {
    const response = await this.api.get<ApiHealthState>('/health');

    return {
      alive: response.data.status === 'ok',
      implementationVersion: response.data.version ?? null,
    };
  }
}
