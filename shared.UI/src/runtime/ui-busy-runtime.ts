/** Delay before presenting a foreground operation as busy. */
export const UI_BUSY_SHOW_DELAY_MS = 180;

export interface UiBusyPresentation {
  readonly title?: string;
  readonly message?: string;
  readonly icon?: string;
  readonly actionLabel?: string;
  readonly onAction?: () => void;
}

export interface UiBusySnapshot {
  readonly visible: boolean;
  readonly activeCount: number;
  readonly presentation: UiBusyPresentation;
}

/**
 * Tracks explicitly marked foreground operations only.
 *
 * Background requests, page loading and popup opening do not
 * invoke this runtime automatically.
 */
export class UiBusyRuntime {
  private readonly operations = new Map<number, UiBusyPresentation>();
  private readonly listeners = new Set<(state: UiBusySnapshot) => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private sequence = 0;
  private visible = false;

  constructor(private readonly delayMs = UI_BUSY_SHOW_DELAY_MS) {}

  snapshot(): UiBusySnapshot {
    return {
      visible: this.visible,
      activeCount: this.operations.size,
      presentation: this.operations.values().next().value ?? {},
    };
  }

  subscribe(listener: (state: UiBusySnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  /** Returns an idempotent end function; overlapping operations are supported. */
  begin(presentation: UiBusyPresentation = {}): () => void {
    const id = ++this.sequence;
    this.operations.set(id, presentation);

    if (this.operations.size === 1) {
      this.timer = setTimeout(() => {
        this.timer = null;
        if (this.operations.size === 0) return;
        this.visible = true;
        this.notify();
      }, this.delayMs);
    } else if (this.visible) {
      this.notify();
    }

    let ended = false;

    return () => {
      if (ended) return;
      ended = true;
      this.operations.delete(id);

      if (this.operations.size === 0) {
        if (this.timer !== null) clearTimeout(this.timer);
        this.timer = null;
        this.visible = false;
      }

      this.notify();
    };
  }

  /** Always releases the busy indication, including on API errors. */
  async run<T>(operation: () => Promise<T>, presentation: UiBusyPresentation = {}): Promise<T> {
    const end = this.begin(presentation);

    try {
      return await operation();
    } finally {
      end();
    }
  }

  private notify(): void {
    const state = this.snapshot();
    for (const listener of this.listeners) listener(state);
  }
}
