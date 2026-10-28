import { refreshMultilingualElements } from '../../rendering/multilingual.js';
import { UiSurfaceLayoutHighlight } from '@manatos/shared-ui';
import {
  PopupWindowHost,
  ctxCliRootPath,
  formatCtxValue,
  nearestExistingCtxPath,
  searchCtx,
  type ApplicationState,
  type CtxCliCommandInput,
  type CtxSearchMode,
  type CtxSearchSyntax,
} from '@manatos/shared-ui';

import { createCli, type CliController } from './Cli.js';
import { createCtxCaption } from './ctxViewer/CtxCaption.js';
import { createCtxFind, type CtxFindController } from './ctxViewer/CtxFind.js';
import { createCtxToolbar } from './ctxViewer/CtxToolbar.js';
import { createCtxTree } from './ctxViewer/CtxTree.js';
import {
  createCtxProperties,
  type CtxPropertiesController,
} from './ctxViewer/ctxProperties/CtxProperties.js';

const CTX_FIND_HISTORY_LIMIT = 30;

export interface CtxViewerOptions {
  readonly state: ApplicationState;
  readonly context: ApplicationState['context'];
  readonly rootPath?: string;
  readonly closeable?: boolean;
  readonly expressionCapabilityDelegate?: CtxCliCommandInput['expressionCapabilityDelegate'];
  readonly openPathRequested: (path: string) => void;
  readonly closeRequested?: () => void;
}

export interface CtxViewerController {
  readonly element: HTMLElement;
  readonly rootPath: string;
  readonly selectedPath: string;
  ownerDocumentChanged(): void;
  /** Explicit external reveal, including repeated requests for the same path. */
  reveal(path: string): void;
  destroy(): void;
}

