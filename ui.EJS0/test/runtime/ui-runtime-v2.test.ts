import { describe, expect, it } from 'vitest';

import {
  UiContext,
  type UiCtxObject,
  type UiCtxRuntimePort,
} from '../../src/runtime/v2/ui-context.js';
import { UI_STRUCTURAL_ROOT_ID, UiRuntime } from '../../src/runtime/v2/ui-runtime.js';

const contextFor = (path: string, value: UiCtxObject): UiContext => {
  const relative = (absolutePath: string): string =>
    absolutePath === path
      ? ''
      : absolutePath.startsWith(`${path}.`)
        ? absolutePath.slice(path.length + 1)
        : absolutePath;
  const read = (absolutePath: string): unknown => {
    const relativePath = relative(absolutePath);
    if (!relativePath) return value;
    return relativePath.split('.').reduce<unknown>((current, segment) => {
      if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined;
      return (current as Record<string, unknown>)[segment];
    }, value);
  };
  const port: UiCtxRuntimePort = {
    value,
    get: read,
    set: () => undefined,
    replace: (absolutePath, nextValue) => {
      if (relative(absolutePath) === 'state') value.state = nextValue;
    },
    delete: () => undefined,
    add: () => undefined,
  };
  return new UiContext(path, value, port);
};

describe('UiRuntime V2 topology and canonical CTX identity', () => {
  it('owns exactly one structural root and explicit adopted child topology', () => {
    const runtime = new UiRuntime();
    const pageCtx = { control: { id: 'page-users' } };
    const popupCtx = { control: { id: 'popup-user' } };
    const page = runtime.adoptChild(
      runtime.root,
      'page-users',
      { surface: 'list', host: 'page', entity: 'SysUsers' },
      contextFor('ctx.ui.level', pageCtx),
    );
    const popup = runtime.adoptChild(
      page,
      'popup-user',
      { surface: 'entry', host: 'popup', entity: 'SysUsers', mode: 'edit' },
      contextFor('ctx.ui.level.level', popupCtx),
    );

    expect(runtime.root.id).toBe(UI_STRUCTURAL_ROOT_ID);
    expect(runtime.root.parent).toBeNull();
    expect(runtime.root.invocation).toBeNull();
    expect(runtime.root.context).toBeNull();
    expect(runtime.root.isStructuralRoot).toBe(true);
    expect(page.parent).toBe(runtime.root);
    expect(popup.parent).toBe(page);
    expect(page.domId).toBe('level1');
    expect(popup.domId).toBe('level2');
    expect(page.context?.value).toBe(pageCtx);
    expect(popup.context?.value).toBe(popupCtx);
    expect(page.context?.path).toBe('ctx.ui.level');
    expect([...runtime.root.children]).toEqual([page]);
    expect([...page.children]).toEqual([popup]);
    expect(runtime.levels.size).toBe(3);
  });

  it('owns parent deactivation through the same canonical lifecycle authority', () => {
    const runtime = new UiRuntime();
    const page = runtime.adoptChild(
      runtime.root,
      'page-users',
      { surface: 'list', host: 'page', entity: 'SysUsers' },
      contextFor('ctx.ui.level', { state: { lifecycle: 'active', active: true } }),
    );

    runtime.deactivate(page, 'test');

    expect(page.lifecycle).toBe('deactivating');
    expect(page.active).toBe(false);
  });

  it('replaces the page subtree through explicit root ownership rather than observed CTX', () => {
    const runtime = new UiRuntime();
    runtime.adoptChild(
      runtime.root,
      'page-users',
      { surface: 'list', host: 'page', entity: 'SysUsers' },
      contextFor('ctx.ui.level', { state: { lifecycle: 'active', active: true } }),
    );
    runtime.replaceRootChild(
      'page-principals',
      { surface: 'list', host: 'page', entity: 'SysPrincipals' },
      contextFor('ctx.ui.level', { state: { lifecycle: 'active', active: true } }),
    );

    expect(runtime.find('page-users')).toBeUndefined();
    expect(runtime.find('page-principals')?.parent).toBe(runtime.root);
    expect([...runtime.root.children].map((level) => level.id)).toEqual(['page-principals']);
  });

  it('never reuses short DOM level identities after a level closes', async () => {
    const runtime = new UiRuntime();
    const first = runtime.adoptChild(
      runtime.root,
      'first',
      { surface: 'entry', host: 'page' },
      contextFor('ctx.ui.level', { state: { lifecycle: 'active', active: true } }),
    );
    expect(first.domId).toBe('level1');
    await runtime.requestClose(first, { removeContext: false });
    const second = runtime.adoptChild(
      runtime.root,
      'second',
      { surface: 'entry', host: 'page' },
      contextFor('ctx.ui.level', { state: { lifecycle: 'active', active: true } }),
    );
    expect(second.domId).toBe('level2');
  });

  it('rejects duplicate live level identities', () => {
    const runtime = new UiRuntime();
    const page = runtime.adoptChild(
      runtime.root,
      'same',
      { surface: 'entry', host: 'page' },
      contextFor('ctx.ui.level', { state: { lifecycle: 'active', active: true } }),
    );
    expect(() =>
      runtime.adoptChild(
        page,
        'same',
        { surface: 'entry', host: 'popup' },
        contextFor('ctx.ui.level.level', {}),
      ),
    ).toThrow('Duplicate UI level id: same');
  });
});

