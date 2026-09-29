import { describe, expect, it } from 'vitest';

import {
  PictureFieldComponentController,
  PicturesFieldComponentController,
  RichTextFieldComponentController,
  registerRichFieldComponents,
} from '../../src/runtime/v2/rich-field-components.js';
import { UiRegistry } from '../../src/runtime/v2/registry.js';
import type { UiFieldComponentDefinition } from '../../src/runtime/v2/field.js';
import { UiRuntime } from '../../src/runtime/v2/ui-runtime.js';
import { UiRuntimeRegistries } from '../../src/runtime/v2/registries.js';

const registry = () => {
  const value = new UiRegistry<UiFieldComponentDefinition>({ name: 'field component' });
  registerRichFieldComponents(value);
  return value;
};

describe('V2 rich field components', () => {
  it('registers rich text, scalar picture and ordered pictures by semantic field type', () => {
    const value = registry();
    expect([...value.definitions.keys()]).toEqual([
      'field.rich-text',
      'field.picture',
      'field.pictures',
    ]);
    expect(value.resolve('field.rich-text').field.types.has('richText')).toBe(true);
    expect(value.resolve('field.picture').field.types.has('picture')).toBe(true);
    expect(value.resolve('field.pictures').field.types.has('pictures')).toBe(true);
  });

  it('keeps rich-text mode private while canonical text reads and writes only through binding', () => {
    let canonical: string | null = '# Before';
    const binding = {
      writable: true,
      read: () => canonical,
      write: (value: string | null) => (canonical = value),
      subscribe: () => () => undefined,
    } as never;
    const controller = new RichTextFieldComponentController(binding);
    controller.setMode('preview');
    controller.write('# After');
    expect(controller.mode).toBe('preview');
    expect(controller.read()).toBe('# After');
  });

  it('keeps picture bytes private while pending descriptors are canonical semantic values', () => {
    let scalar: unknown = null;
    const scalarBinding = {
      writable: true,
      read: () => scalar,
      write: (value: unknown) => (scalar = value),
    } as never;
    const picture = new PictureFieldComponentController(scalarBinding);
    const payload = { contentType: 'image/jpeg', dataBase64: 'AA==' };
    picture.setPending({ pending: true, token: 'p1' }, payload);
    expect(scalar).toEqual({ pending: true, token: 'p1' });
    expect(picture.pendingPayload()).toBe(payload);
    picture.dispose();
    expect(picture.pendingPayload()).toBeNull();
    expect(scalar).toEqual({ pending: true, token: 'p1' });

    let collection: readonly Record<string, unknown>[] = [];
    const collectionBinding = {
      writable: true,
      read: () => collection,
      write: (value: readonly Record<string, unknown>[]) => (collection = value),
    } as never;
    const pictures = new PicturesFieldComponentController(collectionBinding);
    pictures.rememberPending('p1', payload);
    pictures.replace([{ pending: true, token: 'p1' }]);
    expect(collection).toEqual([{ pending: true, token: 'p1' }]);
    expect(pictures.pendingPayload('p1')).toBe(payload);
    pictures.dispose();
    expect(pictures.pendingPayload('p1')).toBeUndefined();
    expect(collection).toEqual([{ pending: true, token: 'p1' }]);
  });
});

// Runtime startup must fill the built-in vocabulary even when a trusted caller
// pre-registers an unrelated component; a non-empty registry is not "complete".

describe('V2 built-in field component registration', () => {
  it('does not lose built-ins when a runtime receives a partially populated component registry', () => {
    const registries = new UiRuntimeRegistries();
    registries.components.register({
      id: 'custom.component',
      contractVersion: 1,
      create: () => ({}),
    });
    const runtime = new UiRuntime('$test-root', registries);
    expect(runtime.registries.components.find('custom.component')).toBeDefined();
    expect(runtime.registries.components.find('field.text')).toBeDefined();
    expect(runtime.registries.components.find('field.rich-text')).toBeDefined();
    expect(runtime.registries.components.find('field.picture')).toBeDefined();
  });
});
