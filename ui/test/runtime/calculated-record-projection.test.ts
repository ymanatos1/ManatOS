import { projectCalculatedRecord } from '@manatos/shared';
import { describe, expect, it } from 'vitest';

describe('canonical calculated-record projection', () => {
  it('settles dependent calculated fields through one shared fixed-point algorithm', async () => {
    const fields = [
      { key: 'displayName', calculation: { expression: 'first + last' } },
      { key: 'caption', calculation: { expression: 'displayName' } },
    ];

    const result = await projectCalculatedRecord(
      { first: 'Yiannis ', last: 'Manatos', displayName: '', caption: '' },
      fields,
      (_expression, { field, record }) =>
        field.key === 'displayName'
          ? `${record.first ?? ''}${record.last ?? ''}`
          : record.displayName,
    );

    expect(result.displayName).toBe('Yiannis Manatos');
    expect(result.caption).toBe('Yiannis Manatos');
  });

  it('keeps the previous field value when one projection cannot currently resolve', async () => {
    const result = await projectCalculatedRecord(
      { id: '1', calculated: 'persisted' },
      [{ key: 'calculated', calculation: { expression: 'Resolver()' } }],
      () => {
        throw new Error('capability unavailable');
      },
    );

    expect(result.calculated).toBe('persisted');
  });
});
