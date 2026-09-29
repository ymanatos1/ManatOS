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
    expect(runtime).toContain('const isUiLevel =');
    expect(runtime).toContain("['page', 'popup', 'embedded'].includes(control.host)");
    expect(runtime).toContain(
      "['static', 'list', 'entry', 'selector', 'hierarchy', 'custom'].includes(control.kind)",
    );
    expect(runtime).toContain("if (isUiLevel) kind = 'ui-level'");
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
    expect(debuggerSource).toContain('attributes: descriptor.attributes');
    expect(debuggerSource).toContain("label: 'Watchable'");
    expect(debuggerSource).toContain('value: descriptor.watchable === false');
    expect(debuggerSource).toContain('activeTab: propertiesTab');
    expect(propertiesSource).toContain("activeTab === 'attributes'");
    expect(propertiesSource).toContain("list.className = 'ctx-debug-attribute-list'");
    expect(propertiesSource).toContain("activeTab === 'subscribers'");
    expect(propertiesSource).toContain("key: 'direct'");
    expect(propertiesSource).toContain("key: 'dependent'");
    expect(propertiesSource).toContain("key: 'global'");
    expect(propertiesSource).toContain("label: 'Dependents'");
    expect(propertiesSource).toContain('button.title = category.tooltip');
    expect(propertiesSource).toContain("list.className = 'ctx-debug-subscriber-list'");
    expect(propertiesSource).toContain('Subscriber: ${subscriber.label || subscriber.kind}');
    expect(propertiesSource).toContain('Registration: ${subscriber.match}');
    expect(runtime).toContain('match,');
    expect(propertiesSource).toContain('subscriber.match');
    expect(debuggerSource).toContain('ctx-debug-node-icon');
  });

  it('maintains logical CTX statistics at mutation time instead of traversing during debugger render', async () => {
    const runtime = await ui('public/js/runtime/context-runtime.js');
    const debuggerSource = await ui('public/js/debugger/ctx-debug.js');

    expect(runtime).not.toContain('logicalMeasure');
    expect(runtime).not.toContain('initialStatistics');
    expect(runtime).toContain('const accountCreatedNode =');
    expect(runtime).toContain('const accountDisposedNode =');
    expect(runtime).toContain('const accountCreatedTree =');
    expect(runtime).toContain('const accountDisposedTree =');
    expect(runtime).toContain('JSON.parse(snapshotElement.textContent');
    expect(runtime).toContain('statistics: statisticsSnapshot');
    expect(debuggerSource).toContain('runtime.statistics?.() || { nodes: 0, bytes: 0 }');
    expect(debuggerSource).not.toContain('measureContext');
  });

  it('keeps current and original aliases read-only while retaining one authority for each', async () => {
    const runtime = await ui('public/js/runtime/context-runtime.js');
    const entrySurface = await ui('src/runtime/v2/entity-entry-surface.ts');

    expect(runtime).toContain('get: () => field.value');
    expect(runtime).toContain('const entryLevel = level;');
    expect(runtime).toContain('Object.defineProperty(entryLevel.data.entry.original, key');
    expect(runtime).toContain('get: () => field.originalValue');
    expect(runtime).not.toContain('page.entry.current[key] = value');
    expect(runtime).toContain('throw new Error(`ctx path is read-only: ${path}`)');
    expect(entrySurface).toContain('this.#reconcileCurrent(result.record);');
    expect(entrySurface).toContain('this.#promoteBaseline(result.record);');
    expect(entrySurface).toContain(
      'this.context.replace(`data.fields.${key}.value`, authoritativeValue',
    );
    expect(entrySurface).toContain(
      'this.context.replace(`data.fields.${key}.originalValue`, currentValue',
    );
  });

  it('recognizes every canonical UI level from the stable control contract only', async () => {
    const runtime = await ui('public/js/runtime/context-runtime.js');
    expect(runtime).toContain("['page', 'popup', 'embedded'].includes(control.host)");
    expect(runtime).toContain("typeof control.path === 'string'");
    expect(runtime).not.toContain("typeof state.lifecycle === 'string'");
  });
});
