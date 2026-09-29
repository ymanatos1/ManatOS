import type { SysBOFieldType } from '@manatos/shared/metadata/bo';
import type { SysBOUIFieldRepresentation } from '@manatos/shared/metadata/ui';

import type { EntityFieldBinding, UiBindingListener } from './binding.js';
import type {
  UiComponentController,
  UiComponentCreateContext,
  UiComponentDefinition,
} from './component.js';
import type { UiFieldComponentDefinition } from './field.js';
import type { UiRegistry } from './registry.js';

/**
 * Host-neutral controller shared by ordinary canonical field components.
 *
 * It owns no value or baseline. Renderers read/write through the binding and may
 * subscribe to canonical CTX changes. DOM ownership remains with the eventual
 * host/renderer adapter rather than leaking into the semantic component.
 */
export class BoundFieldComponentController<T = unknown> implements UiComponentController {
  constructor(readonly binding: EntityFieldBinding<T>) {}

  get writable(): boolean {
    return this.binding.writable;
  }

  read(): T {
    return this.binding.read();
  }

  write(value: T): unknown {
    return this.binding.write(value, { source: 'field-component' });
  }

  mount(): void {}

  subscribe(listener: UiBindingListener<T>): () => void {
    return this.binding.subscribe(listener, {
      kind: 'component',
      label: 'Canonical field component',
    });
  }
}

const DEFAULT_REPRESENTATION = new Set<SysBOUIFieldRepresentation>(['default']);

const fieldDefinition = (
  id: string,
  types: readonly SysBOFieldType[],
  representations: ReadonlySet<SysBOUIFieldRepresentation> = DEFAULT_REPRESENTATION,
): UiFieldComponentDefinition => ({
  id,
  contractVersion: 1,
  binding: { kinds: new Set(['entity-field']) },
  field: { types: new Set(types), representations },
  create: (context: UiComponentCreateContext<EntityFieldBinding>) =>
    new BoundFieldComponentController(context.binding),
});

/** Ordinary field components. Rich/binary editors intentionally remain Stage 17. */
export const GENERAL_FIELD_COMPONENTS: readonly UiFieldComponentDefinition[] = Object.freeze([
  fieldDefinition('field.text', ['guid', 'string', 'email', 'telephone']),
  fieldDefinition('field.boolean', ['boolean']),
  fieldDefinition('field.number', ['number']),
  fieldDefinition('field.date', ['date']),
  fieldDefinition('field.datetime', ['datetime']),
  fieldDefinition('field.duration', ['duration']),
  fieldDefinition('field.version', ['version']),
  fieldDefinition('field.enum', ['enum']),
  fieldDefinition('field.reference', ['reference']),
]);

/** Register the built-in general field vocabulary once into a runtime registry. */
export function registerGeneralFieldComponents(registry: UiRegistry<UiComponentDefinition>): void {
  for (const definition of GENERAL_FIELD_COMPONENTS) registry.register(definition);
}
