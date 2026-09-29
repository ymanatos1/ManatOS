export type UiCtxObject = Record<string, unknown>;

export interface UiCtxChange {
  readonly operation: string;
  readonly path: string;
  readonly relatedPaths?: readonly string[];
  readonly oldValue?: unknown;
  readonly newValue?: unknown;
  readonly cause?: UiCtxMutationCause;
}

export interface UiCtxSubscriptionDetails {
  readonly kind?: string;
  readonly label?: string;
}

export interface UiCtxMutationCause {
  readonly source?: string;
  readonly triggerPath?: string;
  readonly [key: string]: unknown;
}

/**
 * Narrow contract over the canonical browser CTX runtime. The V2 runtime does
 * not copy CTX values: every UiContext points at the exact object already held
 * by window.ManatOS.ctx.value.
 */
export interface UiCtxRuntimePort {
  readonly value: UiCtxObject;
  get(path: string): unknown;
  set(path: string, value: unknown, cause?: UiCtxMutationCause): unknown;
  replace(path: string, value: unknown, cause?: UiCtxMutationCause): unknown;
  delete(path: string, cause?: UiCtxMutationCause): unknown;
  add(path: string, value: unknown, cause?: UiCtxMutationCause): unknown;
  subscribe?(
    path: string,
    listener: (change: UiCtxChange) => void,
    details?: UiCtxSubscriptionDetails,
  ): () => void;
}

/** Canonical CTX scope owned/referenced by one live UiLevel. */
export class UiContext {
  #value: UiCtxObject;

  constructor(
    public readonly path: string,
    value: UiCtxObject,
    readonly port: UiCtxRuntimePort,
  ) {
    this.#value = value;
  }

  get value(): UiCtxObject {
    return this.#value;
  }

  get(relativePath = ''): unknown {
    return relativePath ? this.port.get(`${this.path}.${relativePath}`) : this.#value;
  }

  set(relativePath: string, value: unknown, cause?: UiCtxMutationCause): unknown {
    return this.port.set(this.#childPath(relativePath), value, cause);
  }

  replace(relativePath: string, value: unknown, cause?: UiCtxMutationCause): unknown {
    return this.port.replace(this.#childPath(relativePath), value, cause);
  }

  delete(relativePath: string, cause?: UiCtxMutationCause): unknown {
    return this.port.delete(this.#childPath(relativePath), cause);
  }

  /** Remove this complete CTX scope through the canonical mutation authority. */
  deleteSelf(cause?: UiCtxMutationCause): unknown {
    return this.port.delete(this.path, cause);
  }

  add(relativePath: string, value: unknown, cause?: UiCtxMutationCause): unknown {
    return this.port.add(this.#childPath(relativePath), value, cause);
  }

  pathOf(relativePath = ''): string {
    const normalized = relativePath.trim().replace(/^\.+|\.+$/g, '');
    return normalized ? `${this.path}.${normalized}` : this.path;
  }

  subscribe(
    relativePath: string,
    listener: (change: UiCtxChange) => void,
    details?: UiCtxSubscriptionDetails,
  ): () => void {
    if (!this.port.subscribe) throw new Error('Canonical CTX subscriptions are not available.');
    return this.port.subscribe(this.pathOf(relativePath), listener, details);
  }

  child(relativePath: string): UiContext | null {
    const value = this.get(relativePath);
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
    return new UiContext(this.#childPath(relativePath), value as UiCtxObject, this.port);
  }

  /**
   * Rebind after the canonical CTX authority replaces this complete scope object.
   * UiLevel identity survives; value still points to the exact canonical object.
   */
  rebindCanonical(value: UiCtxObject): void {
    this.#value = value;
  }

  #childPath(relativePath: string): string {
    const normalized = relativePath.trim().replace(/^\.+|\.+$/g, '');
    if (!normalized) throw new Error('A relative CTX path is required for mutation.');
    return `${this.path}.${normalized}`;
  }
}
