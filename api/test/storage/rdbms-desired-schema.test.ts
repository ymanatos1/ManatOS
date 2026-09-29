import { describe, expect, it } from 'vitest';

import { desiredRdbmsSchema } from '../../src/storage/adapters/relational/desired-schema.js';

describe('canonical relational schema projection', () => {
  it('derives one stable table projection from canonical ManatOS object metadata', () => {
    const users = desiredRdbmsSchema.find((table) => table.objectKey === 'sys-users');
    expect(users?.name).toBe('m_sys_users');
    expect(
      users?.columns.some((column) => column.name === 'id' && column.fieldType === 'guid'),
    ).toBe(true);
    expect(users?.columns.some((column) => column.name === 'email')).toBe(true);
  });
});

it('keeps storage semantics adapter-neutral in the desired relational model', () => {
  const principals = desiredRdbmsSchema.find((table) => table.objectKey === 'sys-principals');
  const root = principals?.columns.find((column) => column.name === 'rootId');
  const parent = principals?.columns.find((column) => column.name === 'parentId');

  expect(root?.calculation).toMatchObject({ persisted: true });
  expect(root?.calculation?.expression).toContain('TraverseEntity');
  expect(parent?.referencedObjectKey).toBe('sys-principals');
});
