import { describe, expect, it } from 'vitest';

import {
  BoundFieldComponentController,
  registerGeneralFieldComponents,
} from '../../src/runtime/v2/field-components.js';
import { UiRegistry } from '../../src/runtime/v2/registry.js';
import type { UiFieldComponentDefinition } from '../../src/runtime/v2/field.js';

const registry = () => {
  const value = new UiRegistry<UiFieldComponentDefinition>({ name: 'field component' });
  registerGeneralFieldComponents(value);
  return value;
};

describe('V2 general field components', () => {
  it('registers one entity-agnostic implementation per ordinary semantic field family', () => {
    const value = registry();
    expect(value.definitions.size).toBe(9);
    expect([...value.definitions.keys()]).toEqual([
      'field.text',
      'field.boolean',
      'field.number',
      'field.date',
      'field.datetime',
      'field.duration',
      'field.version',
      'field.enum',
      'field.reference',
    ]);
  });

  it('does not treat a component without representation metadata as a wildcard', () => {
    const value = registry();
    const text = value.resolve('field.text');
    expect(text.field.representations?.has('default')).toBe(true);
    expect(text.field.representations?.has('summary')).toBe(false);
  });

  it('keeps the general controller value-less and delegates reads/writes to its binding', () => {
    const writes: unknown[] = [];
    const binding = {
      writable: true,
      read: () => 'before',
      write: (value: unknown) => writes.push(value),
      subscribe: () => () => undefined,
    } as never;
    const controller = new BoundFieldComponentController(binding);
    expect(controller.read()).toBe('before');
    controller.write('after');
    expect(writes).toEqual(['after']);
  });
});
