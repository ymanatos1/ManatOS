import { describe, expect, it } from 'vitest';

import { UiRegistry, type UiExtensionDefinition } from '../../src/runtime/v2/registry.js';
import { UiRuntimeRegistries } from '../../src/runtime/v2/registries.js';
import { UiRuntime } from '../../src/runtime/v2/ui-runtime.js';

interface TestDefinition extends UiExtensionDefinition {
  readonly marker: string;
}

describe('UiRuntime V2 typed extension registries', () => {
  it('resolves trusted implementations by stable id and required capabilities', () => {
    const registry = new UiRegistry<TestDefinition>({ name: 'test extension' });
    const definition: TestDefinition = {
      id: 'table',
      contractVersion: 1,
      capabilities: new Set(['display', 'selection']),
      marker: 'implementation',
    };

    registry.register(definition);

    expect(registry.resolve('table')).toBe(definition);
    expect(registry.resolve('table', ['selection'])).toBe(definition);
    expect(registry.supports('table', ['display', 'selection'])).toBe(true);
    expect(registry.supports('table', ['editing'])).toBe(false);
    expect(() => registry.resolve('table', ['editing'])).toThrow(
      'test extension table lacks capabilities: editing',
    );
  });

  it('rejects duplicate ids, unknown references and incompatible contract versions', () => {
    const registry = new UiRegistry<TestDefinition>({ name: 'test extension' });
    registry.register({ id: 'one', contractVersion: 1, marker: 'first' });

    expect(() => registry.register({ id: 'one', contractVersion: 1, marker: 'duplicate' })).toThrow(
      'Duplicate test extension id: one',
    );
    expect(() => registry.resolve('missing')).toThrow('Unknown test extension id: missing');
    expect(() => registry.register({ id: 'future', contractVersion: 2, marker: 'future' })).toThrow(
      'test extension future implements contract v2; runtime requires v1.',
    );
  });

  it('gives each UiRuntime one complete injectable registry set without kernel special cases', () => {
    const registries = new UiRuntimeRegistries();
    registries.components.register({
      id: 'synthetic-test-component',
      contractVersion: 1,
      capabilities: new Set(['display']),
    });
    const runtime = new UiRuntime('$test-root', registries);

    expect(runtime.registries).toBe(registries);
    expect(runtime.registries.components.resolve('synthetic-test-component', ['display']).id).toBe(
      'synthetic-test-component',
    );
    expect(runtime.registries.hosts.definitions.size).toBe(0);
    expect(runtime.registries.surfaces.definitions.size).toBe(0);
  });
});

describe('Stage 20 executable host/surface registry contracts', () => {
  it('requires executable open operations for host and surface definitions', () => {
    const registries = new UiRuntimeRegistries();
    const host = registries.hosts.register({
      id: 'embedded',
      contractVersion: 1,
      open: ({ runtime, request }) =>
        runtime.adoptChild(
          request.parent ?? runtime.root,
          request.id,
          request.invocation,
          request.context,
        ),
    });
    const surface = registries.surfaces.register({
      id: 'entry',
      contractVersion: 1,
      open: ({ level }) => level.id,
    });

    expect(typeof host.open).toBe('function');
    expect(typeof surface.open).toBe('function');
  });
});
