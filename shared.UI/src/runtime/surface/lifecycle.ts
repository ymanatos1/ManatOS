/**
 * UIS LIFECYCLE UTILITIES — namespace semantic roles and safe teardown.
 *
 * Register only roles owned by the current Surface; unregister on disposal.
 * Child surfaces must close before their parent. Cleanup runs every step,
 * preserving the first error rather than leaking later resources.
 * See: host-runtime.ts, host-level-runtime.ts, embedded-runtime.ts.
 */
import { appendContextPathMember } from '@manatos/shared';

/**
 * Register the canonical semantic roles owned by one UI surface.
 * The caller supplies the CTX registration operation and retains
 * ownership of the resulting paths for later cleanup.
 */
export function registerUiSurfaceSemantics(
  levelPath: string,
  register: (path: string, kind: string) => void,
  ownedPaths: string[],
): void {
  const registerOwned = (path: string, kind: string): void => {
    register(path, kind);
    ownedPaths.push(path);
  };

  registerOwned(levelPath, 'ui-level');

  for (const [member, kind] of [
    ['control', 'ui-control'],
    ['state', 'ui-state'],
    ['layout', 'ui-layout'],
    ['data', 'ui-data'],
  ] as const) {
    registerOwned(appendContextPathMember(levelPath, member), kind);
  }
}

/**
 * Release only semantic annotations registered by this surface.
 */
export function releaseUiSurfaceSemantics(
  ownedPaths: string[],
  unregister: (path: string) => void,
): void {
  for (const path of ownedPaths) unregister(path);
  ownedPaths.length = 0;
}

/**
 * A surface cannot be disposed while it owns a live nested surface.
 */
export function assertUiSurfaceHasNoChild(levelPath: string, get: (path: string) => unknown): void {
  if (get(appendContextPathMember(levelPath, 'level')) !== undefined) {
    throw new Error(`Cannot dispose ${levelPath} while its child surface remains open.`);
  }
}

/**
 * Execute every owned cleanup operation, even when an earlier
 * operation fails. Preserve and report the first failure.
 */
export function disposeUiSurfaceResources(steps: readonly (() => void)[]): void {
  let firstError: unknown;

  for (const step of steps) {
    try {
      step();
    } catch (error) {
      firstError ??= error;
    }
  }

  if (firstError !== undefined) throw firstError;
}
