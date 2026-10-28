export interface CtxToolbarState {
  readonly canBack: boolean;
  readonly canForward: boolean;
  readonly watched: boolean;
  readonly propertiesOpen: boolean;
  readonly findOpen: boolean;
  readonly cliOpen: boolean;
  readonly stats: string;
}

export interface CtxToolbarCallbacks {
  readonly back: () => void;
  readonly forward: () => void;
  readonly copy: () => void;
  readonly watch: () => void;
  readonly properties: () => void;
  readonly find: () => void;
  readonly cli: () => void;
  readonly openView: () => void;
}

export interface CtxToolbarController {
  readonly element: HTMLElement;
  update(state: CtxToolbarState): void;
  destroy(): void;
}

interface ToolbarButton {
  readonly element: HTMLButtonElement;
  readonly action: keyof CtxToolbarCallbacks;
}

export function createCtxToolbar(
  document: Document,
  callbacks: CtxToolbarCallbacks,
): CtxToolbarController {
  const abortController = new AbortController();
  const element = document.createElement('div');
  element.className = 'debug-panel-tools ctx-toolbar';
  element.setAttribute('role', 'toolbar');
  element.setAttribute('aria-label', 'CTX viewer controls');
  element.dataset.multilingualAriaLabel = 'CtxViewerControls';

  const makeButton = (
    action: keyof CtxToolbarCallbacks,
    icon: string,
    title: string,
    titleKey: string,
  ): ToolbarButton => {
    const button = document.createElement('button');
    button.className = 'debug-tool-button';
    button.type = 'button';
    button.title = title;
    button.dataset.debugTooltip = title;
    button.dataset.multilingualTitle = titleKey;
    button.dataset.multilingualTooltip = titleKey;
    const iconElement = document.createElement('i');
    iconElement.className = `bi ${icon}`;
    iconElement.setAttribute('aria-hidden', 'true');
    button.appendChild(iconElement);
    button.addEventListener('click', callbacks[action], { signal: abortController.signal });
    return { element: button, action };
  };

  const navigation = document.createElement('span');
  navigation.className = 'debug-toolbar-group';
  const back = makeButton(
    'back',
    'bi-arrow-left',
    'Previous CTX selection',
    'PreviousCtxSelection',
  );
  const forward = makeButton('forward', 'bi-arrow-right', 'Next CTX selection', 'NextCtxSelection');
  navigation.append(back.element, forward.element);

  const observation = document.createElement('span');
  observation.className = 'debug-toolbar-group';
  const copy = makeButton('copy', 'bi-copy', 'Copy selected node as JSON text', 'CopyCtxJson');
  const watch = makeButton(
    'watch',
    'bi-eye',
    'Watch selected CTX value for changes',
    'WatchCtxValue',
  );
  observation.append(copy.element, watch.element);

  const tools = document.createElement('span');
  tools.className = 'debug-toolbar-group';
  const properties = makeButton(
    'properties',
    'bi-info-square',
    'Selected node properties',
    'SelectedNodeProperties',
  );
  const find = makeButton(
    'find',
    'bi-search',
    'Find CTX variable by key or value',
    'FindCtxVariable',
  );
  const cli = makeButton('cli', 'bi-terminal', 'Open CLI at selected CTX node', 'OpenCtxCli');
  const openView = makeButton(
    'openView',
    'bi-window-plus',
    'Open selected CTX node in a dedicated view tab',
    'OpenCtxViewTab',
  );
  tools.append(properties.element, find.element, cli.element, openView.element);

  const stats = document.createElement('span');
  stats.className = 'ctx-debug-stats';
  stats.dataset.debugTooltip = 'CTX size';
  stats.dataset.multilingualTooltip = 'CtxSize';
  stats.dataset.debugTooltipDetail =
    'Logical CTX nodes and approximate logical payload. Actual JavaScript heap usage may differ.';
  stats.dataset.multilingualTooltipDetail = 'CtxSizeDescription';

  element.append(navigation, observation, tools, stats);

  return {
    element,
    update(state) {
      back.element.disabled = !state.canBack;
      forward.element.disabled = !state.canForward;
      watch.element.classList.toggle('is-active', state.watched);
      properties.element.classList.toggle('is-active', state.propertiesOpen);
      find.element.classList.toggle('is-active', state.findOpen);
      cli.element.classList.toggle('is-active', state.cliOpen);
      stats.textContent = state.stats;
      stats.hidden = !state.stats;
    },
    destroy() {
      abortController.abort();
    },
  };
}
