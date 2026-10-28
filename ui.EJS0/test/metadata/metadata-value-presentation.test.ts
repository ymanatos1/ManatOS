import { describe, expect, it } from 'vitest';

import {
  formatMetadataValue,
  metadataFieldRepresentation,
  metadataOptionItemForField,
  metadataOptionToneClass,
} from '../../src/presentation/metadata/value-presentation.js';

describe('generic metadata value presentation', () => {
  it('uses badges as the universal summary representation for boolean fields', () => {
    expect(metadataFieldRepresentation('summary', 'boolean')).toBe('badge');
    expect(metadataFieldRepresentation('summary', 'enum')).toBe('badge');
    expect(metadataFieldRepresentation('summary', 'reference')).toBe('entry-link');
    expect(metadataFieldRepresentation('summary', 'string')).toBe('summary');
    expect(metadataFieldRepresentation('entry-link', 'boolean')).toBe('entry-link');
    expect(metadataFieldRepresentation('default', 'boolean')).toBe('default');
    expect(metadataFieldRepresentation('default', 'reference')).toBe('default');
  });
  it('resolves presentation-only and enum option catalogues without entity knowledge', () => {
    const field = {
      optionItems: [{ value: 'internal', label: 'ManatOS', icon: 'shield-check' }],
      enumItems: [{ value: 'external', label: 'External', tone: 'success' as const }],
    };

    expect(metadataOptionItemForField(field, 'internal')).toMatchObject({ label: 'ManatOS' });
    expect(metadataOptionItemForField(field, 'external')).toMatchObject({ label: 'External' });
    expect(
      metadataOptionItemForField(
        { enumItems: [{ value: 'Active', label: { EN: 'Active', EL: 'Ενεργό' } }] },
        'Active',
        'EL',
      ),
    ).toMatchObject({ value: 'Active', label: 'Ενεργό' });
    expect(metadataOptionItemForField(field, 'missing')).toBeNull();
    expect(metadataOptionToneClass(field.enumItems[0])).toBe('text-success');
  });

  it('formats generic scalar, duration and datetime values without domain-specific formatters', () => {
    expect(formatMetadataValue(null, { emptyText: 'None' })).toBe('None');
    expect(formatMetadataValue({ years: 1, months: 2, days: 0 })).toBe('1 year, 2 months');
    expect(formatMetadataValue({ value: { years: 0, months: 3, days: 0 } })).toBe('3 months');
    expect(formatMetadataValue({ value: { value: { years: 0, months: 3, days: 0 } } })).toBe(
      '3 months',
    );
    expect(formatMetadataValue('plain')).toBe('plain');

    const formattedDate = formatMetadataValue('2026-09-02', { format: 'date' });
    expect(formattedDate).not.toBe('2026-09-02');

    const formatted = formatMetadataValue('2026-09-02T12:00:00.000Z', { format: 'datetime' });
    expect(formatted).not.toBe('2026-09-02T12:00:00.000Z');

    const elapsed = formatMetadataValue(new Date(Date.now() - 60_000).toISOString(), {
      format: 'datetime-elapsed',
    });
    expect(elapsed).toContain('ago)');
  });
});
