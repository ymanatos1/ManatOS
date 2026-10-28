/** Locate the deepest dirty Entry in the *actual* mounted UIS #level chain.
 * Both nested pages and popups participate; breadcrumbs do not establish ownership.
 * No cached snapshots and no mutation of CTX state.
 */
import type { ContextTreeRuntime, ManatOSRuntimeRootContext } from '@manatos/shared';
import type { UiEntryLevel } from '../../components/entry/EntryRuntime.js';

export function dirtyEntryInUiChain(
  tree: Pick<ContextTreeRuntime<ManatOSRuntimeRootContext>, 'get'>,
): UiEntryLevel | null {
  let path = 'ctx.ui.level';
  let dirty: UiEntryLevel | null = null;
  // Resource limit for corrupted/cyclic external trees; ordinary page depth is tiny.
  for (let depth = 0; depth < 64; depth++) {
    const node = tree.get(path);
    if (!node || typeof node !== 'object') break;
    const surface = node as Partial<UiEntryLevel>;
    if (surface.control?.kind === 'entry' && surface.state?.entry?.dirty === true)
      dirty = surface as UiEntryLevel;
    path += '.level';
  }
  return dirty;
}
