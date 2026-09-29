import type { SysBOFieldMetadata, SysBOFieldType } from '@manatos/shared/metadata/bo';
import type {
  SysBOUIFieldOverrideMetadata,
  SysBOUIFieldRepresentation,
} from '@manatos/shared/metadata/ui';

import { EntityFieldBinding, type UiBindingMode } from './binding.js';
import type { UiCtxMutationCause } from './ui-context.js';
import type { UiComponentDefinition } from './component.js';
import type { UiContext } from './ui-context.js';
import { resolveUiDynamicValue } from './expression.js';
import type { UiLevel } from './ui-level.js';
import type { UiRegistry } from './registry.js';

export interface UiFieldComponentCompatibility {
  readonly types: ReadonlySet<SysBOFieldType>;
  readonly representations?: ReadonlySet<SysBOUIFieldRepresentation>;
}

/** Trusted component implementation that declares which semantic fields it can present. */
export interface UiFieldComponentDefinition extends UiComponentDefinition<EntityFieldBinding> {
  readonly field: UiFieldComponentCompatibility;
}

/**
 * Runtime façade for one canonical entity field.
 *
 * It owns no field value. Value reads/writes always delegate to EntityFieldBinding and therefore
 * fields.<key>.value, while canonical BO metadata and effective view metadata remain definitions.
 */
export class EntityFieldRuntime<T = unknown> {
  readonly binding: EntityFieldBinding<T>;
  #override: Readonly<SysBOUIFieldOverrideMetadata> | undefined;
  #mode: UiBindingMode;

  constructor(
    readonly level: UiLevel,
    readonly context: UiContext,
    readonly metadata: SysBOFieldMetadata,
    override: Readonly<SysBOUIFieldOverrideMetadata> | undefined,
    mode: UiBindingMode,
  ) {
    this.#override = override;
    this.#mode = mode;
    if (level.context !== context) {
      throw new Error('Entity field runtime must use its owning UiLevel canonical CTX.');
    }
    this.binding = new EntityFieldBinding<T>(
      context,
      metadata.key,
      'read-write',
      () =>
        effectiveWritable(metadata, this.#override, this.#mode) &&
        resolveUiDynamicValue<boolean>(
          context,
          this.#override?.editable,
          true,
          `data.fields.${metadata.key}.ux.editable`,
          'field editable policy',
        ),
    );
  }

  get override(): Readonly<SysBOUIFieldOverrideMetadata> | undefined {
    return this.#override;
  }

  /** Rebind only effective view policy; semantic field/binding identity remains stable. */
  applyView(
    override: Readonly<SysBOUIFieldOverrideMetadata> | undefined,
    mode: UiBindingMode,
  ): void {
    this.#override = override;
    this.#mode = mode;
  }

  get key(): string {
    return this.metadata.key;
  }

  get type(): SysBOFieldType {
    return this.metadata.type;
  }

  get writable(): boolean {
    return this.binding.writable;
  }

  read(): T {
    return this.binding.read();
  }

  write(value: T, cause?: UiCtxMutationCause): unknown {
    return this.binding.write(value, cause ?? { source: `field-runtime:${this.key}` });
  }

  /** Select a trusted registered implementation by semantic compatibility, never by entity key. */
  component(
    registry: UiRegistry<UiComponentDefinition>,
    representation: SysBOUIFieldRepresentation = 'default',
    requestedId?: string,
  ): UiFieldComponentDefinition {
    if (requestedId) {
      const definition = registry.resolve(requestedId);
      if (!isFieldComponent(definition) || !supportsField(definition, this.type, representation)) {
        throw new Error(
          `UI component ${requestedId} does not support ${this.type}/${representation} field '${this.key}'.`,
        );
      }
      return definition;
    }

    for (const definition of registry.definitions.values()) {
      if (isFieldComponent(definition) && supportsField(definition, this.type, representation)) {
        return definition;
      }
    }
    throw new Error(`No UI component supports ${this.type}/${representation} field '${this.key}'.`);
  }
}

function effectiveWritable(
  metadata: SysBOFieldMetadata,
  override: Readonly<SysBOUIFieldOverrideMetadata> | undefined,
  requestedMode: UiBindingMode,
): boolean {
  return requestedMode !== 'read' && metadata.readOnly !== true && override?.editable !== false;
}

function isFieldComponent(
  definition: UiComponentDefinition,
): definition is UiFieldComponentDefinition {
  return 'field' in definition;
}

function supportsField(
  definition: UiFieldComponentDefinition,
  type: SysBOFieldType,
  representation: SysBOUIFieldRepresentation,
): boolean {
  return (
    definition.field.types.has(type) &&
    (definition.field.representations?.has(representation) ?? representation === 'default')
  );
}
