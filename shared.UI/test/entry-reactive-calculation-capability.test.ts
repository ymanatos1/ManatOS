import { describe, expect, it, vi } from 'vitest';
import type { ExpressionCapabilityDelegate } from '@manatos/shared';
import { uiEntryProjectRecord } from '../src/components/entry/EntryMetadata.js';

const parentId = '11111111-1111-4111-8111-111111111111';
const rootId = '22222222-2222-4222-8222-222222222222';

const principal = (parent: string | null) => ({
  principalType: 'Person',
  firstName: 'Guest',
  lastName: 'Yiannis',
  parentId: parent,
  rootId: null,
});

describe('Entry live calculated fields', () => {
  it('delegates a reached persisted parent traversal while preserving local name calculations', async () => {
    const evaluateFunction = vi.fn(async () => rootId);
    const delegate: ExpressionCapabilityDelegate = {
      capabilities: ['entityResolver'],
      evaluateFunction,
    };
    const projected = await uiEntryProjectRecord('sys-principals', principal(parentId), delegate);
    expect(projected.rootId).toBe(rootId);
    expect(evaluateFunction).toHaveBeenCalledWith({
      functionName: 'TraverseEntity',
      capability: 'entityResolver',
      args: [parentId, 'sys-principals', 'parentId', 'id'],
    });

    const countBeforeClearing = evaluateFunction.mock.calls.length;
    const noParent = await uiEntryProjectRecord(
      'sys-principals',
      { ...principal(null), rootId },
      delegate,
    );
    expect(noParent.rootId).toBeNull();
    expect(evaluateFunction).toHaveBeenCalledTimes(countBeforeClearing);
  });

  it('keeps pure calculations local and never delegates an unreachable branch', async () => {
    const evaluateFunction = vi.fn(async () => rootId);
    const delegate: ExpressionCapabilityDelegate = {
      capabilities: ['entityResolver'],
      evaluateFunction,
    };
    const record = await uiEntryProjectRecord('sys-principals', principal(null), delegate);
    expect(typeof record.name).toBe('string');
    expect(evaluateFunction).not.toHaveBeenCalled();
  });
});
