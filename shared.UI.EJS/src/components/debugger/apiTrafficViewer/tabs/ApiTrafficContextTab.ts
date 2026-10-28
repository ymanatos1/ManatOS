import { createApiTrafficContextRuntime, type ApiTrafficEntry } from '@manatos/shared-ui';

import { createCtxTree } from '../../ctxViewer/CtxTree.js';

type ApiDiagnosticContextSnapshot = NonNullable<
  NonNullable<ApiTrafficEntry['diagnostics']>['apiContext']
>;

export interface ApiTrafficContextTabController {
  readonly element: HTMLElement;
  destroy(): void;
}

export function createApiTrafficContextTab(
  document: Document,
  snapshot: ApiDiagnosticContextSnapshot,
  expandAllInitially = false,
): ApiTrafficContextTabController {
  const element = document.createElement('div');
  element.className = 'api-traffic-context-tab';

  const caption = document.createElement('div');
  caption.className = 'api-traffic-context-caption';
  const path = document.createElement('strong');
  path.textContent = snapshot.path;
  caption.appendChild(path);
  if (snapshot.subsystem) {
    const subsystem = document.createElement('span');
    subsystem.textContent = snapshot.subsystem;
    caption.appendChild(subsystem);
  }
  if (snapshot.levelIds?.length) {
    const levels = document.createElement('code');
    levels.textContent = snapshot.levelIds.join(' / ');
    caption.appendChild(levels);
  }

  const treeRegion = document.createElement('div');
  treeRegion.className = 'api-traffic-context-tree';
  const context = createApiTrafficContextRuntime(snapshot);
  let selectedPath = 'ctx';
  const tree = createCtxTree(
    document,
    context,
    'ctx',
    (selected) => {
      selectedPath = selected;
      tree.update({ selectedPath, watchChangedPath: null, revealToken: 0, revision: 0 });
    },
    { expandAllInitially },
  );
  tree.update({ selectedPath, watchChangedPath: null, revealToken: 0, revision: 0 });
  treeRegion.appendChild(tree.element);
  element.append(caption, treeRegion);

  return {
    element,
    destroy() {
      tree.destroy();
      element.remove();
    },
  };
}
