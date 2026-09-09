import { describe, expect, it } from 'vitest';

import { SurfaceEventRuntime } from '../../src/runtime/events/surface-event-runtime.js';
import { SurfaceRuntime } from '../../src/runtime/surface/surface-runtime.js';

describe('UI Runtime V2 surface architecture', () => {
  it('keeps observable navigation under surface state rather than as a surface command branch', () => {
    const runtime = new SurfaceRuntime();
    const surface = runtime.open({
      host: 'page',
      kind: 'entry',
      mode: 'edit',
      name: 'user',
      initialNavigation: {
        activeTabId: 'authentication',
        activeInternalTabIds: { debugging: 'entity' },
      },
    });

    expect(surface.state.navigation).toEqual({
      activeTabId: 'authentication',
      activeInternalTabIds: { debugging: 'entity' },
    });
    expect('navigation' in surface).toBe(false);
  });

  it('keeps operational mode canonical and presentation kind semantically separate', () => {
    const runtime = new SurfaceRuntime();
    const popup = runtime.open({
      host: 'popup',
      kind: 'entry',
      mode: 'create',
      name: 'principalEntry',
      invocation: {
        purpose: 'reference-field-add-entry',
        defaults: { firstName: 'Yiannis', lastName: 'Manatos' },
      },
      presentation: { title: 'Add Principal' },
      entry: { current: { firstName: 'Yiannis', lastName: 'Manatos' } },
    });

    expect(popup.mode).toBe('create');
    expect(popup.presentation.kind).toBe('entry');
    expect('mode' in popup.presentation).toBe(false);
    expect('mode' in popup.invocation).toBe(false);
  });

  it('keeps popup geometry and nesting counter under canonical surface state', () => {
    const runtime = new SurfaceRuntime();
    const page = runtime.open({ host: 'page', kind: 'entry', mode: 'edit', name: 'principal' });
    const popup = runtime.open({
      parentId: page.id,
      host: 'popup',
      kind: 'entry',
      mode: 'view',
      name: 'member',
      initialPopupState: { x: 120, y: 80, openedPopupsCounter: 0 },
    });

    expect(popup.state.popup).toEqual({ x: 120, y: 80, openedPopupsCounter: 0 });
    expect('popup' in popup.presentation).toBe(false);
  });

  it('projects component-owned read models on the owning surface without borrowing parent list state', () => {
    const runtime = new SurfaceRuntime();
    const page = runtime.open({
      host: 'page',
      kind: 'entry',
      mode: 'edit',
      name: 'principal',
      resources: {
        organization: {
          entries: [{ id: 'root', parentId: null }],
          rootId: 'root',
        },
      },
    });

    expect(page.resources).toEqual({
      organization: {
        entries: [{ id: 'root', parentId: null }],
        rootId: 'root',
      },
    });
  });

  it('supports unlimited recursive page/page, page/popup and popup/popup nesting', () => {
    const runtime = new SurfaceRuntime();
    const list = runtime.open({ host: 'page', kind: 'list', mode: 'browse', name: 'principals' });
    const entry = runtime.open({
      parentId: list.id,
      host: 'page',
      kind: 'entry',
      mode: 'edit',
      name: 'principal',
    });
    const popup1 = runtime.open({
      parentId: entry.id,
      host: 'popup',
      kind: 'entry',
      mode: 'view',
      name: 'member',
    });
    const popup2 = runtime.open({
      parentId: popup1.id,
      host: 'popup',
      kind: 'selector',
      mode: 'select',
      name: 'parentSelector',
    });
    const popup3 = runtime.open({
      parentId: popup2.id,
      host: 'popup',
      kind: 'entry',
      mode: 'create',
      name: 'newParent',
    });

    expect(list.children[0]).toBe(entry);
    expect(entry.children[0]).toBe(popup1);
    expect(popup1.children[0]).toBe(popup2);
    expect(popup2.children[0]).toBe(popup3);
    expect(runtime.activeSurface()).toBe(popup3);
    expect(popup3.path).toBe(
      '/ui/page:principals/page:principal/popup:member/popup:parentSelector/popup:newParent',
    );
  });

  it('rejects popup -> page navigation by architecture contract', () => {
    const runtime = new SurfaceRuntime();
    const popup = runtime.open({
      host: 'popup',
      kind: 'entry',
      mode: 'view',
      name: 'principal',
    });

    expect(() =>
      runtime.open({
        parentId: popup.id,
        host: 'page',
        kind: 'entry',
        mode: 'view',
        name: 'forbiddenNestedPage',
      }),
    ).toThrow('a popup cannot open a nested page');
  });

  it('disposes a closed subtree and restores the parent surface as active', () => {
    const runtime = new SurfaceRuntime();
    const page = runtime.open({ host: 'page', kind: 'entry', mode: 'edit', name: 'principal' });
    const popup = runtime.open({
      parentId: page.id,
      host: 'popup',
      kind: 'entry',
      mode: 'view',
      name: 'member',
    });
    const nested = runtime.open({
      parentId: popup.id,
      host: 'popup',
      kind: 'selector',
      mode: 'select',
      name: 'selector',
    });

    runtime.close(popup.id);

    expect(runtime.find(popup.id)).toBeNull();
    expect(runtime.find(nested.id)).toBeNull();
    expect(page.children).toEqual([]);
    expect(page.activeChildId).toBeNull();
    expect(runtime.activeSurface()).toBe(page);
    expect(page.state.active).toBe(true);
  });

  it('emits ordered lifecycle events that can be traced independently of DOM behavior', () => {
    const events = new SurfaceEventRuntime();
    const runtime = new SurfaceRuntime(events);
    const observed: string[] = [];
    events.subscribe('*', (event) =>
      observed.push(`${event.sequence}:${event.type}:${event.surfaceId}`),
    );

    const page = runtime.open({ host: 'page', kind: 'list', mode: 'browse', name: 'principals' });
    const popup = runtime.open({
      parentId: page.id,
      host: 'popup',
      kind: 'selector',
      mode: 'select',
      name: 'selector',
    });
    runtime.close(popup.id);

    expect(observed).toContain(`1:surface:creating:${page.id}`);
    expect(observed.some((value) => value.includes(`child:opened:${page.id}`))).toBe(true);
    expect(observed.some((value) => value.includes(`surface:disposed:${popup.id}`))).toBe(true);
    expect(events.history().map((event) => event.sequence)).toEqual(
      events.history().map((_event, index) => index + 1),
    );
  });

  it('records causal value-change events for future dependency-driven calculations', () => {
    const events = new SurfaceEventRuntime();
    const firstName = events.emit({
      type: 'value:changed',
      surfaceId: 'surface-entry',
      source: 'caller-default',
      payload: { field: 'firstName', oldValue: null, newValue: 'Yiannis' },
    });
    const fullName = events.emit({
      type: 'value:changed',
      surfaceId: 'surface-entry',
      source: 'calculation',
      causeEventId: firstName.id,
      payload: { field: 'fullName', oldValue: null, newValue: 'Yiannis Manatos' },
    });

    expect(fullName.causeEventId).toBe(firstName.id);
    expect(firstName.source).toBe('caller-default');
    expect(fullName.source).toBe('calculation');
  });
});