describe('UiRuntime V2 canonical surface opening', () => {
  it('opens one semantic surface through an independently registered host strategy', () => {
    const runtime = new UiRuntime();
    const events: string[] = [];
    runtime.registries.hosts.register({
      id: 'popup',
      contractVersion: 1,
      open: ({ runtime: owner, request }) => {
        events.push(`host:${request.invocation.host}`);
        return owner.adoptChild(
          request.parent ?? owner.root,
          request.id,
          request.invocation,
          request.context,
        );
      },
    });
    runtime.registries.surfaces.register({
      id: 'entry',
      contractVersion: 1,
      open: ({ level, request }) => {
        events.push(`surface:${request.invocation.surface}`);
        return { levelId: level.id, entity: request.invocation.entity };
      },
    });

    const opened = runtime.open<{ levelId: string; entity?: string }>({
      id: 'popup-user',
      invocation: { surface: 'entry', host: 'popup', entity: 'SysUsers', mode: 'edit' },
      context: contextFor('ctx.ui.level', { control: {}, state: {} }),
    });

    expect(events).toEqual(['host:popup', 'surface:entry']);
    expect(opened.level.parent).toBe(runtime.root);
    expect(opened.host.id).toBe('popup');
    expect(opened.surface.id).toBe('entry');
    expect(opened.value).toEqual({ levelId: 'popup-user', entity: 'SysUsers' });
  });

  it('fails before topology mutation when either requested host or surface is unknown', () => {
    const runtime = new UiRuntime();
    runtime.registries.hosts.register({
      id: 'page',
      contractVersion: 1,
      open: ({ runtime: owner, request }) =>
        owner.adoptChild(owner.root, request.id, request.invocation, request.context),
    });

    expect(() =>
      runtime.open({
        id: 'unknown-surface',
        invocation: { surface: 'missing', host: 'page' },
        context: contextFor('ctx.ui.level', { control: {}, state: {} }),
      }),
    ).toThrow('Unknown UI surface id: missing');
    expect(runtime.levels.size).toBe(1);
  });
});

it('identifies the canonical current/topmost level across nested open and close topology', async () => {
  const runtime = new UiRuntime();
  const parent = runtime.adoptChild(
    runtime.root,
    'parent-current',
    { surface: 'list', host: 'page' },
    contextFor('ctx.ui.level', { state: { lifecycle: 'created', active: false } }),
  );
  runtime.activate(parent);
  expect(runtime.currentLevel()).toBe(parent);

  const child = runtime.adoptChild(
    parent,
    'child-current',
    { surface: 'entry', host: 'popup' },
    contextFor('ctx.ui.level.level', { state: { lifecycle: 'created', active: false } }),
  );
  runtime.deactivate(parent);
  runtime.activate(child);
  expect(runtime.currentLevel()).toBe(child);

  await runtime.requestClose(child, { decision: 'discard' });
  expect(runtime.currentLevel()).toBe(parent);
});
