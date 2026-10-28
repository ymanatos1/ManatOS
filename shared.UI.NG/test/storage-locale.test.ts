import { describe, expect, it } from 'vitest';
import { localizeStorage } from '../src/components/administration/storage/StorageLocale';

describe('Storage metadata translation', () => {
  it('translates adapter fields and workflow status without mutating their keys', () => {
    expect(localizeStorage('Connection', 'EL')).toBe('Σύνδεση');
    expect(localizeStorage('Database', 'EL')).toBe('Βάση δεδομένων');
    expect(localizeStorage('incomplete', 'EL')).toBe('μη ολοκληρωμένο');
    expect(localizeStorage('Connection', 'EN')).toBe('Connection');
  });

  it('preserves unknown dynamic API metadata and stored values', () => {
    expect(localizeStorage('custom-adapter-v2', 'EL')).toBe('custom-adapter-v2');
    expect(localizeStorage('SQL Server', 'EL')).toBe('SQL Server');
  });
});
