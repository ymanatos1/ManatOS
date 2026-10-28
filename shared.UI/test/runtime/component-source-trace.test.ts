import { afterEach, describe, expect, it } from 'vitest';
import {
  emitUiComponentSourceTrace,
  isUiComponentSourceTracingEnabled,
  setUiComponentSourceTraceSink,
  type UiComponentSourceTraceRecord,
} from '../../src/runtime/source-trace.js';

describe('component-first source trace (separate from CTX debugging)', () => {
  afterEach(() => setUiComponentSourceTraceSink(null));

  const layout: UiComponentSourceTraceRecord = {
    phase: 'layout',
    surfacePath: 'ctx.ui.level',
    layoutPath: 'ctx.ui.level.layout.field',
    parentLayoutPath: 'ctx.ui.level.layout',
    componentKind: 'field-string',
    componentId: 'name',
  };

  it('stays disabled without observers and emits only structural facts when enabled', () => {
    expect(isUiComponentSourceTracingEnabled()).toBe(false);
    const events: UiComponentSourceTraceRecord[] = [];
    setUiComponentSourceTraceSink((event) => events.push(event));
    expect(isUiComponentSourceTracingEnabled()).toBe(true);
    emitUiComponentSourceTrace(layout);
    expect(events).toEqual([layout]);
    expect(Object.keys(events[0]!)).toEqual([
      'phase',
      'surfacePath',
      'layoutPath',
      'parentLayoutPath',
      'componentKind',
      'componentId',
    ]);
    expect(Object.isFrozen(events[0])).toBe(true);
  });

  it('keeps trace-sink errors and recursive tracing out of runtime behavior', () => {
    let calls = 0;
    setUiComponentSourceTraceSink(() => {
      calls++;
      emitUiComponentSourceTrace(layout);
      throw new Error('developer sink failed');
    });
    expect(() => emitUiComponentSourceTrace(layout)).not.toThrow();
    expect(calls).toBe(1);
    expect(isUiComponentSourceTracingEnabled()).toBe(true);
  });
});
