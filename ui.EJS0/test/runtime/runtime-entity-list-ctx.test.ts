import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const source = (path: string) => readFile(resolve(testDirectory, path), 'utf8');

describe('CTX-native EntityList surface', () => {
  it('publishes the canonical EntityList snapshot as list semantic state', async () => {
    const [renderer, host] = await Promise.all([
      source('../../src/routes/sysbo/list/renderer.ts'),
      source('../../public/js/runtime/ui-host-runtime.js'),
    ]);

    expect(renderer).toContain('list: {');
    expect(renderer).toContain('...listSnapshot');
    expect(renderer).toContain('resources: { referenceData: listReferenceData }');
    expect(host).toContain('structuredClone(input.list)');
    expect(host).toContain('setListLoading');
    expect(host).toContain('syncListSurface');
    expect(host).toContain("runtime.replace('ctx.ui.level.data.list'");
    expect(host).not.toContain("runtime.replace('ctx.ui.level.control.facts'");
  });

  it('synchronizes AJAX list navigation from returned semantic bootstrap rather than DOM state', async () => {
    const navigation = await source('../../public/js/sysbo/list/list-runtime.js');

    expect(navigation).toContain('setListLoading?.(true)');
    expect(navigation).toContain("getElementById('manatosUiBootstrap')");
    expect(navigation).toContain("nextBootstrap?.purpose === 'browse-entity-list'");
    expect(navigation).toContain('syncListSurface?.(nextBootstrap.list');
    expect(navigation).not.toContain('ctx.ui.level.data.list.query =');
    expect(navigation).not.toContain('facts: nextBootstrap.facts');
  });
});
