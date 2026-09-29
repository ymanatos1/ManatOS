export type UiExtensionId = string;
export type UiCapabilityId = string;

export interface UiExtensionDefinition {
  readonly id: UiExtensionId;
  /** Version of the narrow runtime contract implemented by this definition. */
  readonly contractVersion: number;
  readonly capabilities?: ReadonlySet<UiCapabilityId>;
}

export interface UiRegistryOptions {
  readonly name: string;
  readonly contractVersion?: number;
}

/**
 * Typed startup registry for trusted runtime implementations.
 *
 * Metadata carries stable ids/configuration only. Executable implementations
 * are registered here by trusted TypeScript code and resolved by reference.
 */
export class UiRegistry<TDefinition extends UiExtensionDefinition> {
  readonly #definitions = new Map<UiExtensionId, TDefinition>();
  readonly name: string;
  readonly contractVersion: number;

  constructor(options: UiRegistryOptions) {
    this.name = options.name;
    this.contractVersion = options.contractVersion ?? 1;
  }

  get definitions(): ReadonlyMap<UiExtensionId, TDefinition> {
    return this.#definitions;
  }

  register(definition: TDefinition): TDefinition {
    const id = definition.id.trim();
    if (!id) throw new Error(`${this.name} registry requires a non-empty id.`);
    if (definition.contractVersion !== this.contractVersion) {
      throw new Error(
        `${this.name} ${id} implements contract v${definition.contractVersion}; runtime requires v${this.contractVersion}.`,
      );
    }
    if (this.#definitions.has(id)) throw new Error(`Duplicate ${this.name} id: ${id}`);
    this.#definitions.set(id, definition);
    return definition;
  }

  find(id: UiExtensionId): TDefinition | undefined {
    return this.#definitions.get(id);
  }

  resolve(id: UiExtensionId, requiredCapabilities: readonly UiCapabilityId[] = []): TDefinition {
    const definition = this.find(id);
    if (!definition) throw new Error(`Unknown ${this.name} id: ${id}`);
    this.assertCapabilities(definition, requiredCapabilities);
    return definition;
  }

  supports(id: UiExtensionId, requiredCapabilities: readonly UiCapabilityId[] = []): boolean {
    const definition = this.find(id);
    if (!definition) return false;
    return requiredCapabilities.every((capability) => definition.capabilities?.has(capability));
  }

  assertCapabilities(
    definition: TDefinition,
    requiredCapabilities: readonly UiCapabilityId[],
  ): void {
    const missing = requiredCapabilities.filter(
      (capability) => !definition.capabilities?.has(capability),
    );
    if (missing.length > 0) {
      throw new Error(`${this.name} ${definition.id} lacks capabilities: ${missing.join(', ')}`);
    }
  }
}
