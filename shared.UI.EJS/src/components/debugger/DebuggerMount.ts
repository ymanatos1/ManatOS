import type { ApplicationState, CtxCliCommandInput } from '@manatos/shared-ui';

import { createDebugger, type DebuggerController } from './Debugger.js';

export interface DebuggerMountController {
  readonly visible: boolean;
  show(): void;
  hide(): void;
  toggle(): void;
  /** Reapply current permissions without mutating persisted debugger choices. */
  sync(): void;
  focusDetached(): void;
  focusMain(): void;
  revealCtxPath(path: string): void;
  destroy(): void;
}

export interface DebuggerMountOptions {
  readonly state: ApplicationState;
  readonly expressionCapabilityDelegate?: CtxCliCommandInput['expressionCapabilityDelegate'];
  readonly visibilityChanged?: (visible: boolean) => void;
  /** Effective runtime authorisation, independent from the persisted visible choice. */
  readonly allowed?: () => boolean;
}

/** EJS/browser shell adapter that projects shared debugger visibility into one mounted instance. */
export function mountDebugger(
  host: HTMLElement,
  options: DebuggerMountOptions,
): DebuggerMountController {
  let debuggerController: DebuggerController | null = null;

  const mainVisible = (): boolean => options.state.debuggerVisible && (options.allowed?.() ?? true);
  let lastReportedMainVisibility: boolean | null = null;
  const notify = () => {
    const next = mainVisible();
    if (lastReportedMainVisibility === next) return;
    lastReportedMainVisibility = next;
    options.visibilityChanged?.(next);
  };

  const destroyMountedDebugger = () => {
    if (!debuggerController) return;
    debuggerController.destroy();
    debuggerController = null;
    host.replaceChildren();
    notify();
  };

  const syncVisibility = () => {
    const visible = mainVisible();
    // NG1 retains its CtxViewer while the Global CLI is detached. The EJS1
    // component must do the same: removing its owner would close the live CLI
    // window, discard its focus and interrupt an in-flight command.
    const keepDetachedCli =
      (options.allowed?.() ?? true) &&
      options.state.debuggerState.ctxView('ctx').cliMode === 'detached';
    if (!visible && !keepDetachedCli) {
      destroyMountedDebugger();
      return;
    }
    if (!debuggerController) {
      debuggerController = createDebugger(host.ownerDocument, {
        state: options.state,
        expressionCapabilityDelegate: options.expressionCapabilityDelegate,
        closeRequested: () => options.state.setDebuggerVisible(false),
      });
      host.replaceChildren(debuggerController.element);
      notify();
    }
    debuggerController.setMainVisible(visible);
    // Hiding the main debugger still updates its navigation state even while
    // a detached Global CLI keeps the controller mounted.
    notify();
  };

  const unsubscribeState = options.state.subscribe((change) => {
    if (change === 'uiState') syncVisibility();
  });

  const controller: DebuggerMountController = {
    get visible() {
      return debuggerController !== null && mainVisible();
    },
    show() {
      if (options.allowed && !options.allowed()) return;
      options.state.setDebuggerVisible(true);
      syncVisibility();
    },
    hide() {
      options.state.setDebuggerVisible(false);
      syncVisibility();
    },
    toggle() {
      if (options.allowed && !options.allowed()) return;
      options.state.setDebuggerVisible(!options.state.debuggerVisible);
      syncVisibility();
    },
    sync() {
      syncVisibility();
    },
    focusDetached() {
      debuggerController?.focusDetached();
    },
    focusMain() {
      debuggerController?.focusMain();
    },
    revealCtxPath(path) {
      debuggerController?.revealCtxPath(path);
    },
    destroy() {
      unsubscribeState();
      destroyMountedDebugger();
    },
  };

  syncVisibility();
  return controller;
}
