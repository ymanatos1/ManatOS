import { formatCtxPath } from '@manatos/shared-ui';

export interface CtxCaptionController {
  readonly element: HTMLElement;
  update(rootPath: string, selectedPath: string, revision: number): void;
}

export function createCtxCaption(document: Document): CtxCaptionController {
  const element = document.createElement('div');
  element.className = 'ctx-caption';

  const heading = document.createElement('strong');
  heading.textContent = 'CTX';
  const root = document.createElement('code');
  root.className = 'ctx-caption-root';
  const selection = document.createElement('span');
  selection.className = 'ctx-caption-selection';
  const revisionElement = document.createElement('span');
  revisionElement.className = 'ctx-caption-revision';
  revisionElement.title =
    'CTX revision: increments when the context tree changes; debugger UI actions do not change it.';
  revisionElement.dataset.multilingualTitle = 'CtxRevisionDescription';

  element.append(heading, root, selection, revisionElement);

  return {
    element,
    update(rootPath, selectedPath, revision) {
      root.title = rootPath;
      root.textContent = formatCtxPath(rootPath);
      selection.hidden = selectedPath === rootPath;
      selection.title = selectedPath;
      selection.textContent = selectedPath === rootPath ? '' : formatCtxPath(selectedPath);
      revisionElement.textContent = `r${revision}`;
    },
  };
}
