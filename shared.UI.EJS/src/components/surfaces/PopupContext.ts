import { type UiPopupSafeField, UiPopupRuntime } from '@manatos/shared-ui';

/** Per-popup, live view of the canonical runtime. Never copies credential bytes. */
export class PopupContext {
  constructor(readonly runtime: UiPopupRuntime) {}

  get level() {
    return this.runtime.level;
  }
  get activeTab() {
    return this.runtime.activeTab;
  }
  get levelPath() {
    return this.runtime.levelPath;
  }

  field(id: string): UiPopupSafeField | undefined {
    return this.runtime.level.data.fields[id];
  }
  rule(id: string): boolean {
    return this.runtime.level.state.rules[id] === true;
  }
  actionEnabled(id: string): boolean {
    const state = this.runtime.level.state;
    return !state.busy && state.actions[id] === true && state.visibleActions[id] !== false;
  }
  actionVisible(id: string): boolean {
    return this.runtime.level.state.visibleActions[id] !== false;
  }
  reconcileTabLayout(tab: string): void {
    this.runtime.reconcileTabLayout(tab);
  }
}
