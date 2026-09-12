import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const uiSource = (relativePath: string) =>
  readFile(resolve(testDirectory, '..', '..', relativePath), 'utf8');

describe('V2 EntityEntry canonical runtime', () => {
  it('keeps SysBO entry topology and policy browser-owned after V2 acceptance', async () => {
    const route = await uiSource('src/routes/sysbo/entry/renderer.ts');
    expect(route).not.toContain('enableV2Scenario');
    expect(route).toContain("'pages/sysbo/entry'");
    expect(route).not.toContain('new SurfaceRuntime()');
    expect(route).not.toContain('new EntityEntryRuntime({');
    expect(route).not.toContain('projectUiCtx(');
    expect(route).toContain("purpose: 'open-entity-entry'");
    expect(route).toContain('current: v2ServerValues');
  });

  it('keeps the canonical entry renderer free of retired engine-selection paths', async () => {
    const route = await uiSource('src/routes/sysbo/entry/renderer.ts');

    expect(route).not.toContain('engineSelection');
    expect(route).not.toContain('compareSemanticSnapshots');
    expect(route).toContain("'pages/sysbo/entry'");
  });
  it('keeps field live/baseline authority and exposes entry current/original as read-only mirrors', async () => {
    const ctxRuntime = await uiSource('public/js/runtime/context-runtime.js');

    expect(ctxRuntime).toContain('isObject(page.entry?.current)');
    expect(ctxRuntime).not.toContain('page.entry.current[key] = value');
    expect(ctxRuntime).toContain('get: () => field.value');
    expect(ctxRuntime).toContain('get: () => field.originalValue');
    expect(ctxRuntime).toContain('const updateBaseline = (pagePath, key, value, cause = {}) =>');
    expect(ctxRuntime).toContain('get: () => !Object.is(field.originalValue, field.value)');
    expect(ctxRuntime).toContain(
      'if (match) return updateField(match[1], match[2], value, undefined, cause)',
    );
    expect(ctxRuntime).not.toContain('field.dirty = !Object.is(field.originalValue, field.value)');
    expect(ctxRuntime).toContain("attributes.add('mirror')");
  });
});
