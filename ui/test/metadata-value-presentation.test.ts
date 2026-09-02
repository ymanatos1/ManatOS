import { describe, expect, it } from 'vitest';

import {
  formatMetadataValue,
  metadataOptionItemForField,
  metadataOptionToneClass,
} from '../src/presentation/metadata-value-presentation.js';

describe('generic metadata value presentation', () => {
  it('resolves presentation-only and enum option catalogues without entity knowledge', () => {
    const field = {
      optionItems: [{ value: 'internal', label: 'ManatOS', icon: 'shield-check' }],
      enumItems: [{ value: 'external', label: 'External', tone: 'success' as const }],
    };

    expect(metadataOptionItemForField(field, 'internal')).toMatchObject({ label: 'ManatOS' });
    expect(metadataOptionItemForField(field, 'external')).toMatchObject({ label: 'External' });
    expect(metadataOptionItemForField(field, 'missing')).toBeNull();
    expect(metadataOptionToneClass(field.enumItems[0])).toBe('text-success');
  });

  it('formats generic scalar, duration and datetime values without domain-specific formatters', () => {
    expect(formatMetadataValue(null, { emptyText: 'None' })).toBe('None');
    expect(formatMetadataValue({ years: 1, months: 2, days: 0 })).toBe('1 year, 2 months');
    expect(formatMetadataValue('plain')).toBe('plain');

    const formatted = formatMetadataValue('2026-09-02T12:00:00.000Z', { format: 'datetime' });
    expect(formatted).not.toBe('2026-09-02T12:00:00.000Z');
  });
});
