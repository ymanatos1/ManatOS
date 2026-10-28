import type { UiBootstrapClient, UiBootstrapState } from './ui-bootstrap.js';

/** API health is separate from the UI host's browser-session availability. */
export interface UiBootstrapRuntimeState {
  ready: boolean;
  serverAlive: boolean;
  bootstrap: UiBootstrapState | null;
  consecutiveFailures: number;
  unavailable: boolean;
}

export type UiBootstrapStateListener = (state: UiBootstrapRuntimeState) => void;

export interface UiBootstrapRuntimeOptions {
  heartbeatMilliseconds?: number;
  bootstrapRefreshHeartbeats?: number;
  failureThreshold?: number;
}

export class UiBootstrapRuntime {
  private state: UiBootstrapRuntimeState = {
    ready: false,
    serverAlive: false,
    bootstrap: null,
    consecutiveFailures: 0,
    unavailable: false,
  };

  private readonly listeners = new Set<UiBootstrapStateListener>();
  private readonly heartbeatMilliseconds: number;
  private readonly bootstrapRefreshHeartbeats: number;
  private readonly failureThreshold: number;

  private timer: ReturnType<typeof setInterval> | null = null;
  private successfulHeartbeats = 0;
  private running = false;
  private checking = false;

  constructor(
    private readonly client: UiBootstrapClient,
    options: UiBootstrapRuntimeOptions = {},
  ) {
    this.heartbeatMilliseconds = options.heartbeatMilliseconds ?? 30_000;
    this.bootstrapRefreshHeartbeats = options.bootstrapRefreshHeartbeats ?? 10;
    this.failureThreshold = Math.max(1, options.failureThreshold ?? 3);
  }

  snapshot(): UiBootstrapRuntimeState {
    return this.state;
  }

  subscribe(listener: UiBootstrapStateListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    await this.loadBootstrap();
    if (!this.running) return;
    this.timer = setInterval(() => void this.heartbeat(), this.heartbeatMilliseconds);
  }

  stop(): void {
    this.running = false;
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  /**
   * After the third failure, background checks stop. Recovery is explicit:
   * Retry must verify both API health and bootstrap before lifting the outage.
   */
  async retry(): Promise<boolean> {
    if (!this.running || this.checking) return false;
    this.checking = true;
    try {
      const health = await this.client.health();
      if (!health.alive) {
        this.markFailure();
        return false;
      }
      return await this.loadBootstrap();
    } catch {
      this.markFailure();
      return false;
    } finally {
      this.checking = false;
    }
  }

  private markFailure(): void {
    this.successfulHeartbeats = 0;
    const consecutiveFailures = this.state.consecutiveFailures + 1;
    this.setState({
      ...this.state,
      serverAlive: false,
      consecutiveFailures,
      unavailable: this.state.unavailable || consecutiveFailures >= this.failureThreshold,
    });
  }

  private markHealthy(state: Pick<UiBootstrapRuntimeState, 'ready' | 'bootstrap'>): void {
    this.setState({
      ...this.state,
      ...state,
      serverAlive: true,
      consecutiveFailures: 0,
      unavailable: false,
    });
  }

  private async loadBootstrap(): Promise<boolean> {
    try {
      const bootstrap = await this.client.load();
      if (!bootstrap.server.alive) {
        this.markFailure();
        return false;
      }
      this.successfulHeartbeats = 0;
      this.markHealthy({ ready: true, bootstrap });
      return true;
    } catch {
      this.markFailure();
      return false;
    }
  }

  private async heartbeat(): Promise<void> {
    if (!this.running || this.checking || this.state.unavailable) return;
    this.checking = true;
    try {
      const wasAlive = this.state.serverAlive;
      const health = await this.client.health();
      if (!health.alive) {
        this.markFailure();
        return;
      }
      if (!wasAlive) {
        await this.loadBootstrap();
        return;
      }
      this.successfulHeartbeats += 1;
      if (this.successfulHeartbeats >= this.bootstrapRefreshHeartbeats) {
        await this.loadBootstrap();
      } else {
        this.markHealthy({ ready: this.state.ready, bootstrap: this.state.bootstrap });
      }
    } catch {
      this.markFailure();
    } finally {
      this.checking = false;
    }
  }

  private setState(state: UiBootstrapRuntimeState): void {
    if (!this.running) return;
    this.state = state;
    for (const listener of this.listeners) listener(state);
  }
}
