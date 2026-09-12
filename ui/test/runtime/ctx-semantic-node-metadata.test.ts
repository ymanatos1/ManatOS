import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const ui = (path: string) => readFile(resolve(here, '..', '..', path), 'utf8');

describe('semantic CTX node contracts', () => {
  it('exposes kind/type/attributes outside the application value tree', async () => {
    const runtime = await ui('public/js/runtime/context-runtime.js');
    const debuggerSource = await ui('public/js/debugger/ctx-debug.js');
    const propertiesSource = await ui('public/js/debugger/ctx-properties.js');

    expect(runtime).toContain('const describe = (path) =>');
    expect(runtime).toContain("kind = 'ui-level'");
    expect(runtime).toContain("kind = 'invocation'");
    expect(runtime).toContain("kind = 'state'");
    expect(runtime).toContain("kind = 'fields'");
    expect(runtime).not.toContain("kind = 'initialization'");
    expect(runtime).toContain("kind = 'field'");
    expect(runtime).toContain("attributes.add('readonly')");
    expect(runtime).toContain('describe,');
    expect(runtime).toContain('trackSubscriber,');
    expect(runtime).toContain('subscriberSummary,');
    expect(runtime).toContain('subscribers: subscriberSummary(normalized)');
    expect(runtime).toContain('registrations: Object.freeze(registrations)');
    expect(debuggerSource).toContain('CTX_KIND_ICONS');
    expect(debuggerSource).toContain("label: 'Attributes'");
    expect(debuggerSource).toContain('value: descriptor.attributes.length');
    expect(debuggerSource).toContain("label: 'Watchable'");
    expect(debuggerSource).toContain('value: descriptor.watchable === false');
    expect(debuggerSource).toContain('activeTab: propertiesTab');
    expect(propertiesSource).toContain("activeTab === 'subscribers'");
    expect(propertiesSource).toContain("['Total', String(summary?.total ?? 0)]");
    expect(propertiesSource).toContain("list.className = 'ctx-debug-subscriber-list'");
    expect(propertiesSource).toContain('subscriber.label || subscriber.kind');
    expect(runtime).toContain('match,');
    expect(propertiesSource).toContain('subscriber.match');
    expect(debuggerSource).toContain('ctx-debug-node-icon');
  });

  it('keeps current and original aliases read-only while retaining one authority for each', async () => {
    const runtime = await ui('public/js/runtime/context-runtime.js');
    const save = await ui('public/js/sysbo/entry/save.js');

    expect(runtime).toContain('get: () => field.value');
    expect(runtime).toContain('const entryLevel = level;');
    expect(runtime).toContain('Object.defineProperty(entryLevel.entry.original, key');
    expect(runtime).toContain('get: () => field.originalValue');
    expect(runtime).not.toContain('page.entry.current[key] = value');
    expect(runtime).toContain('throw new Error(`ctx path is read-only: ${path}`)');
    expect(save).toContain('runtime.replace(baselinePath, value');
    expect(save).toContain('runtime.replace(fieldPath, value');
    expect(save).not.toContain('runtime.replace(currentPath');
  });
});
