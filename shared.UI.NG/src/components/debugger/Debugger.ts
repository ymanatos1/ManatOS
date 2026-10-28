import {
  afterRenderEffect,
  Component,
  computed,
  ElementRef,
  OnChanges,
  OnDestroy,
  OnInit,
  SimpleChanges,
  ViewEncapsulation,
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
  formatCtxPath,
  type ApplicationState,
  type UiDebuggerMainView,
  multilingual,
} from '@manatos/shared-ui';

import { ApiTrafficViewer } from './ApiTrafficViewer';
import { CtxViewer } from './CtxViewer';
import { DebuggerHost } from './DebuggerHost';
import { DebuggerVerticalLayout, type DebuggerVerticalPanelKey } from './DebuggerVerticalLayout';
import { DebugTooltipHost } from './DebugTooltipHost';

interface TargetCtxView {
  readonly id: `ctx:${string}`;
  readonly path: string;
  readonly label: string;
}

@Component({
  selector: 'manatos-debugger',
  standalone: true,
  imports: [CtxViewer, ApiTrafficViewer, DebugTooltipHost],
  templateUrl: './Debugger.html',
  styleUrls: ['./Debugger.css', './DebugTooltipHost.css'],
  encapsulation: ViewEncapsulation.None,
  host: { class: 'manatos-debugger-host' },
})
export class Debugger implements OnInit, OnChanges, OnDestroy {
  protected readonly multilingual = computed(() =>
    multilingual(this.state()?.currentLanguage.id === 'el' ? 'EL' : 'EN', [
      'DebuggingTools',
      'ResizeDebuggingTools',
      'CtxViewerTooltip',
      'CtxViewerDescription',
      'CloseCtxView',
      'ApiTrafficTooltip',
      'ApiTrafficDescription',
      'CloseDebuggingTools',
      'AttachDebuggingTools',
      'DetachDebuggingTools',
      'AttachDebuggingToolsDetail',
      'DetachDebuggingToolsDetail',
      'CtxViewerTitle',
      'ApiTrafficTitle',
    ] as const),
  );

  readonly context = input.required<ContextTreeRuntime<ManatOSRuntimeRootContext>>();
  readonly state = input<ApplicationState | null>(null);
  readonly visible = input(false);
  readonly requestedRevealPath = input<string | null>(null);
  readonly requestedRevealToken = input(0);
  readonly popupDebuggerForeground = input(false);
  readonly activeView = input<UiDebuggerMainView>('ctx');
  readonly developerToolsWidth = input<number | null>(null);
  readonly expressionCapabilityDelegate = input<ExpressionCapabilityDelegate | null>(null);
  readonly closeRequested = output<void>();
  readonly detachedChanged = output<boolean>();
  readonly activeViewChanged = output<UiDebuggerMainView>();
  readonly developerToolsWidthChanged = output<number | null>();

  private readonly dock = viewChild<ElementRef<HTMLElement>>('dock');
  private readonly hostController = new DebuggerHost({
    loadPlacement: () => this.state()?.debuggerWindowPlacement ?? null,
    savePlacement: (placement) => this.state()?.saveDebuggerWindowPlacement(placement),
  });
  private verticalLayout: DebuggerVerticalLayout | null = null;
  private verticalLayoutDock: HTMLElement | null = null;
  private popupResizeObserver: ResizeObserver | null = null;
  private readonly updatePopupDockHeight = (): void => {
    const dock = this.dock()?.nativeElement;
    if (!dock) return;
    if (!this.popupDebuggerForeground() || this.detached()) {
      dock.style.removeProperty('max-height');
      dock.style.removeProperty('height');
      return;
    }
    // Foreground debugging uses the visible viewport, not the popup's bottom edge.
    // Popup size must not shorten the debugger or leave unused viewport space.
    const top = Math.max(0, dock.getBoundingClientRect().top);
    const available = Math.max(160, window.innerHeight - top);
    dock.style.maxHeight = `${available}px`;
    dock.style.height = `${available}px`;
  };
  private syncPopupDockHeight(): void {
    this.popupResizeObserver?.disconnect();
    this.popupResizeObserver = null;
    if (!this.popupDebuggerForeground() || this.detached()) {
      this.updatePopupDockHeight();
      return;
    }
    const dialogs = [...document.querySelectorAll<HTMLElement>('.sign-in-dialog')];
    const dialog = dialogs[dialogs.length - 1];
    if (dialog) {
      this.popupResizeObserver = new ResizeObserver(this.updatePopupDockHeight);
      this.popupResizeObserver.observe(dialog);
    }
    this.updatePopupDockHeight();
  }

