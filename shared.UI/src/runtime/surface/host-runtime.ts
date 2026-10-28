/**
 * UIS SURFACE ROOT — canonical CTX #level ownership.
 *
 * Path: ctx.ui.level[.level...]; namespaces: control/state/layout/data.
 * Publication is atomic; semantic roles are registered before observers run.
 * Disposal is child-safe and identity-checked: never remove another owner.
 * This module knows no Popup, List, Entry, component, browser or Flow logic.
 *
 * See: host-level-runtime.ts for Page/Entry/List content ownership,
 * embedded-runtime.ts for nested components, lifecycle.ts for cleanup.
 */
import {
  appendContextPathMember,
  ContextTreeRuntime,
  type ManatOSRuntimeRootContext,
} from '@manatos/shared';
import {
  assertUiSurfaceHasNoChild,
  registerUiSurfaceSemantics,
  releaseUiSurfaceSemantics,
} from './lifecycle.js';

/** The four canonical namespaces are owned and published by the Surface Host. */
export interface UiSurfaceLevelNamespaces {
  readonly control: object;
  readonly state: object;
  readonly layout: object;
  readonly data: object;
}

/**
 * Finds the parent of a popup in the one canonical CTX surface chain.
 * Explicit parents must belong to the active chain; there are no parallel roots.
 */
export function resolveUiSurfaceParentPath(
  context: ContextTreeRuntime<ManatOSRuntimeRootContext>,
  explicitParent: string | null = null,
): string {
  ensureUiContext(context);
  let parentPath = 'ctx.ui';
  for (let depth = 0; depth < 256; depth++) {
    if (parentPath !== 'ctx.ui' && explicitParent === parentPath) return parentPath;
    const childPath = appendContextPathMember(parentPath, 'level');
    const child = context.get(childPath);
    if (child === undefined) {
      if (explicitParent !== null)
        throw new Error(`UI parent surface is not in the active level chain: ${explicitParent}`);
      return parentPath;
    }
    if (!child || typeof child !== 'object' || Array.isArray(child))
      throw new Error(`Invalid UI surface at ${childPath}`);
    parentPath = childPath;
  }
  throw new Error('UI surface nesting exceeds the maximum depth of 256.');
}

function ensureUiContext(context: ContextTreeRuntime<ManatOSRuntimeRootContext>): void {
  const ui = context.get('ctx.ui');
  if (ui === undefined) context.add('ctx', 'ui', {});
  else if (!ui || typeof ui !== 'object' || Array.isArray(ui))
    throw new Error('The canonical UI context must be an object.');
}

/** Validate the root Page slot before initializing/mounting any page content. */
export function assertUiSurfaceRootAvailable(
  context: ContextTreeRuntime<ManatOSRuntimeRootContext>,
): void {
  ensureUiContext(context);
  if (context.get('ctx.ui.level') !== undefined)
    throw new Error('Cannot open a page UI surface while another root UI surface is active.');
}

/**
 * One framework-neutral owner for the CTX #level of Pages and Popups.
 * It does not know about DOM, tabs, routing, actions, or content components.
 * Construction is transactional and disposal is identity-checked and child-safe.
 */
export class UiSurfaceHostRuntime<T extends UiSurfaceLevelNamespaces> {
  readonly levelPath: string;
  private readonly semanticPaths: string[] = [];
  private disposed = false;

  constructor(
    private readonly context: ContextTreeRuntime<ManatOSRuntimeRootContext>,
    parentPath: string,
    private readonly published: T,
  ) {
    ensureUiContext(context);
    if (!/^ctx\.ui(?:\.level)*$/.test(parentPath))
      throw new Error(`Invalid UI surface parent: ${parentPath}`);
    if (parentPath !== 'ctx.ui') {
      const parent = context.get(parentPath);
      if (!parent || typeof parent !== 'object' || Array.isArray(parent))
        throw new Error(`UI parent surface does not exist: ${parentPath}`);
    }
    this.levelPath = appendContextPathMember(parentPath, 'level');
    if (context.get(this.levelPath) !== undefined)
      throw new Error(`Cannot open a UI surface while ${this.levelPath} is active.`);

    // Never publish a partially constructed namespace tree. Retain insertion
    // order for the CTX viewer and register roles before synchronous observers.
    for (const name of ['control', 'state', 'layout', 'data'] as const) {
      if (!published[name] || typeof published[name] !== 'object' || Array.isArray(published[name]))
        throw new Error(`Invalid UI surface #${name} namespace.`);
    }
    try {
      registerUiSurfaceSemantics(
        this.levelPath,
        (path, kind) => context.registerSemanticKind(path, kind),
        this.semanticPaths,
      );
      context.add(parentPath, 'level', published);
    } catch (error) {
      try {
        if (context.get(this.levelPath) === published) context.delete(this.levelPath);
      } finally {
        releaseUiSurfaceSemantics(this.semanticPaths, (path) =>
          context.unregisterSemanticKind(path),
        );
      }
      throw error;
    }
  }

  get level(): T {
    if (this.disposed || this.context.get(this.levelPath) !== this.published)
      throw new Error('The UI surface is no longer active.');
    return this.published;
  }

  /** Attach notification to a nested surface's removal without modifying its owner. */
  onChildClosed(callback: () => void, label: string): () => void {
    const childPath = appendContextPathMember(this.levelPath, 'level');
    return this.context.subscribe(
      () => {
        if (
          !this.disposed &&
          this.context.get(this.levelPath) === this.published &&
          this.context.get(childPath) === undefined
        )
          callback();
      },
      { path: childPath, recursive: false, label },
    );
  }

  hasChild(): boolean {
    return (
      this.context.get(this.levelPath) === this.published &&
      this.context.get(appendContextPathMember(this.levelPath, 'level')) !== undefined
    );
  }

  /** Remove only this surface. Its parent and sibling context are untouched. */
  dispose(): void {
    if (this.disposed) return;
    // Another owner may have replaced this CTX path. Never erase its surface
    // or semantic roles, even when this retired instance is disposed later.
    if (this.context.get(this.levelPath) !== this.published) {
      this.disposed = true;
      this.semanticPaths.length = 0;
      return;
    }
    assertUiSurfaceHasNoChild(this.levelPath, (path) => this.context.get(path));
    this.disposed = true;
    try {
      this.context.delete(this.levelPath);
    } finally {
      releaseUiSurfaceSemantics(this.semanticPaths, (path) =>
        this.context.unregisterSemanticKind(path),
      );
    }
  }
}
