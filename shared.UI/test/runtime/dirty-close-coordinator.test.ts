import { describe, expect, it } from 'vitest';
import {
  UiDirtyCloseCoordinator,
  UNSAVED_CHANGES_POPUP,
  type UiSurfaceManager,
  type UiSurfaceEventListener,
  type UiPopupLevel,
} from '../../src/index.js';

describe('UIS dirty-close transaction', () => {
  function setup() {
    const coordinator = new UiDirtyCloseCoordinator();
    const listener: { callback?: UiSurfaceEventListener<UiPopupLevel> } = {};
    let opened = 0;
    let reports = 0;
    let closed = 0;
    let decisionOpen = false;
    const surfaces = {
      open(
        name: string,
        invocation: { events?: Record<string, string>; params?: Record<string, unknown> },
      ) {
        if (name === 'semantic.changeReport') {
          reports++;
          expect(invocation.params?.['report']).toBeDefined();
          return {
            close() {},
            onEvent() {
              return () => {};
            },
            isOpen() {
              return true;
            },
          };
        }
        expect(name).toBe('semantic.unsavedChanges');
        expect(invocation.events?.discard).toBe('dirty-close-discard');
        expect(invocation.events?.review).toBe('dirty-close-review');
        opened++;
        decisionOpen = true;
        return {
          isOpen() {
            return decisionOpen;
          },
          close() {
            closed++;
            decisionOpen = false;
            listener.callback?.('disposing', 'ctx.ui.level.level', {} as UiPopupLevel);
          },
          onEvent(onSurfaceEvent: UiSurfaceEventListener<UiPopupLevel>) {
            listener.callback = onSurfaceEvent;
            return () => {
              listener.callback = undefined;
            };
          },
        };
      },
    } as unknown as UiSurfaceManager;
    return {
      coordinator,
      surfaces,
      emit: (event: string) => {
        if (event === 'disposing') decisionOpen = false;
        listener.callback?.(event, 'ctx.ui.level.level', {} as UiPopupLevel);
      },
      get opened() {
        return opened;
      },
      get reports() {
        return reports;
      },
      get closed() {
        return closed;
      },
    };
  }

  it('continues a clean exit with no popup', () => {
    const h = setup();
    const calls: string[] = [];
    h.coordinator.requestExit(
      () => false,
      () => calls.push('home'),
      h.surfaces,
    );
    expect(calls).toEqual(['home']);
    expect(h.opened).toBe(0);
  });

  it('preserves one pending destination and every edit until explicit Discard', () => {
    const h = setup();
    const calls: string[] = [];
    h.coordinator.requestExit(
      () => true,
      () => calls.push('users'),
      h.surfaces,
    );
    h.coordinator.requestExit(
      () => true,
      () => calls.push('settings'),
      h.surfaces,
    );
    expect(h.opened).toBe(1);
    expect(calls).toEqual([]);
    h.emit('dirty-close-discard');
    expect(h.closed).toBe(1);
    expect(calls).toEqual(['users']);
  });

  it('closing with X/Cancel authorizes no navigation and allows a later request', () => {
    const h = setup();
    const calls: string[] = [];
    h.coordinator.requestExit(
      () => true,
      () => calls.push('first'),
      h.surfaces,
    );
    h.emit('disposing');
    expect(calls).toEqual([]);
    h.coordinator.requestExit(
      () => true,
      () => calls.push('next'),
      h.surfaces,
    );
    expect(h.opened).toBe(2);
    h.emit('dirty-close-discard');
    expect(calls).toEqual(['next']);
  });

  it('reviews changes in a nested semantic popup without resolving the pending exit', () => {
    const h = setup();
    const calls: string[] = [];
    const report = { kind: 'entry', summary: '1 change', count: 1, nodes: [] } as const;
    h.coordinator.requestExit(
      () => true,
      () => calls.push('exit'),
      h.surfaces,
      { ownerLabel: '@EN.manatos.auth.users.label.User', reviewChanges: () => report },
    );
    h.emit('dirty-close-review');
    expect(h.reports).toBe(1);
    expect(h.opened).toBe(1);
    expect(calls).toEqual([]);
    // The review child has been dismissed; Cancel still preserves the Entry.
    h.emit('disposing');
    expect(calls).toEqual([]);
    h.coordinator.requestExit(
      () => true,
      () => calls.push('second'),
      h.surfaces,
    );
    h.emit('dirty-close-discard');
    expect(calls).toEqual(['second']);
  });

  it('does not open a report for missing or empty review data', () => {
    const h = setup();
    h.coordinator.requestExit(
      () => true,
      () => {},
      h.surfaces,
      { reviewChanges: () => null },
    );
    h.emit('dirty-close-review');
    expect(h.reports).toBe(0);
    expect(h.opened).toBe(1);
    expect(h.closed).toBe(0);
  });

  it('Save is visible but disabled and standard popup tools are enabled', () => {
    const tab = UNSAVED_CHANGES_POPUP.view;
    expect(tab?.actions.map((action) => action.id)).toEqual([
      'review',
      'cancel',
      'discard',
      'save',
    ]);
    // EJS0's short warning belongs directly in the decision body, not an
    // Auth methods grid or an extra section/card within the modal.
    expect(tab?.content.map((item) => item.kind)).toEqual(['note']);
    expect(tab?.actions.find((action) => action.id === 'save')?.enabledWhen).toBe('false');
    expect(UNSAVED_CHANGES_POPUP.showLanguageSelection).toBe(true);
    expect(UNSAVED_CHANGES_POPUP.allowDebugger).toBe(true);
    expect(UNSAVED_CHANGES_POPUP.allowFontScale).toBe(true);
  });
});
