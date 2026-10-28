/**
 * UIS SURFACE EVENTS — invocation/Flow boundary, not DOM event delegation.
 *
 * Listeners observe a live CTX projection synchronously; a handler may close
 * the Surface. Do not retain its level after disposal; use copied facts.
 * See: surface/invocation.ts and popups/popup-runtime.ts.
 */
/**
 * A listener receives the event name, the canonical CTX path,
 * and the live surface level. It must capture necessary values
 * synchronously because the level may subsequently be disposed.
 */
export type UiSurfaceEventListener<TLevel> = (
  eventName: string,
  levelPath: string,
  level: TLevel,
) => void;

export class UiSurfaceEvents<TLevel> {
  private readonly listeners = new Set<UiSurfaceEventListener<TLevel>>();

  constructor(
    private readonly levelPath: string,
    private readonly readLevel: () => TLevel,
  ) {}

  subscribe(listener: UiSurfaceEventListener<TLevel>): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(eventName: string): void {
    for (const listener of [...this.listeners]) {
      listener(eventName, this.levelPath, this.readLevel());
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}