  protected readonly activeTab = signal<UiDebuggerMainView>('ctx');
  protected readonly targetViews = signal<readonly TargetCtxView[]>([]);
  protected readonly width = signal(this.defaultWidth());
  protected readonly detached = signal(false);
  protected readonly cliWindowDetached = signal(false);
  protected readonly keepCliMounted = computed(
    () =>
      this.visible() ||
      this.cliWindowDetached() ||
      Boolean(this.state()?.debuggerState.ctxView('ctx').cliMode === 'detached'),
  );

  private unsubscribeState: (() => void) | null = null;
  private boundState: ApplicationState | null = null;
  private resizing = false;
  private resizeStartX = 0;
  private resizeStartWidth = this.defaultWidth();

  constructor() {
    // #dock is under @if(keepCliMounted()). It may not exist at ngAfterViewInit.
    // A post-render reactive query keeps the resize controller attached to the
    // *actual* dock instance, including when it is mounted after first render.
    afterRenderEffect(() => {
      const dock = this.dock()?.nativeElement ?? null;
      if (dock === this.verticalLayoutDock) return;
      this.verticalLayout?.destroy();
      this.verticalLayout = null;
      this.verticalLayoutDock = dock;
      if (dock) {
        this.verticalLayout = new DebuggerVerticalLayout({
          dock,
          heightChanged: (key, height) => this.saveVerticalHeight(key, height),
        });
        this.updatePopupDockHeight();
      }
    });
    this.hostController.setDetachedChanged((detached) => {
      this.detached.set(detached);
      this.detachedChanged.emit(detached);
      this.verticalLayout?.ownerDocumentChanged();
    });
  }

  ngOnInit(): void {
    window.addEventListener('resize', this.updatePopupDockHeight);
    this.bindState();
    this.syncTargetViews();
    this.activeTab.set(this.restorableView(this.activeView()));
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['state']) this.bindState();

    if (changes['visible'] && !this.visible()) {
      if (this.hostController.detached) this.hostController.attach(false);
      this.resizing = false;
    }

    if (changes['activeView']) this.activeTab.set(this.restorableView(this.activeView()));
    if (changes['developerToolsWidth']) {
      this.width.set(this.resolveWidth(this.developerToolsWidth()));
    }

