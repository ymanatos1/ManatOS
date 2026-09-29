import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('recovery runtime-resource scope isolation', () => {
  it('resolves identical resource keys through the canonical recovered report context', async () => {
    const fakeWindow = { ManatOS: {} };
    vi.stubGlobal('window', fakeWindow);
    const { SemanticReportPresentation } =
      await import('../../src/runtime/semantic-report-presentation.js');
    new SemanticReportPresentation().install();
    const surfaces = [
      { runtimeResources: { 'picture:7': { dataBase64: 'surface-a' } } },
      { runtimeResources: { 'picture:7': { dataBase64: 'surface-b' } } },
    ];
    const context = (fakeWindow.ManatOS as any).semanticReportPresentation.recovered(surfaces);

    expect(context.resolveRuntimeResource('recovery-surface:0', 'picture:7')).toEqual({
      dataBase64: 'surface-a',
    });
    expect(context.resolveRuntimeResource('recovery-surface:1', 'picture:7')).toEqual({
      dataBase64: 'surface-b',
    });
    expect(context.resolveRuntimeResource('recovery-surface:2', 'picture:7')).toBeNull();
    expect(context.resolveRuntimeResource('invalid', 'picture:7')).toBeNull();
  });
});
