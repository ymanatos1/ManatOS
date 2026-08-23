import { config } from '../config.js';

import type { InMemoryDataStore } from '../storage/in-memory-data-store.js';

export class HealthService {
  constructor(private readonly store: InMemoryDataStore) {}

  /**
   * Liveness.
   *
   * Reaching this method proves that the Node/Express process itself
   * is running.
   */
  async checkHealth() {
    return {
      status: 'ok' as const,

      service: 'ManatOS API',

      version: '0.1.0',

      environment: config.NODE_ENV,

      timestamp: new Date().toISOString(),

      uptimeSeconds: Math.floor(process.uptime()),

      nodeVersion: process.version,
    };
  }

  /**
   * Readiness.
   *
   * Unlike liveness, readiness depends on resources required to serve
   * normal application requests.
   */
  async checkReadiness() {
    const storage = await this.store.healthCheck();

    const ready = storage.status === 'ok';

    return {
      status: ready ? ('ok' as const) : ('error' as const),

      service: 'ManatOS API',

      timestamp: new Date().toISOString(),

      storage,
    };
  }
}
