import { config } from '../config.js';

import type { InMemoryDataStore } from '../storage/in-memory-data-store.js';

export class HealthService {
  constructor(private readonly store: InMemoryDataStore) {}

  /**
   * Current health and readiness perform the same checks.
   *
   * Keeping the method behind a service means readiness can later
   * become stricter without changing the /health contract.
   */
  async check() {
    const storage = this.store.healthCheck();

    const ok = storage.status === 'ok';

    return {
      status: ok ? 'ok' : 'error',

      service: 'ManatOS API',

      version: '0.1.0',

      environment: config.NODE_ENV,

      timestamp: new Date().toISOString(),

      uptimeSeconds: Math.floor(process.uptime()),

      nodeVersion: process.version,

      storage,
    };
  }
}
