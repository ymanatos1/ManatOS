/**
 * UIS PAGE CONTENT HOST — bridges a Page/Popup content runtime to #level.
 *
 * Content initializes state/data/layout; UiSurfaceHostRuntime publishes them.
 * set() mutates only owned state/data; publish() batches derived projections.
 * Nested popups defer parent teardown until the child Surface is closed.
 *
 * See: host-runtime.ts (CTX owner), embedded-runtime.ts (components),
 * components/list/ListPageRuntime.ts, components/entry/EntryRuntime.ts.
 */
import { ContextTreeRuntime, type ManatOSRuntimeRootContext } from '@manatos/shared';
import { disposeUiSurfaceResources } from './lifecycle.js';
import type { UiSurfaceInvocation } from './invocation.js';
import {
  UiSurfaceHostRuntime,
  assertUiSurfaceRootAvailable,
  resolveUiSurfaceParentPath,
} from './host-runtime.js';

/** Narrow content-to-Surface contract. Content never creates, replaces, or disposes its Host. */
export interface UiSurfaceContentContext<
  T extends { control: object; state: object; layout: object; data: object },
> {
  readonly levelPath: string;
  readonly level: T;
  subscribe(listener: (level: T) => void, label: string): () => void;
  set(relativePath: string, value: unknown): void;
  /** Single CTX revision for a coordinated state/data resource transition. */
  publish(state: T['state'], data: T['data']): void;
}

/** Generic lifecycle owner for a page-hosted semantic UI level. Content components supply only their subtrees. */
export class UiHostLevelRuntime<
  T extends { control: object; state: object; layout: object; data: object },
> {
  readonly levelPath: string;
  private readonly owner: UiSurfaceHostRuntime<T>;
  private disposed = false;
  private pendingClose: (() => void) | null = null;

  constructor(
    private readonly context: ContextTreeRuntime<ManatOSRuntimeRootContext>,
    control: T['control'] & {
      host: 'page' | 'popup';
      kind: string;
      instanceId: string;
      invocation: UiSurfaceInvocation;
    },
    initialize: () => { state: T['state']; layout: T['layout']; data: T['data'] },
    private readonly releaseContent?: () => void,
    parentLevelPath: string | null = null,
  ) {
    // A standalone Page owns the root. A Page reached from an existing List
    // may instead be nested under that *actual* parent Surface. Popups use
    // the identical owner contract and never create parallel CTX roots.
    const rootPage = control.host === 'page' && parentLevelPath === null;
    if (rootPage) assertUiSurfaceRootAvailable(context);
    const parent = rootPage ? 'ctx.ui' : resolveUiSurfaceParentPath(context, parentLevelPath);
    this.levelPath = `${parent}.level`;
    const contents = initialize();
    // The common surface owner publishes the canonical four namespaces.
    this.owner = new UiSurfaceHostRuntime(context, parent, {
      control,
      state: contents.state,
      layout: contents.layout,
      data: contents.data,
    } as T);
  }

  get level(): T {
    return this.owner.level;
  }

  private isOwned(): boolean {
    if (this.disposed) return false;
    try {
      return this.context.get(this.levelPath) === this.owner.level;
    } catch {
      return false;
    }
  }

  subscribe(listener: (level: T) => void, label: string): () => void {
    if (this.disposed) return () => {};
    return this.context.subscribe(
      () => {
        if (this.isOwned()) listener(this.level);
      },
      { path: this.levelPath, recursive: true, label },
    );
  }

  set(relativePath: string, value: unknown): void {
    if (this.disposed || !this.isOwned()) return;
    if (!/^(state|data)(?:\.[a-zA-Z][a-zA-Z0-9]*)+$/.test(relativePath))
      throw new Error('Invalid owned UI surface value path.');
    this.context.set(`${this.levelPath}.${relativePath}`, value);
  }

  publish(state: T['state'], data: T['data']): void {
    if (!this.isOwned()) return;
    // Preserve #level and #layout ownership. Only state/data contents change.
    this.context.setMembers(this.levelPath, { state, data });
  }

  /** Preserve a live nested popup; release only after the child exits. */
  dispose(): void {
    if (this.disposed) return;
    if (this.owner.hasChild() && this.isOwned()) {
      if (!this.pendingClose) {
        this.pendingClose = this.owner.onChildClosed(
          () => this.dispose(),
          'page-surface:deferred-close',
        );
      }
      return;
    }
    this.disposed = true;
    disposeUiSurfaceResources([
      () => {
        this.pendingClose?.();
        this.pendingClose = null;
      },
      () => this.releaseContent?.(),
      () => this.owner.dispose(),
    ]);
  }
}
