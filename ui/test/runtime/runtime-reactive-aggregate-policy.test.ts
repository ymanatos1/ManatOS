import { describe, expect, it } from 'vitest';
import {
  calculateEntryAggregatePolicy,
  calculateEntryContributorAggregate,
  reactiveChangeQueueKey,
  reactiveDependencyMatchesChange,
  reactivePathsOverlap,
} from '@manatos/shared';

describe('shared V2 reactive and aggregate policy', () => {
  it('uses one canonical parent/child dependency relation', () => {
    expect(
      reactivePathsOverlap('ctx.ui.level.control.state', 'ctx.ui.level.control.state.dirty'),
    ).toBe(true);
    expect(reactiveDependencyMatchesChange('fields.name.value', 'fields.name.value')).toBe(true);
    expect(reactiveDependencyMatchesChange('fields.name.value', 'fields.other.value')).toBe(false);
  });

  it('deduplicates queued changes by root causal event when available', () => {
    expect(
      reactiveChangeQueueKey('fields.name.value', { rootEventId: 'root-1', eventId: 'e-2' }),
    ).toBe('root-1|fields.name.value');
  });

  it('owns contributor reduction and aggregate Save-readiness for scalar and compound state', () => {
    expect(
      calculateEntryContributorAggregate([
        { dirty: true, valid: true },
        { valid: false, blocksPersistence: true },
        { blocksPersistence: true },
      ]),
    ).toEqual({ dirty: true, valid: false, blocked: true, blockingCount: 2 });

    expect(calculateEntryContributorAggregate([])).toEqual({
      dirty: false,
      valid: true,
      blocked: false,
      blockingCount: 0,
    });

    expect(
      calculateEntryAggregatePolicy({
        mode: 'edit',
        fieldDirty: true,
        fieldValid: true,
      }).saveReady,
    ).toBe(true);
    expect(
      calculateEntryAggregatePolicy({
        mode: 'edit',
        fieldDirty: true,
        fieldValid: true,
        blocked: true,
      }).saveReady,
    ).toBe(false);
    expect(
      calculateEntryAggregatePolicy({
        mode: 'edit',
        fieldDirty: false,
        fieldValid: true,
        contributorDirty: true,
      }).dirty,
    ).toBe(true);
  });
});
