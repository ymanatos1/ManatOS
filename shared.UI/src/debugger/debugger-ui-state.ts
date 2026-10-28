import type { UiBrowserPreferences } from '../preferences/ui-preferences.js';
import type { UiStateRuntime } from '../state/ui-state-runtime.js';
import {
  defaultUiCtxViewState,
  type UiApiTrafficState,
  type UiCtxNavigationHistoryState,
  type UiCtxViewState,
  type UiPersistedCliSession,
  type UiDebuggerMainView,
  type UiTabSeedableState,
} from '../state/ui-tab-state.js';

export class UiDebuggerState {
  constructor(private readonly uiState: UiStateRuntime) {}

  get visible(): boolean {
    return this.uiState.tab.debugger.visible;
  }

  get activeView(): UiDebuggerMainView {
    return this.uiState.tab.debugger.activeView;
  }

  get ctxViews(): readonly UiCtxViewState[] {
    return this.uiState.tab.debugger.ctxViews;
  }

  get apiTraffic(): UiApiTrafficState {
    return this.uiState.tab.debugger.apiTraffic;
  }

  get browser(): UiBrowserPreferences {
    return this.uiState.browserPreferences;
  }

  ctxView(rootPath = 'ctx'): UiCtxViewState {
    return (
      this.ctxViews.find((view) => view.rootPath === rootPath) ?? defaultUiCtxViewState(rootPath)
    );
  }

  ctxNavigation(rootPath = 'ctx'): UiCtxNavigationHistoryState {
    return (
      this.uiState.session.ctxNavigation.find((item) => item.rootPath === rootPath) ?? {
        rootPath,
        entries: [rootPath],
        index: 0,
      }
    );
  }

  setVisible(visible: boolean): void {
    this.updateDebugger((debuggerState) => ({ ...debuggerState, visible }));
  }

  selectView(activeView: UiDebuggerMainView): void {
    this.updateDebugger((debuggerState) => ({ ...debuggerState, activeView }));
  }

  openCtxView(rootPath: string): void {
    if (rootPath === 'ctx') {
      this.selectView('ctx');
      return;
    }

    this.updateDebugger((debuggerState) => ({
      ...debuggerState,
      activeView: `ctx:${rootPath}`,
      ctxViews: debuggerState.ctxViews.some((view) => view.rootPath === rootPath)
        ? debuggerState.ctxViews
        : [...debuggerState.ctxViews, defaultUiCtxViewState(rootPath)],
    }));
  }

  closeCtxView(rootPath: string): void {
    if (rootPath === 'ctx') return;

    this.updateDebugger((debuggerState) => {
      const targetViews = debuggerState.ctxViews.filter((view) => view.rootPath !== 'ctx');
      const index = targetViews.findIndex((view) => view.rootPath === rootPath);
      if (index < 0) return debuggerState;

      const ctxViews = debuggerState.ctxViews.filter((view) => view.rootPath !== rootPath);
      let activeView = debuggerState.activeView;
      if (activeView === `ctx:${rootPath}`) {
        const remainingTargets = targetViews.filter((view) => view.rootPath !== rootPath);
        const fallback =
          remainingTargets[index - 1] ?? remainingTargets[index] ?? remainingTargets[0];
        activeView = fallback ? `ctx:${fallback.rootPath}` : 'ctx';
      }

      return { ...debuggerState, activeView, ctxViews };
    });

    this.uiState.updateSession((session) => ({
      ...session,
      ctxNavigation: session.ctxNavigation.filter((item) => item.rootPath !== rootPath),
    }));
  }

  get globalCliSession(): UiPersistedCliSession | null {
    return this.uiState.session.globalCliSession;
  }

  saveGlobalCliSession(snapshot: UiPersistedCliSession | null): void {
    this.uiState.updateSession((session) => ({ ...session, globalCliSession: snapshot }));
  }

  updateCtxView(rootPath: string, patch: Partial<UiCtxViewState>): void {
    this.updateDebugger((debuggerState) => {
      const existing = debuggerState.ctxViews.find((view) => view.rootPath === rootPath);
      const next = { ...(existing ?? defaultUiCtxViewState(rootPath)), ...patch, rootPath };
      const ctxViews = existing
        ? debuggerState.ctxViews.map((view) => (view.rootPath === rootPath ? next : view))
        : [...debuggerState.ctxViews, next];
      return { ...debuggerState, ctxViews };
    });
  }

  updateCtxNavigation(rootPath: string, entries: readonly string[], index: number): void {
    this.uiState.updateSession((session) => {
      const next: UiCtxNavigationHistoryState = { rootPath, entries, index };
      const exists = session.ctxNavigation.some((item) => item.rootPath === rootPath);
      return {
        ...session,
        ctxNavigation: exists
          ? session.ctxNavigation.map((item) => (item.rootPath === rootPath ? next : item))
          : [...session.ctxNavigation, next],
      };
    });
  }

  updateApiTraffic(patch: Partial<UiApiTrafficState>): void {
    this.updateDebugger((debuggerState) => ({
      ...debuggerState,
      apiTraffic: { ...debuggerState.apiTraffic, ...patch },
    }));
  }

  saveBrowserPreferences(patch: Partial<UiBrowserPreferences>): void {
    this.uiState.saveBrowserPreferences(patch);
  }

  private updateDebugger(
    change: (current: UiTabSeedableState['debugger']) => UiTabSeedableState['debugger'],
  ): void {
    this.uiState.updateSeedable((current) => ({
      ...current,
      debugger: change(current.debugger),
    }));
  }
}
