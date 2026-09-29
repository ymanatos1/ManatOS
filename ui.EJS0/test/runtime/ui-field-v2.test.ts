import { describe, expect, it, vi } from 'vitest';

import {
  UiContext,
  type UiCtxObject,
  type UiCtxRuntimePort,
} from '../../src/runtime/v2/ui-context.js';
import { UiRuntime } from '../../src/runtime/v2/ui-runtime.js';
import { EntityFieldRuntime, type UiFieldComponentDefinition } from '../../src/runtime/v2/field.js';
import { UiRegistry } from '../../src/runtime/v2/registry.js';
import type { UiComponentDefinition } from '../../src/runtime/v2/component.js';

function fixture() {
  const levelValue: UiCtxObject = {
    mode: 'edit',
    data: {
      entry: { original: { name: 'Before' }, current: { name: 'Before' } },
      fields: { name: { value: 'Before' } },
    },
  };
  const relativeParts = (path: string) =>
    path
      .replace(/^ctx\.ui\.level\.?/, '')
      .split('.')
      .filter(Boolean);
  const get = vi.fn((path: string) =>
    relativeParts(path).reduce<unknown>((v, key) => (v as UiCtxObject)?.[key], levelValue),
  );
  const replace = vi.fn((path: string, value: unknown) => {
    const parts = relativeParts(path);
    let target = levelValue;
    for (const key of parts.slice(0, -1)) target = target[key] as UiCtxObject;
    target[parts.at(-1)!] = value as never;
    if (path === 'ctx.ui.level.data.fields.name.value')
      ((levelValue.data as UiCtxObject).entry as UiCtxObject).current = { name: value };
    return value;
  });
  const port: UiCtxRuntimePort = {
    value: levelValue,
    get,
    set: replace,
    replace,
    delete: vi.fn(),
    add: vi.fn(),
  };
  const context = new UiContext('ctx.ui.level', levelValue, port);
  const runtime = new UiRuntime();
  const level = runtime.adoptChild(
    runtime.root,
    'entry',
    { surface: 'entity-entry', host: 'page', entity: 'Test' },
    context,
  );
  return { context, level };
}

const stringField = { key: 'name', label: 'Name', type: 'string', order: 1 } as const;

describe('V2 entity field runtime', () => {
  it('keeps canonical CTX binding as the only value authority and composes read-only policy', () => {
    const { context, level } = fixture();
    const editable = new EntityFieldRuntime<string>(
      level,
      context,
      stringField,
      undefined,
      'read-write',
    );
    editable.write('After');
    expect(editable.read()).toBe('After');
    expect(context.get('data.entry.current.name')).toBe('After');

    const canonicalReadOnly = new EntityFieldRuntime(
      level,
      context,
      { ...stringField, readOnly: true },
      undefined,
      'read-write',
    );
    expect(canonicalReadOnly.writable).toBe(false);
    const viewReadOnly = new EntityFieldRuntime(
      level,
      context,
      stringField,
      { editable: false },
      'read-write',
    );
    expect(viewReadOnly.writable).toBe(false);

    const dynamicReadOnly = new EntityFieldRuntime(
      level,
      context,
      stringField,
      { editable: { expression: "mode === 'edit'" } },
      'read-write',
    );
    expect(dynamicReadOnly.writable).toBe(true);
    context.replace('mode', 'view');
    expect(dynamicReadOnly.writable).toBe(false);
    expect(() => dynamicReadOnly.write('Blocked')).toThrow(/read-only/);
  });

  it('selects registered components by field type and representation without entity-specific dispatch', () => {
    const { context, level } = fixture();
    const field = new EntityFieldRuntime(level, context, stringField, undefined, 'read-write');
    const registry = new UiRegistry<UiComponentDefinition>({ name: 'UI component' });
    const editor: UiFieldComponentDefinition = {
      id: 'text-editor',
      contractVersion: 1,
      binding: { kinds: new Set(['entity-field']), writable: true },
      field: { types: new Set(['string']), representations: new Set(['default']) },
      create: () => ({}),
    };
    registry.register(editor);
    expect(field.component(registry)).toBe(editor);
    expect(() => field.component(registry, 'summary')).toThrow(/No UI component supports/);
  });

  it('supports explicit component references only when their declared field contract is compatible', () => {
    const { context, level } = fixture();
    const field = new EntityFieldRuntime(level, context, stringField, undefined, 'read-write');
    const registry = new UiRegistry<UiComponentDefinition>({ name: 'UI component' });
    registry.register({
      id: 'boolean-editor',
      contractVersion: 1,
      field: { types: new Set(['boolean']) },
      create: () => ({}),
    } as UiFieldComponentDefinition);
    expect(() => field.component(registry, 'default', 'boolean-editor')).toThrow(
      /does not support/,
    );
  });
});
