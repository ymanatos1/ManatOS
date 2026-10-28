import {
  AfterViewInit,
  ApplicationRef,
  ComponentRef,
  DestroyRef,
  EnvironmentInjector,
  createComponent,
  inject,
  Component,
  OnChanges,
  OnDestroy,
  OnInit,
  SimpleChanges,
  computed,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import type {
  ContextTreeRuntime,
  ExpressionCapabilityDelegate,
  ManatOSRuntimeRootContext,
} from '@manatos/shared';
import {
  PopupWindowHost,
  ctxCliRootPath,
  formatCtxValue,
  nearestExistingCtxPath,
  searchCtx,
  type ApplicationState,
  type CtxSearchMode,
  type CtxSearchSyntax,
  multilingual,
} from '@manatos/shared-ui';

import { Cli, type CliSessionSnapshot } from './Cli';
import { CtxCaption } from './ctxViewer/CtxCaption';
import { CtxFind } from './ctxViewer/CtxFind';
import { CtxToolbar } from './ctxViewer/CtxToolbar';
import { CtxTree } from './ctxViewer/CtxTree';
import { CtxProperties } from './ctxViewer/ctxProperties/CtxProperties';

const CTX_FIND_HISTORY_LIMIT = 30;

@Component({
  selector: 'manatos-ctx-viewer',
  standalone: true,
  imports: [CtxCaption, CtxFind, CtxToolbar, CtxTree, CtxProperties, Cli],
  templateUrl: './CtxViewer.html',
  styleUrl: './CtxViewer.css',
})
export class CtxViewer implements OnInit, OnChanges, AfterViewInit, OnDestroy {
  protected readonly multilingual = computed(() =>
    multilingual(this.state()?.currentLanguage.id === 'el' ? 'EL' : 'EN', [
      'CtxViewer',
      'CloseCtxView',
    ] as const),
  );

  readonly context = input.required<ContextTreeRuntime<ManatOSRuntimeRootContext>>();
  readonly state = input<ApplicationState | null>(null);
  readonly rootPath = input('ctx');
  readonly requestedRevealPath = input<string | null>(null);
  readonly requestedRevealToken = input(0);
  readonly layoutHighlightEnabled = input(true);
  readonly expressionCapabilityDelegate = input<ExpressionCapabilityDelegate | null>(null);
  readonly closeable = input(false);
  readonly openPathRequested = output<string>();
  readonly closeRequested = output<void>();
  readonly cliDetachedChanged = output<boolean>();

  protected readonly revision = signal(0);
  protected readonly selectedPath = signal('ctx');
  protected readonly expandedPaths = signal<readonly string[]>([]);
  protected readonly propertiesOpen = signal(false);
  protected readonly findOpen = signal(false);
  /** Single authoritative presentation state: only these three modes are valid. */
  protected readonly cliMode = signal<'closed' | 'opened' | 'detached'>('closed');
  protected readonly cliFontScale = signal(100);
  private readonly applicationRef = inject(ApplicationRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly environmentInjector = inject(EnvironmentInjector);
  private readonly attachedCli = viewChild(Cli);
  protected readonly cliSession = signal<CliSessionSnapshot | null>(null);
  private detachedCli: ComponentRef<Cli> | null = null;
  private cliHost: PopupWindowHost | null = null;
  private shuttingDown = false;
  private initialCliStateLoaded = false;

  /** Create a new Angular CLI presentation in the popup, not a relocated DOM node. */
  private openDetachedCli(session: CliSessionSnapshot): boolean {
    const state = this.state();
    const host = new PopupWindowHost({
      title: 'ManatOS Global CLI',
      windowName: 'ManatOSGlobalCLI',
      defaultWidth: 720,
      defaultHeight: 420,
      // The popup hosts its own CLI component; the dock's attached-panel sizing must not
      // constrain the independent window. Keep these overrides scoped to this popup.
      layoutCss: `
        html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; }
        body { display: flex; min-width: 0; }
        body > manatos-debug-cli {
          display: flex !important;
          flex: 1 1 100% !important;
          width: 100% !important;
          min-width: 0 !important;
          max-width: none !important;
          height: 100% !important;
          box-sizing: border-box;
        }
        body > manatos-debug-cli > .debugging-cli-dock {
          width: 100% !important;
          max-width: none !important;
          min-width: 0 !important;
          height: 100% !important;
          box-sizing: border-box;
        }
        .debugging-cli-resize { display: none; }
      `,
      loadPlacement: () => state?.globalCliWindowPlacement ?? null,
      savePlacement: (placement) => state?.saveGlobalCliWindowPlacement(placement),
      closed: (_reason, placement) => {
        // A failed popup initialization must leave the attached CLI untouched.
        if (this.cliHost !== host) return;
        if (placement) state?.saveGlobalCliWindowPlacement(placement);
        if (this.shuttingDown) return;
        // A native popup X means Closed. Attach and explicit Close invalidate the
        // host reference before closing, so this callback handles only native closes.
        this.cliHost = null;
        this.releaseDetachedCli();
        this.transitionCli('closed');
      },
    });
    const popup = host.open(document, window, document);
    if (!popup) return false;
    const element = popup.document.createElement('manatos-debug-cli');
    popup.document.body.replaceChildren(element);
    try {
      const component = createComponent(Cli, {
        environmentInjector: this.environmentInjector,
        hostElement: element,
      });
      this.detachedCli = component;
      component.setInput('context', this.context());
      component.setInput('startPath', session.currentPath);
      component.setInput('initialSession', session);
      component.setInput('caption', 'Global CLI');
      component.setInput(
        'language',
        state?.currentLanguage.id.toUpperCase() === 'EL' ? 'EL' : 'EN',
      );
      component.setInput('detached', true);
      component.setInput('canDetach', true);
      component.setInput('fontScalePercent', this.cliFontScale());
      component.setInput('historyRuntime', state?.cliHistory ?? null);
      component.setInput('expressionCapabilityDelegate', this.expressionCapabilityDelegate());
      component.setInput(
        'expressionDiagnosticSink',
        state?.diagnostics?.expressionDiagnosticSink ?? null,
      );
      component.instance.detachRequested.subscribe(() => this.detachCli());
      component.instance.closeRequested.subscribe(() => this.closeCli());
      component.instance.currentPathChanged.subscribe((path) => this.setCliCurrentPath(path));
      component.instance.sessionChanged.subscribe((snapshot) => this.saveCliSession(snapshot));
      component.instance.fontScaleChanged.subscribe((percent) => {
        this.setCliFontScale(percent);
        component.setInput('fontScalePercent', percent);
        component.changeDetectorRef.detectChanges();
      });
      this.applicationRef.attachView(component.hostView);
      component.changeDetectorRef.detectChanges();
      this.cliHost = host;
      return true;
    } catch {
      this.releaseDetachedCli();
      host.close();
      return false;
    }
  }

  private releaseDetachedCli(): void {
    const component = this.detachedCli;
    this.detachedCli = null;
    if (!component) return;
    this.applicationRef.detachView(component.hostView);
    component.destroy();
  }
  protected readonly watchedPath = signal<string | null>(null);
  protected readonly watchChangedPath = signal<string | null>(null);
  protected readonly revealToken = signal(0);
  protected readonly searchText = signal('');
  protected readonly searchMode = signal<CtxSearchMode>('key');
  protected readonly searchSyntax = signal<CtxSearchSyntax>('wildcard');
  protected readonly searchHistory = signal<readonly string[]>([]);
  protected readonly cliCurrentPath = signal('ctx');
  protected readonly ctxPropertiesHeight = signal<number | null>(null);
  protected readonly cliHeight = signal<number | null>(null);

  private readonly visibleTree = viewChild(CtxTree);
  private desiredSelectedPath = 'ctx';
  private readonly history: string[] = [];
  private readonly historyIndex = signal(-1);
  private unsubscribeContext: (() => void) | null = null;
  private unsubscribeState: (() => void) | null = null;
  private watchChangedTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly searchResults = computed(() => {
    this.revision();
    return searchCtx(this.context(), this.rootPath(), this.searchText(), {
      mode: this.searchMode(),
      syntax: this.searchSyntax(),
    });
  });

  protected readonly statistics = computed(() => {
    this.revision();
    const stats = this.context().statistics(this.rootPath());
    return `${stats.nodes} nodes · ${this.formatLogicalSize(stats.bytes)}`;
  });

  protected readonly canBack = computed(() => this.historyIndex() > 0);
  protected readonly canForward = computed(
    () => this.historyIndex() >= 0 && this.historyIndex() < this.history.length - 1,
  );

  private initialized = false;

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.initialized) return;

    if (changes['requestedRevealPath'] || changes['requestedRevealToken']) {
      this.revealRequestedPath();
    }
  }

  /**
   * Use the EXISTING CTX selection and reveal behavior.
   *
   * Do not open a dedicated CTX tab. CtxTree already expands
   * ancestors and scrolls the selected row into view.
   */
  private revealRequestedPath(): void {
    if (this.rootPath() !== 'ctx') return;
    if (this.requestedRevealToken() <= 0) return;

    const path = this.requestedRevealPath();
    if (!path || this.context().get(path) === undefined) return;

    this.select(path);
  }

  ngOnInit(): void {
    const root = this.rootPath();
    this.loadState();
    // Persist the first opening of a dedicated CTX root before subscribing to
    // UI-state changes. Otherwise a later state notification can restore an
    // empty expansion list and collapse the root that was opened locally.
    if (root !== 'ctx' && this.expandedPaths().includes(root)) {
      const saved = this.state()?.debuggerState.ctxView(root);
      if (saved && saved.expandedPaths.length === 0)
        this.state()?.debuggerState.updateCtxView(root, { expandedPaths: [root] });
    }
    if (!this.history.length) {
      this.history.push(root);
      this.historyIndex.set(0);
    }

    this.revision.set(this.context().revision);
    this.unsubscribeContext = this.context().subscribe(
      (mutation) => {
        this.visibleTree()?.applyMutation(mutation);
        this.revision.set(mutation.revision);
        this.recoverSelection();
        this.handleWatchMutation(mutation.paths);
      },
      { label: `CtxViewer:${root}`, path: root },
    );

    const state = this.state();
    if (state) {
      this.unsubscribeState = state.subscribe((change) => {
        if (change === 'uiState') this.loadState();
        if (change === 'language' && this.detachedCli) {
          this.detachedCli.setInput(
            'language',
            state.currentLanguage.id.toUpperCase() === 'EL' ? 'EL' : 'EN',
          );
          this.detachedCli.changeDetectorRef.detectChanges();
        }
      });
    }

    this.initialized = true;
    this.revealRequestedPath();
  }

  ngAfterViewInit(): void {
    // Browsers may block startup popups; an unsuccessful restoration keeps the CLI attached.
    if (this.rootPath() !== 'ctx' || this.cliMode() !== 'detached') return;
    queueMicrotask(() => {
      if (this.destroyRef.destroyed || this.shuttingDown || this.cliMode() !== 'detached') return;
      const session = this.cliSession() ?? this.newCliSession();
      if (!this.openDetachedCli(session)) this.transitionCli('opened');
      else this.cliDetachedChanged.emit(true);
    });
  }

  ngOnDestroy(): void {
    if (this.rootPath() === 'ctx' && this.cliMode() === 'opened') {
      const snapshot = this.attachedCli()?.captureSession();
      if (snapshot) this.saveCliSession(snapshot);
    }
    if (this.rootPath() === 'ctx' && this.cliMode() === 'detached') {
      const snapshot = this.detachedCli?.instance.captureSession();
      if (snapshot) this.saveCliSession(snapshot);
    }
    this.shuttingDown = true;
    // Disconnect the owner first: host shutdown must not run the native-close transition.
    const host = this.cliHost;
    this.cliHost = null;
    host?.close();
    this.releaseDetachedCli();
    this.unsubscribeContext?.();
    this.unsubscribeState?.();
    if (this.watchChangedTimer) clearTimeout(this.watchChangedTimer);
  }

  protected select(path: string, recordHistory = true): void {
    const resolved = nearestExistingCtxPath(this.context(), path, this.rootPath());
    if (this.selectedPath() === resolved) {
      this.desiredSelectedPath = resolved;
      this.state()?.debuggerState.updateCtxView(this.rootPath(), { selectedPath: resolved });
      this.revealToken.update((value) => value + 1);
      return;
    }

    this.desiredSelectedPath = resolved;
    this.selectedPath.set(resolved);
    this.revealToken.update((value) => value + 1);
    this.state()?.debuggerState.updateCtxView(this.rootPath(), { selectedPath: resolved });

    if (!recordHistory) return;
    this.history.splice(this.historyIndex() + 1);
    this.history.push(resolved);
    this.historyIndex.set(this.history.length - 1);
    this.saveHistory();
  }

  protected back(): void {
    if (this.historyIndex() <= 0) return;
    this.historyIndex.update((value) => value - 1);
    this.saveHistory();
    this.select(this.history[this.historyIndex()]!, false);
  }

  protected forward(): void {
    if (this.historyIndex() >= this.history.length - 1) return;
    this.historyIndex.update((value) => value + 1);
    this.saveHistory();
    this.select(this.history[this.historyIndex()]!, false);
  }

  protected copySelected(): void {
    const text = formatCtxValue(this.context().get(this.selectedPath()));
    void navigator.clipboard?.writeText(text);
  }

  protected toggleProperties(): void {
    const value = !this.propertiesOpen();
    this.propertiesOpen.set(value);
    if (value) this.revealToken.update((token) => token + 1);
    this.state()?.debuggerState.updateCtxView(this.rootPath(), { propertiesOpen: value });
  }

  protected closeProperties(): void {
    if (!this.propertiesOpen()) return;
    this.propertiesOpen.set(false);
    this.state()?.debuggerState.updateCtxView(this.rootPath(), { propertiesOpen: false });
  }

  protected toggleFind(): void {
    const value = !this.findOpen();
    this.findOpen.set(value);
    if (value) this.revealToken.update((token) => token + 1);
    this.state()?.debuggerState.updateCtxView(this.rootPath(), { findOpen: value });
  }

  protected closeFind(): void {
    if (!this.findOpen()) return;
    this.findOpen.set(false);
    this.state()?.debuggerState.updateCtxView(this.rootPath(), { findOpen: false });
  }

  /** Persist one logical CLI state before changing its presentation. */
  private transitionCli(mode: 'closed' | 'opened' | 'detached'): void {
    if (this.cliMode() === mode) return;
    this.cliMode.set(mode);
    this.state()?.debuggerState.updateCtxView(this.rootPath(), {
      cliMode: mode,
      cliOpen: mode !== 'closed',
    });
    if (this.rootPath() === 'ctx') {
      this.state()?.saveGlobalCliDetached(mode === 'detached');
      this.cliDetachedChanged.emit(mode === 'detached');
      if (mode === 'closed') this.state()?.debuggerState.saveGlobalCliSession(null);
    }
  }

  protected saveCliSession(snapshot: CliSessionSnapshot): void {
    if (this.rootPath() !== 'ctx' || this.cliMode() === 'closed') return;
    this.cliSession.set(snapshot);
    this.state()?.debuggerState.saveGlobalCliSession(snapshot);
  }

  private newCliSession(): CliSessionSnapshot {
    return {
      currentPath: this.cliCurrentPath(),
      command: '',
      transcript: [],
      transcriptSequence: 0,
      history: [],
      historyIndex: -1,
    };
  }

  protected toggleCli(): void {
    if (this.cliMode() === 'detached') {
      this.cliHost?.window?.focus();
      return;
    }
    if (this.cliMode() === 'opened') {
      this.closeCli();
      return;
    }
    const currentPath = ctxCliRootPath(this.context(), this.selectedPath(), this.rootPath());
    this.cliCurrentPath.set(currentPath);
    this.cliSession.set(null);
    this.transitionCli('opened');
    this.revealToken.update((token) => token + 1);
    this.state()?.debuggerState.updateCtxView(this.rootPath(), { cliCurrentPath: currentPath });
  }

  /** Attach commits state before closing the popup; native X never means Attach. */
  protected detachCli(): void {
    if (this.rootPath() !== 'ctx') return;
    if (this.cliMode() === 'detached') {
      const session = this.detachedCli?.instance.captureSession();
      if (!session) return;
      this.saveCliSession(session);
      const host = this.cliHost;
      this.cliHost = null;
      this.transitionCli('opened');
      host?.close();
      this.releaseDetachedCli();
      return;
    }
    if (this.cliMode() !== 'opened') return;
    const session = this.attachedCli()?.captureSession();
    if (!session || !this.openDetachedCli(session)) return;
    this.saveCliSession(session);
    this.transitionCli('detached');
  }

  protected setCliFontScale(value: number): void {
    this.cliFontScale.set(value);
    if (this.rootPath() === 'ctx') this.state()?.saveGlobalCliFontScalePercent(value);
  }

  /** Close never attaches; it invalidates popup callbacks before host destruction. */
  protected closeCli(): void {
    if (this.cliMode() === 'closed') return;
    const host = this.cliHost;
    this.cliHost = null;
    this.transitionCli('closed');
    this.cliSession.set(null);
    host?.close();
    this.releaseDetachedCli();
  }

  protected toggleWatch(): void {
    const watchedPath = this.watchedPath() === this.selectedPath() ? null : this.selectedPath();
    this.watchedPath.set(watchedPath);
    this.state()?.debuggerState.updateCtxView(this.rootPath(), { watchedPath });
  }

  protected setExpandedPaths(paths: readonly string[]): void {
    this.expandedPaths.set(paths);
    this.state()?.debuggerState.updateCtxView(this.rootPath(), { expandedPaths: paths });
  }

  protected setSearch(value: string): void {
    this.searchText.set(value);
  }

  protected setSearchMode(value: CtxSearchMode): void {
    this.searchMode.set(value);
    this.state()?.debuggerState.updateCtxView(this.rootPath(), { findMode: value });
  }

  protected setSearchSyntax(value: CtxSearchSyntax): void {
    this.searchSyntax.set(value);
    this.state()?.debuggerState.updateCtxView(this.rootPath(), { findSyntax: value });
  }

  protected selectSearchHistory(value: string): void {
    this.searchText.set(value);
    this.find(1);
  }

  protected find(direction: -1 | 1): void {
    const term = this.searchText().trim();
    if (!term) return;
    this.rememberSearch(term);

    const results = this.searchResults();
    if (!results.length) return;
    const current = results.findIndex((result) => result.path === this.selectedPath());
    const next =
      current < 0
        ? direction > 0
          ? 0
          : results.length - 1
        : (current + direction + results.length) % results.length;
    this.select(results[next]!.path);
  }

  protected setCliCurrentPath(path: string): void {
    this.cliCurrentPath.set(path);
    this.state()?.debuggerState.updateCtxView(this.rootPath(), { cliCurrentPath: path });
  }

  protected openSelectedView(): void {
    this.openPathRequested.emit(this.selectedPath());
  }

  private loadState(): void {
    const root = this.rootPath();
    const state = this.state();
    if (!state) {
      if (this.selectedPath() === 'ctx' && root !== 'ctx') this.selectedPath.set(root);
      if (this.cliCurrentPath() === 'ctx' && root !== 'ctx') this.cliCurrentPath.set(root);
      return;
    }

    const view = state.debuggerState.ctxView(root);
    this.desiredSelectedPath = view.selectedPath;
    const selectedPath = nearestExistingCtxPath(this.context(), this.desiredSelectedPath, root);
    const cliCurrentPath = nearestExistingCtxPath(this.context(), view.cliCurrentPath, root);
    this.selectedPath.set(selectedPath);
    // A newly opened dedicated CTX view must expose its root immediately.
    // Later expansion updates (including an explicit root collapse) remain authoritative.
    this.expandedPaths.set(
      !this.initialized && root !== 'ctx' && view.expandedPaths.length === 0
        ? [root]
        : view.expandedPaths,
    );
    this.propertiesOpen.set(view.propertiesOpen);
    this.findOpen.set(view.findOpen);
    this.searchMode.set(view.findMode);
    this.searchSyntax.set(view.findSyntax);
    // UI-state broadcasts also occur during CLI transitions. Restore only during
    // initialization, never let a stale persistence notification override live mode.
    if (!this.initialCliStateLoaded) {
      this.initialCliStateLoaded = true;
      const mode = view.cliMode ?? (view.cliOpen ? 'opened' : 'closed');
      this.cliMode.set(mode);
      if (root === 'ctx') this.cliSession.set(state.debuggerState.globalCliSession);
    }
    this.cliFontScale.set(root === 'ctx' ? state.globalCliFontScalePercent : 100);
    if (this.cliMode() === 'closed' || !this.initialized) this.cliCurrentPath.set(cliCurrentPath);
    this.watchedPath.set(view.watchedPath);

    const navigation = state.debuggerState.ctxNavigation(root);
    this.history.splice(0, this.history.length, ...navigation.entries);
    this.historyIndex.set(navigation.index);

    this.ctxPropertiesHeight.set(state.debuggerState.browser.ctxPropertiesHeight);
    this.cliHeight.set(state.debuggerState.browser.cliHeight);
  }

  private saveHistory(): void {
    this.state()?.debuggerState.updateCtxNavigation(
      this.rootPath(),
      this.history,
      this.historyIndex(),
    );
  }

  private rememberSearch(term: string): void {
    this.searchHistory.update((entries) =>
      [term, ...entries.filter((entry) => entry !== term)].slice(0, CTX_FIND_HISTORY_LIMIT),
    );
  }

  private formatLogicalSize(bytes: number): string {
    if (bytes < 1024) return `~${bytes} B`;
    if (bytes < 1024 * 1024) return `~${(bytes / 1024).toFixed(1)} KB`;
    return `~${(bytes / 1024 / 1024).toFixed(2)} MB`;
  }

  private pathsOverlap(left: string, right: string): boolean {
    return (
      left === right ||
      left.startsWith(`${right}.`) ||
      left.startsWith(`${right}[`) ||
      right.startsWith(`${left}.`) ||
      right.startsWith(`${left}[`)
    );
  }

  private recoverSelection(): void {
    const recovered = nearestExistingCtxPath(
      this.context(),
      this.desiredSelectedPath,
      this.rootPath(),
    );
    if (recovered === this.selectedPath()) return;
    this.selectedPath.set(recovered);
    this.revealToken.update((value) => value + 1);
  }

  private handleWatchMutation(paths: readonly string[]): void {
    const watched = this.watchedPath();
    if (!watched) return;
    if (!paths.some((path) => this.pathsOverlap(path, watched))) return;

    const recovered = nearestExistingCtxPath(this.context(), watched, this.rootPath());
    this.watchChangedPath.set(recovered);
    if (this.watchChangedTimer) clearTimeout(this.watchChangedTimer);
    this.watchChangedTimer = setTimeout(() => {
      this.watchChangedPath.set(null);
      this.watchChangedTimer = null;
    }, 1400);
  }
}
