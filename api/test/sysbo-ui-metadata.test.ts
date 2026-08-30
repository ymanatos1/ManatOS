import { describe, expect, it } from 'vitest';

import { allSysBOUIMetadata } from '../src/metadata/sysbo-ui-registry.js';

describe('metadata-driven SysBO UI conventions', () => {
  it('gives every metadata-driven entry form the same icon-bearing General tab', () => {
    const entries = Object.values(allSysBOUIMetadata);
    expect(entries.length).toBeGreaterThan(0);

    for (const metadata of entries) {
      const general = metadata.record.tabs.find((tab) => tab.id === 'general');
      expect(general, `${metadata.key} should declare a General tab`).toBeDefined();
      expect(general?.label).toBe('General');
      expect(general?.icon).toBe('info-circle');
      expect(general?.layout).toBe('form');
    }
  });

  it('gives every metadata-driven entry form the same standard Save/Delete lifecycle actions', () => {
    const entries = Object.values(allSysBOUIMetadata);
    expect(entries.length).toBeGreaterThan(0);

    for (const metadata of entries) {
      const actions = Object.values(metadata.record.entryActions || {});
      expect(actions.some((action) => action.kind === 'save'), `${metadata.key} should expose the standard Save action`).toBe(true);
      expect(actions.some((action) => action.kind === 'delete'), `${metadata.key} should expose the standard Delete action`).toBe(true);
    }
  });

});