export function createCtxViewer(
  document: Document,
  options: CtxViewerOptions,
): CtxViewerController {
  const rootPath = options.rootPath ?? 'ctx';
  const context = options.context;
  const surfaceHighlight = new UiSurfaceLayoutHighlight(document);
  const element = document.createElement('section');
  element.className = 'ctx-viewer debug-panel';
  element.setAttribute('aria-label', 'CTX viewer');
  element.dataset.multilingualAriaLabel = 'CtxViewer';

  let revision = context.revision;
  let desiredSelectedPath = rootPath;
  let selectedPath = rootPath;
  let expandedPaths: readonly string[] = [];
  let propertiesOpen = false;
  let findOpen = false;
  let cliOpen = false;
  let watchedPath: string | null = null;
  let watchChangedPath: string | null = null;
  let watchChangedTimer: ReturnType<typeof setTimeout> | null = null;
  let revealToken = 0;
  let searchText = '';
  let searchMode: CtxSearchMode = 'key';
  let searchSyntax: CtxSearchSyntax = 'wildcard';
  let searchHistory: readonly string[] = [];
  let cliCurrentPath = rootPath;
  const history: string[] = [];
  let historyIndex = 0;

  let findController: CtxFindController | null = null;
  let propertiesController: CtxPropertiesController | null = null;
  let cliController: CliController | null = null;
  let cliTargetPath: string | null = null;
  let cliHost: PopupWindowHost | null = null;
  let cliDetached = false;
  let initialCliRestorationPending = false;

  /** A detached CLI remains the same live native component: transcript/input are not cloned. */
  function toggleDetachCli(): void {
    if (rootPath !== 'ctx' || !cliController || cliController.isExecuting()) return;
    if (cliDetached) {
      const host = cliHost;
      cliHost = null;
      cliDetached = false;
      options.state.saveGlobalCliDetached(false);
      options.state.debuggerState.updateCtxView(rootPath, { cliMode: 'opened' });
      element.append(cliController.element);
      cliController.setDetached(false);
      cliController.ownerDocumentChanged();
      host?.close();
      return;
    }
    const host = new PopupWindowHost({
      title: 'ManatOS Global CLI',
      windowName: 'ManatOSGlobalCLI',
      defaultWidth: 720,
      defaultHeight: 420,
      layoutCss:
        'html, body { height:100%; margin:0; overflow:hidden; } body { display:flex; } body > .debugging-cli { height:100% !important; flex:1 1 100%; box-sizing:border-box; } .debugging-cli-resize { display:none; }',
      loadPlacement: () => options.state.globalCliWindowPlacement,
      savePlacement: (placement) => options.state.saveGlobalCliWindowPlacement(placement),
      closed: (reason) => {
        if (cliHost !== host) return;
        cliHost = null;
        cliDetached = false;
        options.state.saveGlobalCliDetached(false);
        if (reason === 'host-shutdown') return;
        // Native X closes CLI. The old document no longer hosts its DOM.
        cliOpen = false;
        options.state.debuggerState.updateCtxView(rootPath, { cliOpen: false, cliMode: 'closed' });
        options.state.debuggerState.saveGlobalCliSession(null);
        cliController?.destroy();
        cliController = null;
        cliTargetPath = null;
        updateView();
      },
    });
    const popup = host.open(document, document.defaultView, document);
    if (!popup) return;
    cliHost = host;
    cliDetached = true;
    options.state.saveGlobalCliDetached(true);
    options.state.debuggerState.updateCtxView(rootPath, { cliMode: 'detached' });
    popup.document.body.appendChild(cliController.element);
    cliController.setDetached(true);
    cliController.ownerDocumentChanged();
  }

  const toolbar = createCtxToolbar(document, {
    back: () => back(),
    forward: () => forward(),
    copy: () => copySelected(),
    watch: () => toggleWatch(),
    properties: () => toggleProperties(),
    find: () => toggleFind(),
    cli: () => toggleCli(),
    openView: () => options.openPathRequested(selectedPath),
  });

  const captionRow = document.createElement('div');
  captionRow.className = 'ctx-viewer-caption-row';
  const caption = createCtxCaption(document);
  captionRow.appendChild(caption.element);
  if (options.closeable) {
    const close = document.createElement('button');
    close.className = 'btn-close-debug';
    close.type = 'button';
    close.title = 'Close CTX view';
    close.dataset.multilingualTitle = 'CloseCtxView';
    close.textContent = '×';
    close.addEventListener('click', () => options.closeRequested?.());
    captionRow.appendChild(close);
  }

  const findRegion = document.createElement('div');
  findRegion.className = 'ctx-find-region';
  const propertiesRegion = document.createElement('div');
  propertiesRegion.className = 'ctx-properties-region';
  const tree = createCtxTree(document, context, rootPath, (path) => select(path), {
    expandedPaths,
    expandedPathsChanged(paths) {
      expandedPaths = paths;
      options.state.debuggerState.updateCtxView(rootPath, { expandedPaths: paths });
    },
    hovered(path) {
      surfaceHighlight.enter(path, context);
    },
    unhovered(path) {
      surfaceHighlight.leave(path);
    },
  });

  element.append(toolbar.element, captionRow, findRegion, propertiesRegion, tree.element);

  const currentSearchResults = () =>
    searchCtx(context, rootPath, searchText, { mode: searchMode, syntax: searchSyntax });

  function statistics(): string {
    if (rootPath !== 'ctx') return '';
    const stats = context.statistics(rootPath);
    const logicalSize =
      stats.bytes < 1024
        ? `~${stats.bytes} B`
        : stats.bytes < 1024 * 1024
          ? `~${(stats.bytes / 1024).toFixed(1)} KB`
          : `~${(stats.bytes / 1024 / 1024).toFixed(2)} MB`;
    return `${stats.nodes} nodes · ${logicalSize}`;
  }

  function loadState(): void {
    const view = options.state.debuggerState.ctxView(rootPath);
    desiredSelectedPath = view.selectedPath;
    selectedPath = nearestExistingCtxPath(context, desiredSelectedPath, rootPath);
    expandedPaths = view.expandedPaths;
    propertiesOpen = view.propertiesOpen;
    findOpen = view.findOpen;
    searchMode = view.findMode;
    searchSyntax = view.findSyntax;
    cliOpen = view.cliOpen;
    // NG1 restores the persisted mode once on mount, rather than allowing
    // subsequent UI-state notifications to change a live detached session.
    if (rootPath === 'ctx' && !initialCliRestorationPending && !cliController) {
      initialCliRestorationPending = view.cliMode === 'detached';
    }
    cliCurrentPath = nearestExistingCtxPath(context, view.cliCurrentPath, rootPath);
    watchedPath = view.watchedPath;

    const navigation = options.state.debuggerState.ctxNavigation(rootPath);
    history.splice(0, history.length, ...navigation.entries);
    if (!history.length) history.push(rootPath);
    historyIndex = Math.max(0, Math.min(history.length - 1, navigation.index));
  }

  function updateView(): void {
    toolbar.update({
      canBack: historyIndex > 0,
      canForward: historyIndex < history.length - 1,
      watched: watchedPath === selectedPath,
      propertiesOpen,
      findOpen,
      cliOpen,
      stats: statistics(),
    });
    caption.update(rootPath, selectedPath, revision);
    tree.update({
      selectedPath,
      expandedPaths,
      watchChangedPath,
      revealToken,
      revision,
      revealLastChildFirst: selectedPath.endsWith('.level'),
    });
    surfaceHighlight.sync(selectedPath, context);

    if (findOpen) {
      if (!findController) {
        findController = createCtxFind(
          document,
          {
            searchChanged(value) {
              searchText = value;
              updateFind();
            },
            modeChanged(value) {
              searchMode = value;
              options.state.debuggerState.updateCtxView(rootPath, { findMode: value });
              updateFind();
            },
            syntaxChanged(value) {
              searchSyntax = value;
              options.state.debuggerState.updateCtxView(rootPath, { findSyntax: value });
              updateFind();
            },
            previous: () => find(-1),
            next: () => find(1),
            historySelected(value) {
              searchText = value;
              find(1);
            },
            closeRequested() {
              findOpen = false;
              options.state.debuggerState.updateCtxView(rootPath, { findOpen: false });
              updateView();
            },
          },
          () => (options.state.currentLanguageId.toUpperCase() === 'EL' ? 'EL' : 'EN'),
        );
        findRegion.replaceChildren(findController.element);
        queueMicrotask(() => findController?.focus());
      }
      updateFind();
    } else if (findController) {
      findController.destroy();
      findController = null;
      findRegion.replaceChildren();
    }

    if (propertiesOpen) {
      const height = options.state.debuggerState.browser.ctxPropertiesHeight;
      if (!propertiesController) {
        propertiesController = createCtxProperties(
          document,
          context,
          selectedPath,
          revision,
          () => {
            propertiesOpen = false;
            options.state.debuggerState.updateCtxView(rootPath, { propertiesOpen: false });
            updateView();
          },
          (path) => select(path),
          height,
        );
        propertiesRegion.replaceChildren(propertiesController.element);
      }
      propertiesController.update(selectedPath, revision, height);
    } else if (propertiesController) {
      propertiesController.destroy();
      propertiesController = null;
      propertiesRegion.replaceChildren();
    }

    if (cliOpen) {
      const height = options.state.debuggerState.browser.cliHeight;
      if (!cliController) {
        cliController = createCli(document, {
          context,
          startPath: cliCurrentPath,
          language: () => (options.state.currentLanguage.id.toUpperCase() === 'EL' ? 'EL' : 'EN'),
          heightPreference: height,
          historyRuntime: options.state.cliHistory,
          expressionCapabilityDelegate: options.expressionCapabilityDelegate,
          expressionDiagnosticSink: options.state.diagnostics.expressionDiagnosticSink,
          caption: rootPath === 'ctx' ? 'Global CLI' : 'CTX CLI',
          canDetach: rootPath === 'ctx',
          detached: cliDetached,
          fontScalePercent: rootPath === 'ctx' ? options.state.globalCliFontScalePercent : 100,
          initialSession: rootPath === 'ctx' ? options.state.debuggerState.globalCliSession : null,
          sessionChanged: (snapshot) => {
            if (rootPath === 'ctx' && cliOpen)
              options.state.debuggerState.saveGlobalCliSession(snapshot);
          },
          fontScaleChanged: (percent) => {
            if (rootPath === 'ctx') options.state.saveGlobalCliFontScalePercent(percent);
          },
          detachRequested: () => toggleDetachCli(),
          closeRequested() {
            const host = cliHost;
            cliHost = null;
            cliDetached = false;
            host?.close();
            if (rootPath === 'ctx') options.state.saveGlobalCliDetached(false);
            cliOpen = false;
            if (rootPath === 'ctx') options.state.debuggerState.saveGlobalCliSession(null);
            options.state.debuggerState.updateCtxView(rootPath, {
              cliOpen: false,
              cliMode: 'closed',
            });
            updateView();
          },
          currentPathChanged(path) {
            cliCurrentPath = path;
            options.state.debuggerState.updateCtxView(rootPath, { cliCurrentPath: path });
          },
        });
        cliTargetPath = cliCurrentPath;
        element.appendChild(cliController.element);
      } else {
        cliController.setHeightPreference(height);
        if (cliTargetPath !== cliCurrentPath) {
          cliController.retarget(cliCurrentPath);
          cliTargetPath = cliCurrentPath;
        }
      }
    } else if (cliController) {
      const host = cliHost;
      cliHost = null;
      cliDetached = false;
      host?.close();
      cliController.destroy();
      cliController = null;
      cliTargetPath = null;
    }
    refreshMultilingualElements(
      element,
      options.state.currentLanguageId.toUpperCase() === 'EL' ? 'EL' : 'EN',
    );
  }

  function updateFind(): void {
    findController?.update({
      searchText,
      mode: searchMode,
      syntax: searchSyntax,
      history: searchHistory,
      matchCount: currentSearchResults().length,
    });
  }

  function saveHistory(): void {
    options.state.debuggerState.updateCtxNavigation(rootPath, history, historyIndex);
  }

  function select(path: string, recordHistory = true): void {
    const resolved = nearestExistingCtxPath(context, path, rootPath);
    if (selectedPath === resolved) {
      desiredSelectedPath = resolved;
      options.state.debuggerState.updateCtxView(rootPath, { selectedPath: resolved });
      revealToken += 1;
      surfaceHighlight.select(resolved, context);
      updateView();
      return;
    }

    desiredSelectedPath = resolved;
    selectedPath = resolved;
    revealToken += 1;
    options.state.debuggerState.updateCtxView(rootPath, { selectedPath: resolved });

    surfaceHighlight.select(resolved, context);
    if (recordHistory) {
      history.splice(historyIndex + 1);
      history.push(resolved);
      historyIndex = history.length - 1;
      saveHistory();
    }
    updateView();
  }

  function back(): void {
    if (historyIndex <= 0) return;
    historyIndex -= 1;
    saveHistory();
    select(history[historyIndex]!, false);
  }

  function forward(): void {
    if (historyIndex >= history.length - 1) return;
    historyIndex += 1;
    saveHistory();
    select(history[historyIndex]!, false);
  }

  function copySelected(): void {
    const text = formatCtxValue(context.get(selectedPath));
    void element.ownerDocument.defaultView?.navigator.clipboard?.writeText(text);
  }

  function toggleProperties(): void {
    propertiesOpen = !propertiesOpen;
    if (propertiesOpen) revealToken += 1;
    options.state.debuggerState.updateCtxView(rootPath, { propertiesOpen });
    updateView();
  }

  function toggleFind(): void {
    findOpen = !findOpen;
    if (findOpen) revealToken += 1;
    options.state.debuggerState.updateCtxView(rootPath, { findOpen });
    updateView();
  }

  function toggleCli(): void {
    // The CTX toolbar refocuses an already detached CLI; it must not close it.
    if (cliDetached) {
      cliHost?.window?.focus();
      return;
    }

    if (cliOpen) {
      cliOpen = false;
      if (rootPath === 'ctx') {
        options.state.debuggerState.saveGlobalCliSession(null);
        options.state.saveGlobalCliDetached(false);
      }
      options.state.debuggerState.updateCtxView(rootPath, {
        cliOpen: false,
        cliMode: 'closed',
      });
    } else {
      cliOpen = true;
      cliCurrentPath = ctxCliRootPath(context, selectedPath, rootPath);
      revealToken += 1;
      options.state.debuggerState.updateCtxView(rootPath, {
        cliOpen: true,
        cliMode: 'opened',
        cliCurrentPath,
      });
    }
    updateView();
  }

  function toggleWatch(): void {
    watchedPath = watchedPath === selectedPath ? null : selectedPath;
    options.state.debuggerState.updateCtxView(rootPath, { watchedPath });
    updateView();
  }

  function rememberSearch(term: string): void {
    searchHistory = [term, ...searchHistory.filter((entry) => entry !== term)].slice(
      0,
      CTX_FIND_HISTORY_LIMIT,
    );
  }

  function find(direction: -1 | 1): void {
    const term = searchText.trim();
    if (!term) return;
    rememberSearch(term);
    const results = currentSearchResults();
    if (!results.length) {
      updateFind();
      return;
    }
    const current = results.findIndex((result) => result.path === selectedPath);
    const next =
      current < 0
        ? direction > 0
          ? 0
          : results.length - 1
        : (current + direction + results.length) % results.length;
    select(results[next]!.path);
  }

  function pathsOverlap(left: string, right: string): boolean {
    return (
      left === right ||
      left.startsWith(`${right}.`) ||
      left.startsWith(`${right}[`) ||
      right.startsWith(`${left}.`) ||
      right.startsWith(`${left}[`)
    );
  }

  function recoverSelection(): void {
    const recovered = nearestExistingCtxPath(context, desiredSelectedPath, rootPath);
    if (recovered === selectedPath) return;
    selectedPath = recovered;
    revealToken += 1;
  }

  function handleWatchMutation(paths: readonly string[]): void {
    if (!watchedPath || !paths.some((path) => pathsOverlap(path, watchedPath!))) return;
    const recovered = nearestExistingCtxPath(context, watchedPath, rootPath);
    watchChangedPath = recovered;
    if (watchChangedTimer) clearTimeout(watchChangedTimer);
    watchChangedTimer = setTimeout(() => {
      watchChangedPath = null;
      watchChangedTimer = null;
      updateView();
    }, 1400);
  }

  const unsubscribeContext = context.subscribe(
    (mutation) => {
      revision = mutation.revision;
      // NG1-equivalent incremental tree update: never reconstruct all open rows
      // just because one visible CTX member changed.
      tree.applyMutation(mutation);
      recoverSelection();
      handleWatchMutation(mutation.paths);
      updateView();
    },
    { label: `CtxViewer:${rootPath}`, path: rootPath },
  );

  const unsubscribeState = options.state.subscribe((change) => {
    if (change === 'language') {
      updateFind();
      cliController?.refreshLanguage();
      refreshMultilingualElements(
        element,
        options.state.currentLanguageId.toUpperCase() === 'EL' ? 'EL' : 'EN',
      );
      return;
    }
    if (change !== 'uiState') return;
    loadState();
    updateView();
  });

  loadState();
  updateView();
  if (initialCliRestorationPending) {
    initialCliRestorationPending = false;
    // The viewer is mounted after construction; opening before then can
    // orphan the live CLI element or race its owner-document transition.
    queueMicrotask(() => {
      if (!element.isConnected || !cliOpen || !cliController || cliDetached) return;
      toggleDetachCli();
      if (!cliDetached) {
        // The browser may block a startup window. Keep the live CLI attached.
        options.state.saveGlobalCliDetached(false);
        options.state.debuggerState.updateCtxView(rootPath, { cliMode: 'opened', cliOpen: true });
      }
    });
  }

  return {
    element,
    rootPath,
    get selectedPath() {
      return selectedPath;
    },
    ownerDocumentChanged() {
      cliController?.ownerDocumentChanged();
    },
    reveal(path) {
      // Popup inspection does not push CTX navigation history. NG1 instead
      // requests a fresh reveal token while keeping the current root viewer.
      desiredSelectedPath = nearestExistingCtxPath(context, path, rootPath);
      selectedPath = desiredSelectedPath;
      revealToken += 1;
      options.state.debuggerState.updateCtxView(rootPath, { selectedPath });
      updateView();
    },
    destroy() {
      surfaceHighlight.dispose();
      unsubscribeState();
      unsubscribeContext();
      if (watchChangedTimer) clearTimeout(watchChangedTimer);
      watchChangedTimer = null;
      findController?.destroy();
      findController = null;
      propertiesController?.destroy();
      propertiesController = null;
      // Preserve the logical CLI and presentation mode across page teardown.
      // Closing the popup here is host cleanup, not a user request to close CLI.
      if (rootPath === 'ctx' && cliOpen) {
        const session = cliController?.captureSession();
        if (session) options.state.debuggerState.saveGlobalCliSession(session);
      }
      const popupHost = cliHost;
      cliHost = null;
      popupHost?.close();
      cliController?.destroy();
      cliController = null;
      cliTargetPath = null;
      toolbar.destroy();
      tree.destroy();
      element.remove();
    },
  };
}
