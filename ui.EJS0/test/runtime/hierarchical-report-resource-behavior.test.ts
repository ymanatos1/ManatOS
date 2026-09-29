import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

class FakeElement {
  innerHTML = '';

  querySelector(): null {
    return null;
  }
}

describe('hierarchical report resource-scope behavior', () => {
  it('passes each node resource scope when rendering picture entry descriptors', async () => {
    const fakeWindow = { ManatOS: {} };
    vi.stubGlobal('window', fakeWindow);
    vi.stubGlobal('HTMLElement', FakeElement);
    const { HierarchicalReportRenderer } = await import('../../src/runtime/hierarchical-report.js');
    new HierarchicalReportRenderer().install();
    const host = new FakeElement();
    const resources = {
      'surface-a': { 'picture:7': { contentType: 'image/png', dataBase64: 'AAA' } },
      'surface-b': { 'picture:7': { contentType: 'image/png', dataBase64: 'BBB' } },
    } as Record<string, Record<string, unknown>>;

    (fakeWindow.ManatOS as any).hierarchicalReport.render(
      host,
      {
        nodes: [
          {
            label: 'A',
            resourceScope: 'surface-a',
            entryDescriptor: { label: 'A', imageResourceKey: 'picture:7' },
          },
          {
            label: 'B',
            resourceScope: 'surface-b',
            entryDescriptor: { label: 'B', imageResourceKey: 'picture:7' },
          },
        ],
      },
      {
        runtimeResourceResolver: (scope: string, key: string) => resources[scope]?.[key] ?? null,
      },
    );

    expect(host.innerHTML).toContain('data:image/png;base64,AAA');
    expect(host.innerHTML).toContain('data:image/png;base64,BBB');
  });
});