    if (changes['popupDebuggerForeground']) {
      this.syncPopupDockHeight();
      if (this.popupDebuggerForeground()) {
        this.hostController.focusDetached();
      } else {
        this.hostController.focusMain();
      }
    }
  }

  ngOnDestroy(): void {
    this.unsubscribeState?.();
    this.unsubscribeState = null;
    this.boundState = null;
    this.popupResizeObserver?.disconnect();
    window.removeEventListener('resize', this.updatePopupDockHeight);
    this.verticalLayout?.destroy();
    this.verticalLayout = null;
    this.verticalLayoutDock = null;
    this.hostController.destroy();
  }

  protected openPath(path: string): void {
    if (path === 'ctx') {
      this.selectView('ctx');
      return;
    }

    const state = this.state();
    if (state) {
      state.debuggerState.openCtxView(path);
      this.syncTargetViews();
      this.activeTab.set(this.restorableView(state.debuggerActiveView));
      return;
    }

    const id = `ctx:${path}` as const;
    if (!this.targetViews().some((view) => view.id === id)) {
      this.targetViews.update((views) => [
        ...views,
        Object.freeze({ id, path, label: formatCtxPath(path) }),
      ]);
    }
    this.activeTab.set(id);
  }

  protected closeTarget(view: TargetCtxView, event: MouseEvent): void {
    event.stopPropagation();
    const state = this.state();
    if (state) {
      state.debuggerState.closeCtxView(view.path);
      this.syncTargetViews();
      this.activeTab.set(this.restorableView(state.debuggerActiveView));
      return;
    }

    const views = this.targetViews();
    const index = views.findIndex((candidate) => candidate.id === view.id);
    this.targetViews.set(views.filter((candidate) => candidate.id !== view.id));
    if (this.activeTab() !== view.id) return;
    const fallback = views[index - 1]?.id ?? views[index + 1]?.id ?? 'ctx';
    const next = fallback === view.id ? 'ctx' : fallback;
    this.activeTab.set(next);
    if (next === 'ctx') this.activeViewChanged.emit('ctx');
  }

  protected selectView(view: UiDebuggerMainView): void {
    const state = this.state();
    if (state) state.debuggerState.selectView(view);
    this.activeTab.set(this.restorableView(view));
    this.activeViewChanged.emit(view);
  }

  protected toggleDetached(): void {
    const dock = this.dock()?.nativeElement;
    if (!dock) return;
    this.hostController.toggle(dock);
  }

  protected close(): void {
    if (this.hostController.detached) this.hostController.attach(false);
    this.closeRequested.emit();
  }

  protected resizeStart(event: PointerEvent): void {
    if (this.detached()) return;
    this.resizing = true;
    this.resizeStartX = event.clientX;
    this.resizeStartWidth = this.width();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  protected resizeMove(event: PointerEvent): void {
    if (!this.resizing || this.detached()) return;
    const view = (event.currentTarget as HTMLElement).ownerDocument.defaultView;
    const viewportWidth = view?.innerWidth ?? window.innerWidth;
    const next = this.resizeStartWidth + (this.resizeStartX - event.clientX);
    this.width.set(Math.max(420, Math.min(Math.floor(viewportWidth * 0.75), next)));
  }

  protected resizeEnd(): void {
    if (!this.resizing) return;
    this.resizing = false;
    this.developerToolsWidthChanged.emit(this.width());
  }

  protected resetWidth(): void {
    this.width.set(this.defaultWidth());
    this.developerToolsWidthChanged.emit(null);
  }

  private bindState(): void {
    const state = this.state();
    if (state === this.boundState) return;
    this.unsubscribeState?.();
    this.unsubscribeState = null;
    this.boundState = state;
    if (!state) return;

    this.unsubscribeState = state.subscribe((change) => {
      if (change !== 'uiState') return;
      this.syncTargetViews();
      this.activeTab.set(this.restorableView(state.debuggerActiveView));
    });
  }

  private saveVerticalHeight(key: DebuggerVerticalPanelKey, height: number | null): void {
    const debuggerState = this.state()?.debuggerState;
    if (!debuggerState) return;
    if (key === 'ctx-properties') {
      debuggerState.saveBrowserPreferences({ ctxPropertiesHeight: height });
    } else if (key === 'cli') debuggerState.saveBrowserPreferences({ cliHeight: height });
    else debuggerState.saveBrowserPreferences({ apiDetailsHeight: height });
  }

  private syncTargetViews(): void {
    const state = this.state();
    if (!state) return;
    this.targetViews.set(
      state.debuggerState.ctxViews
        .filter((view) => view.rootPath !== 'ctx')
        .map((view) =>
          Object.freeze({
            id: `ctx:${view.rootPath}` as const,
            path: view.rootPath,
            label: formatCtxPath(view.rootPath),
          }),
        ),
    );
  }

  private resolveWidth(width: number | null): number {
    if (width === null) return this.defaultWidth();
    const viewportWidth = typeof window === 'undefined' ? 1920 : window.innerWidth;
    return Math.max(420, Math.min(Math.floor(viewportWidth * 0.75), Math.round(width)));
  }

  private restorableView(view: UiDebuggerMainView): UiDebuggerMainView {
    if (view === 'ctx' || view === 'apiTraffic') return view;
    return this.targetViews().some((target) => target.id === view) ? view : 'ctx';
  }

  private defaultWidth(): number {
    const viewportWidth = typeof window === 'undefined' ? 1920 : window.innerWidth;
    return Math.max(420, Math.min(640, Math.floor(viewportWidth * 0.28)));
  }
}
