import { describe, expect, it, vi } from 'vitest';

import { TransactionsSupport } from '../../src/storage/transactions-support.js';

describe('TransactionsSupport', () => {
  it('runs commit actions in registration order, destroys the active context, and makes commit retry idempotent', async () => {
    const support = new TransactionsSupport();
    const id = support.begin('session-1');
    const calls: string[] = [];
    support.register(
      id,
      'session-1',
      {
        commit: [
          { description: 'one', execute: async () => void calls.push('one') },
          { description: 'two', execute: async () => void calls.push('two') },
        ],
      },
      'picture replacement',
    );

    const result = await support.commit(id, 'session-1');
    const retried = await support.commit(id, 'session-1');

    expect(calls).toEqual(['one', 'two']);
    expect(result.failures).toEqual([]);
    expect(retried).toEqual(result);
    expect(() => support.assertOwned(id, 'session-1')).toThrow(/already committed/);
    await expect(support.rollback(id, 'session-1')).rejects.toThrow(/already committed/);
  });

  it('runs every rollback action in reverse order, records failures, destroys the context, and makes rollback retry idempotent', async () => {
    const support = new TransactionsSupport();
    const id = support.begin('session-1');
    const calls: string[] = [];
    support.register(
      id,
      'session-1',
      {
        rollback: [
          { description: 'oldest', execute: async () => void calls.push('oldest') },
          {
            description: 'failing',
            execute: async () => {
              calls.push('failing');
              throw new Error('rollback failed');
            },
          },
          { description: 'newest', execute: async () => void calls.push('newest') },
        ],
      },
      'three successful transaction steps',
    );

    const result = await support.rollback(id, 'session-1');
    const retried = await support.rollback(id, 'session-1');

    expect(calls).toEqual(['newest', 'failing', 'oldest']);
    expect(result.failures).toEqual([{ description: 'failing', message: 'rollback failed' }]);
    expect(retried).toEqual(result);
    expect(() => support.assertOwned(id, 'session-1')).toThrow(/already rolled back/);
    await expect(support.commit(id, 'session-1')).rejects.toThrow(/already rolled back/);
  });

  it("rejects another API session without destroying the owner's transaction or terminal result", async () => {
    const support = new TransactionsSupport();
    const id = support.begin('session-1');

    expect(() => support.assertOwned(id, 'session-2')).toThrow(/another API session/);
    const result = await support.rollback(id, 'session-1');
    await expect(support.rollback(id, 'session-2')).rejects.toThrow(/another API session/);
    await expect(support.rollback(id, 'session-1')).resolves.toEqual(result);
  });

  it('automatically rolls back an abandoned transaction and removes its active context', async () => {
    vi.useFakeTimers();
    try {
      const expired: string[] = [];
      const calls: string[] = [];
      const support = new TransactionsSupport({
        activeTimeoutMs: 100,
        terminalRetentionMs: 1_000,
        onExpired: (result) => void expired.push(result.transactionId),
      });
      const id = support.begin('session-1');
      support.register(
        id,
        'session-1',
        { rollback: [{ description: 'undo', execute: async () => void calls.push('undo') }] },
        'successful step',
      );

      await vi.advanceTimersByTimeAsync(101);

      expect(calls).toEqual(['undo']);
      expect(expired).toEqual([id]);
      expect(() => support.assertOwned(id, 'session-1')).toThrow(/already rolled back/);
      await expect(support.rollback(id, 'session-1')).resolves.toMatchObject({
        transactionId: id,
        phase: 'rollback',
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('continues finalization after action failures and always removes the active context', async () => {
    const support = new TransactionsSupport();
    const id = support.begin('session-1');
    const calls: string[] = [];
    support.register(
      id,
      'session-1',
      {
        commit: [
          {
            description: 'fails',
            execute: async () => {
              calls.push('fails');
              throw new Error('cleanup failed');
            },
          },
          { description: 'continues', execute: async () => void calls.push('continues') },
        ],
      },
      'cleanup',
    );

    const result = await support.commit(id, 'session-1');

    expect(calls).toEqual(['fails', 'continues']);
    expect(result.failures).toEqual([{ description: 'fails', message: 'cleanup failed' }]);
    expect(() => support.assertOwned(id, 'session-1')).toThrow(/already committed/);
  });
  it('coalesces concurrent retries of the same terminal operation so cleanup runs once', async () => {
    const support = new TransactionsSupport();
    const id = support.begin('session-1');
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let calls = 0;
    support.register(
      id,
      'session-1',
      {
        commit: [
          {
            description: 'slow cleanup',
            execute: async () => {
              calls += 1;
              await gate;
            },
          },
        ],
      },
      'slow cleanup',
    );

    const first = support.commit(id, 'session-1');
    const retry = support.commit(id, 'session-1');
    release();

    const [a, b] = await Promise.all([first, retry]);
    expect(calls).toBe(1);
    expect(b).toEqual(a);
  });

  it('does not expire a transaction while a participating operation is active and restarts idle expiry after release', async () => {
    vi.useFakeTimers();
    try {
      const calls: string[] = [];
      const support = new TransactionsSupport({ activeTimeoutMs: 100, terminalRetentionMs: 1_000 });
      const id = support.begin('session-1');
      support.register(
        id,
        'session-1',
        { rollback: [{ description: 'undo', execute: async () => void calls.push('undo') }] },
        'successful step',
      );

      support.acquireOperation(id, 'session-1');
      await vi.advanceTimersByTimeAsync(500);
      expect(calls).toEqual([]);
      expect(() => support.assertOwned(id, 'session-1')).not.toThrow();
      await expect(support.commit(id, 'session-1')).rejects.toThrow(/active operations/);

      support.releaseOperation(id, 'session-1');
      await vi.advanceTimersByTimeAsync(99);
      expect(calls).toEqual([]);
      await vi.advanceTimersByTimeAsync(2);
      expect(calls).toEqual(['undo']);
      expect(() => support.assertOwned(id, 'session-1')).toThrow(/already rolled back/);
    } finally {
      vi.useRealTimers();
    }
  });

  it('emits finalization diagnostics once even when terminal commit is retried', async () => {
    const finalized: string[] = [];
    const support = new TransactionsSupport({
      onFinalized: (result) => void finalized.push(`${result.phase}:${result.transactionId}`),
    });
    const id = support.begin('session-1');

    await support.commit(id, 'session-1');
    await support.commit(id, 'session-1');

    expect(finalized).toEqual([`commit:${id}`]);
  });

  it('does not let diagnostic callback failure affect finalization or context cleanup', async () => {
    const support = new TransactionsSupport({
      onFinalized: () => {
        throw new Error('diagnostic sink failed');
      },
    });
    const id = support.begin('session-1');

    await expect(support.commit(id, 'session-1')).resolves.toMatchObject({
      transactionId: id,
      phase: 'commit',
      failures: [],
    });
    expect(() => support.assertOwned(id, 'session-1')).toThrow(/already committed/);
  });

  it('does not let a failed second lease release the operation that already owns the lease', async () => {
    const support = new TransactionsSupport();
    const id = support.begin('session-1');
    support.acquireOperation(id, 'session-1');
    expect(() => support.acquireOperation(id, 'session-1')).toThrow(/active operations/);
    await expect(support.rollback(id, 'session-1')).rejects.toThrow(/active operations/);
    support.releaseOperation(id, 'session-1');
    await expect(support.rollback(id, 'session-1')).resolves.toMatchObject({ phase: 'rollback' });
  });
});
