import { describe, expect, it } from 'vitest';

import { InMemoryRepository } from '../src/storage/in-memory-repository.js';
import { compileExpression } from '@manatos/shared';

const metadata = {
  key: 'test-items',
  name: 'Test item',
  pluralName: 'Test items',
  primaryField: 'name',
  fieldDefinition: {
    id: { key: 'id', label: 'Id', type: 'guid', order: 0, required: true },
    name: { key: 'name', label: 'Name', type: 'string', order: 1, required: true },
    kind: { key: 'kind', label: 'Kind', type: 'string', order: 2, required: true },
  },
} as any;

describe('generic listExceptions query predicate', () => {
  it('excludes rows when the canonical expression evaluates true before paging', async () => {
    const records = new Map<string, any>([
      ['1', { id: '1', name: 'One', kind: 'keep' }],
      ['2', { id: '2', name: 'Two', kind: 'drop' }],
      ['3', { id: '3', name: 'Three', kind: 'keep' }],
    ]);
    const repo = new InMemoryRepository(records, metadata);
    const result = await repo.list({
      page: 1,
      pageSize: 10,
      direction: 'asc',
      filters: {},
      listExceptions: compileExpression("id IN ['2'] || kind == 'drop'"),
    });
    expect(result.items.map((item) => item.id)).toEqual(['1', '3']);
    expect(result.total).toBe(2);
  });
});
