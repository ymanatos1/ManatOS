import { describe, expect, it } from 'vitest';

import type {
  UiCtxObject,
  UiCtxMutationCause,
  UiCtxRuntimePort,
} from '../../src/runtime/v2/ui-context.js';
import { UiContext } from '../../src/runtime/v2/ui-context.js';
import { UiRuntime } from '../../src/runtime/v2/ui-runtime.js';

const pathParts = (path: string) =>
  path
    .replace(/^ctx\.?/, '')
    .split('.')
    .filter(Boolean);

const portFor = (root: UiCtxObject, operations: string[]): UiCtxRuntimePort => {
  const locate = (path: string): unknown => {
    let value: unknown = root;
    for (const part of pathParts(path)) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
      value = (value as UiCtxObject)[part];
    }
    return value;
  };
  const assign = (path: string, value: unknown): void => {
    const parts = pathParts(path);
    const key = parts.pop();
    if (!key) return;
    let owner: UiCtxObject = root;
    for (const part of parts) owner = owner[part] as UiCtxObject;
    owner[key] = value;
  };
  const remove = (path: string): void => {
    const parts = pathParts(path);
    const key = parts.pop();
    if (!key) return;
    let owner: UiCtxObject = root;
    for (const part of parts) owner = owner[part] as UiCtxObject;
    delete owner[key];
  };
  const operation = (kind: string, path: string, value?: unknown, cause?: UiCtxMutationCause) => {
    operations.push(`${kind}:${path}:${String(cause?.action ?? '')}`);
    if (kind === 'replace' || kind === 'set') assign(path, value);
    if (kind === 'delete') remove(path);
    return value;
  };
  return {
    value: root,
    get: locate,
    set: (path, value, cause) => operation('set', path, value, cause),
    replace: (path, value, cause) => operation('replace', path, value, cause),
    delete: (path, cause) => operation('delete', path, undefined, cause),
    add: (path, value, cause) => operation('add', path, value, cause),
  };
};

const levelValue = (id: string, lifecycle = 'created'): UiCtxObject => ({
  control: { id },
  state: { lifecycle, active: lifecycle === 'active' },
});

describe('UiRuntime V2 generic level lifecycle', () => {
  it('reads and writes lifecycle only through canonical CTX', () => {
    const operations: string[] = [];
    const value = levelValue('page');
    const root: UiCtxObject = { ui: { level: value } };
    const port = portFor(root, operations);
    const runtime = new UiRuntime();
    const level = runtime.adoptChild(
      runtime.root,
      'page',
      { surface: 'list', host: 'page' },
      new UiContext('ctx.ui.level', value, port),
    );

    expect(level.lifecycle).toBe('created');
    runtime.activate(level);
    expect(level.lifecycle).toBe('active');
    expect(level.active).toBe(true);
    expect(value.state).toMatchObject({
      lifecycle: 'active',
      active: true,
    });
    expect(operations).toEqual(['replace:ctx.ui.level.state:activate-level']);
  });

  it('disposes descendants before their owner and removes the complete canonical subtree', async () => {
    const operations: string[] = [];
    const childValue = levelValue('popup', 'active');
    const pageValue = { ...levelValue('page', 'active'), level: childValue };
    const root: UiCtxObject = { ui: { level: pageValue } };
    const port = portFor(root, operations);
    const runtime = new UiRuntime();
    const page = runtime.adoptChild(
      runtime.root,
      'page',
      { surface: 'entry', host: 'page' },
      new UiContext('ctx.ui.level', pageValue, port),
    );
    runtime.adoptChild(
      page,
      'popup',
      { surface: 'entry', host: 'popup' },
      new UiContext('ctx.ui.level.level', childValue, port),
    );

    await runtime.requestClose(page);

    expect(runtime.levels.size).toBe(1);
    expect(runtime.root.children.size).toBe(0);
    expect((root.ui as UiCtxObject).level).toBeUndefined();
    expect(operations.map((item) => item.split(':').slice(0, 2).join(':'))).toEqual([
      'replace:ctx.ui.level.level.state',
      'replace:ctx.ui.level.level.state',
      'replace:ctx.ui.level.level.state',
      'delete:ctx.ui.level.level',
      'replace:ctx.ui.level.state',
      'replace:ctx.ui.level.state',
      'replace:ctx.ui.level.state',
      'delete:ctx.ui.level',
    ]);
  });

  it('keeps live UiLevel identity independent of canonical CTX state mutation', () => {
    const operations: string[] = [];
    const value = levelValue('page', 'active');
    const root: UiCtxObject = { ui: { level: value } };
    const port = portFor(root, operations);
    const runtime = new UiRuntime();
    const page = runtime.adoptChild(
      runtime.root,
      'page',
      { surface: 'list', host: 'page', entity: 'SysUsers' },
      new UiContext('ctx.ui.level', value, port),
    );

    port.replace('ctx.ui.level.state', { lifecycle: 'active', active: true });

    expect(runtime.find('page')).toBe(page);
    expect(page.context?.path).toBe('ctx.ui.level');
  });
  it('propagates one runtime-only owner capability by reference through nested UiLevels', () => {
    const operations: string[] = [];
    const childValue = levelValue('child');
    const ownerValue = { ...levelValue('owner'), level: childValue };
    const root: UiCtxObject = { ui: { level: ownerValue } };
    const port = portFor(root, operations);
    const runtime = new UiRuntime();
    const owner = runtime.adoptChild(
      runtime.root,
      'owner',
      { surface: 'hierarchy', host: 'page' },
      new UiContext('ctx.ui.level', ownerValue, port),
    );
    const capability = {
      provideEntry: () => {
        throw new Error('unused');
      },
    } as never;
    const child = runtime.adoptChild(
      owner,
      'child',
      { surface: 'entry', host: 'popup' },
      new UiContext('ctx.ui.level.level', childValue, port),
    );
    owner.bindOwnerProvider(capability);

    expect(owner.ownerProvider).toBe(capability);
    expect(child.ownerProvider).toBe(capability);
    expect(JSON.stringify(root)).not.toContain('provideEntry');
  });
});
