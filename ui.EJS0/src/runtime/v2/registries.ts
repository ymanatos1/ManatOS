import { UiRegistry, type UiExtensionDefinition } from './registry.js';
import type { UiComponentDefinition } from './component.js';
import type { UiEntryPersistenceDefinition } from './entry-persistence.js';
import type { UiHostDefinition, UiSurfaceDefinition } from './surface-host.js';

/**
 * Runtime extension contracts. Host and surface registries are executable as
 * of Stage 20; the remaining marker contracts transfer when their respective
 * responsibilities move into the typed runtime.
 */
export type { UiHostDefinition, UiSurfaceDefinition } from './surface-host.js';
export type UiBindingDefinition = UiExtensionDefinition;
export type UiActionDefinition = UiExtensionDefinition;
export type UiPersistenceDefinition = UiEntryPersistenceDefinition;
export type UiRelationshipDefinition = UiExtensionDefinition;
export type UiResourceProviderDefinition = UiExtensionDefinition;

/** One registry set owned by one browser UiRuntime. */
export class UiRuntimeRegistries {
  readonly hosts = new UiRegistry<UiHostDefinition>({ name: 'UI host' });
  readonly surfaces = new UiRegistry<UiSurfaceDefinition>({ name: 'UI surface' });
  readonly components = new UiRegistry<UiComponentDefinition>({ name: 'UI component' });
  readonly bindings = new UiRegistry<UiBindingDefinition>({ name: 'UI binding' });
  readonly actions = new UiRegistry<UiActionDefinition>({ name: 'UI action' });
  readonly persistence = new UiRegistry<UiPersistenceDefinition>({ name: 'UI persistence' });
  readonly relationships = new UiRegistry<UiRelationshipDefinition>({ name: 'UI relationship' });
  readonly resourceProviders = new UiRegistry<UiResourceProviderDefinition>({
    name: 'UI resource provider',
  });
}
