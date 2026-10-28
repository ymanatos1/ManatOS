import { describe, expect, it } from 'vitest';

import {
  groupUiStorageCapabilities,
  uiStorageSavedStepReached,
  type UiStorageCapability,
} from '../src/index.js';

const capability = (
  key: string,
  category: string,
  supported: boolean,
  sourceName: string,
): UiStorageCapability => ({
  key,
  category,
  label: key,
  description: `${key} description`,
  supported,
  sourceId: sourceName.toLowerCase(),
  sourceName,
  sourceKind: 'family',
});

describe('Storage wizard saved-progress navigation', () => {
  it('opens saved stages for review without implying fresh target verification', () => {
    const saved = { stage: 'schema' };

    expect(uiStorageSavedStepReached(saved, 'configuration')).toBe(true);
    expect(uiStorageSavedStepReached(saved, 'connection')).toBe(true);
    expect(uiStorageSavedStepReached(saved, 'database')).toBe(true);
    expect(uiStorageSavedStepReached(saved, 'schema')).toBe(true);
    expect(uiStorageSavedStepReached(saved, 'data')).toBe(false);
  });

  it('does not invent progress for new, incomplete, or unknown stages', () => {
    expect(uiStorageSavedStepReached(null, 'database')).toBe(false);
    expect(uiStorageSavedStepReached({ stage: 'connection' }, 'schema')).toBe(false);
    expect(uiStorageSavedStepReached({ stage: 'unknown' }, 'connection')).toBe(false);
    expect(uiStorageSavedStepReached({ stage: 'complete' }, 'data')).toBe(true);
  });
});

describe('Storage adapter capabilities presentation', () => {
  it('groups API capabilities without losing native support or inheritance', () => {
    const relational = capability('schema.tables', 'Schema', true, 'Relational');
    const transactions = capability('transactions.atomic', 'Transactions', true, 'Relational');
    const override = capability('schema.indexes', 'Schema', false, 'Custom adapter');

    const groups = groupUiStorageCapabilities([relational, transactions, override]);

    expect(groups.map((group) => group.name)).toEqual(['Schema', 'Transactions']);
    expect(groups[0]?.capabilities).toEqual([relational, override]);
    expect(groups[0]?.capabilities[1]?.supported).toBe(false);
    expect(groups[0]?.capabilities[1]?.sourceName).toBe('Custom adapter');
    expect(groups[1]?.capabilities).toEqual([transactions]);
  });

  it('handles adapters with no capabilities', () => {
    expect(groupUiStorageCapabilities([])).toEqual([]);
  });
});
