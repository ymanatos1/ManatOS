import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const source = () =>
  readFile(
    resolve(testDirectory, '..', '..', 'public/js/sysbo/entry/entry-representation.js'),
    'utf8',
  );

const loadRuntime = async (expression: Record<string, unknown>) => {
  const script = await source();
  const window = { ManatOS: { expression } } as any;
  new Function('window', script)(window);
  return window.ManatOS.entryRepresentation;
};

describe('browser entry representation source dispatch', () => {
  it('reads an exact factual field expression without invoking the evaluator', async () => {
    const evaluateAstAt = vi.fn(() => 'wrong');
    const runtime = await loadRuntime({
      astForSource: vi.fn(() => ({ kind: 'variable' })),
      evaluateAstAt,
    });
    const metadata = { fieldDefinition: { principalType: { key: 'principalType' } } };

    expect(
      runtime.sourceValue(
        {},
        { expression: 'principalType' },
        { principalType: 'Company' },
        null,
        '$.ui.level1',
        metadata,
      ),
    ).toBe('Company');
    expect(evaluateAstAt).not.toHaveBeenCalled();
  });

  it('keeps calculated and compound expressions evaluator-owned', async () => {
    const evaluateAstAt = vi.fn(() => 'evaluated');
    const runtime = await loadRuntime({
      astForSource: vi.fn(() => ({ kind: 'expression' })),
      evaluateAstAt,
    });
    const metadata = {
      fieldDefinition: {
        calculatedType: { key: 'calculatedType', calculation: { expression: "'Company'" } },
        principalType: { key: 'principalType' },
      },
    };

    expect(
      runtime.sourceValue(
        {},
        { expression: 'calculatedType' },
        { calculatedType: 'Company' },
        null,
        '$.ui.level1',
        metadata,
      ),
    ).toBe('evaluated');
    expect(
      runtime.sourceValue(
        {},
        { expression: "principalType === 'Company'" },
        { principalType: 'Company' },
        null,
        '$.ui.level1',
        metadata,
      ),
    ).toBe('evaluated');
    expect(evaluateAstAt).toHaveBeenCalledTimes(2);
  });
});
