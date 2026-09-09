import { describe, expect, it } from 'vitest';
import {
  calculateEntryAggregatePolicy,
  reactiveChangeQueueKey,
  reactiveDependencyMatchesChange,
  reactivePathsOverlap,
} from '@manatos/shared';

describe('shared V2 reactive and aggregate policy', () => {
  it('uses one canonical parent/child dependency relation', () => {
    expect(reactivePathsOverlap('ctx.ui.level.state', 'ctx.ui.level.state.dirty')).toBe(true);
    expect(reactiveDependencyMatchesChange('fields.name.value', 'fields.name.value')).toBe(true);
    expect(reactiveDependencyMatchesChange('fields.name.value', 'fields.other.value')).toBe(false);
  });

  it('deduplicates queued changes by root causal event when available', () => {
    expect(
      reactiveChangeQueueKey('fields.name.value', { rootEventId: 'root-1', eventId: 'e-2' }),
    ).toBe('root-1|fields.name.value');
  });

  it('owns the aggregate Save-readiness predicate for scalar and compound state', () => {
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
