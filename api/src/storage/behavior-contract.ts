import type { StorageAdapterDefinition } from './adapter-definition.js';
import type { StorageCapabilityKey } from './capabilities.js';

/**
 * Observable storage semantics ManatOS promises independently of provider.
 *
 * Capabilities describe what an engine can do natively. These behaviors describe
 * what callers are allowed to rely on. An adapter must therefore provide each
 * behavior either natively or through adapter/application fallback logic.
 */
export type StorageBehaviorKey =
  | 'writes.atomic'
  | 'integrity.unique'
  | 'integrity.references'
  | 'calculations.persisted'
  | 'schema.semantic-projection';

export interface StorageBehaviorContractEntry {
  readonly key: StorageBehaviorKey;
  readonly label: string;
  readonly description: string;
}

export const storageBehaviorContract = Object.freeze([
  Object.freeze({
    key: 'writes.atomic',
    label: 'Atomic writes',
    description:
      'A logical ManatOS mutation either completes as a unit or leaves persisted state unchanged.',
  }),
  Object.freeze({
    key: 'integrity.unique',
    label: 'Uniqueness',
    description:
      'Metadata-declared unique values are rejected consistently regardless of the active adapter.',
  }),
  Object.freeze({
    key: 'integrity.references',
    label: 'Referential integrity',
    description:
      'Metadata-declared entity relationships preserve ManatOS reference and delete semantics.',
  }),
  Object.freeze({
    key: 'calculations.persisted',
    label: 'Persisted calculations',
    description:
      'Fields declared as persisted calculations are materialized from the canonical expression before commit.',
  }),
  Object.freeze({
    key: 'schema.semantic-projection',
    label: 'Semantic schema projection',
    description:
      'Physical schema planning is derived from canonical entity metadata rather than adapter-specific duplicated models.',
  }),
] satisfies readonly StorageBehaviorContractEntry[]);

export type StorageBehaviorMechanism =
  | 'native-transaction'
  | 'adapter-transaction'
  | 'native-unique-constraint'
  | 'adapter-unique-check'
  | 'native-foreign-key'
  | 'adapter-reference-integrity'
  | 'generated-column'
  | 'trigger'
  | 'adapter-evaluation'
  | 'schema-planner';

export interface StorageBehaviorStrategy {
  readonly behavior: StorageBehaviorKey;
  readonly mechanism: StorageBehaviorMechanism;
  readonly native: boolean;
  readonly capability?: StorageCapabilityKey;
  /** Optional native mechanism that could replace the current fallback once its translator exists. */
  readonly nativeCandidate?: StorageBehaviorMechanism;
}

const supports = (definition: StorageAdapterDefinition, key: StorageCapabilityKey) =>
  definition.capabilities.some((capability) => capability.key === key && capability.supported);

/**
 * Resolve implementation strategy from effective inherited capabilities.
 *
 * Persisted expression translation is intentionally not assumed merely because
 * an RDBMS supports generated columns/triggers: ManatOS expressions need an
 * explicit safe translator first. Until then the invariant strategy is the
 * shared adapter/application evaluator.
 */
export function resolveStorageBehaviorStrategies(
  definition: StorageAdapterDefinition,
  options: Readonly<{ expressionTranslationAvailable?: boolean }> = {},
): readonly StorageBehaviorStrategy[] {
  const generated = supports(definition, 'calculation.generated-columns');
  const triggers = supports(definition, 'calculation.triggers');
  const expressionTranslationAvailable = options.expressionTranslationAvailable === true;

  const calculationStrategy: StorageBehaviorStrategy =
    expressionTranslationAvailable && generated
      ? {
          behavior: 'calculations.persisted',
          mechanism: 'generated-column',
          native: true,
          capability: 'calculation.generated-columns',
        }
      : {
          behavior: 'calculations.persisted',
          mechanism: 'adapter-evaluation',
          native: false,
          ...(generated
            ? {
                capability: 'calculation.generated-columns' as const,
                nativeCandidate: 'generated-column' as const,
              }
            : triggers
              ? {
                  capability: 'calculation.triggers' as const,
                  nativeCandidate: 'trigger' as const,
                }
              : {}),
        };

  return Object.freeze([
    Object.freeze(
      supports(definition, 'transactions.atomic')
        ? {
            behavior: 'writes.atomic' as const,
            mechanism: 'native-transaction' as const,
            native: true,
            capability: 'transactions.atomic' as const,
          }
        : {
            behavior: 'writes.atomic' as const,
            mechanism: 'adapter-transaction' as const,
            native: false,
          },
    ),
    Object.freeze(
      supports(definition, 'integrity.unique-constraints')
        ? {
            behavior: 'integrity.unique' as const,
            mechanism: 'native-unique-constraint' as const,
            native: true,
            capability: 'integrity.unique-constraints' as const,
          }
        : {
            behavior: 'integrity.unique' as const,
            mechanism: 'adapter-unique-check' as const,
            native: false,
          },
    ),
    Object.freeze(
      supports(definition, 'integrity.foreign-keys')
        ? {
            behavior: 'integrity.references' as const,
            mechanism: 'native-foreign-key' as const,
            native: true,
            capability: 'integrity.foreign-keys' as const,
          }
        : {
            behavior: 'integrity.references' as const,
            mechanism: 'adapter-reference-integrity' as const,
            native: false,
          },
    ),
    Object.freeze(calculationStrategy),
    Object.freeze({
      behavior: 'schema.semantic-projection' as const,
      mechanism: 'schema-planner' as const,
      native: false,
    }),
  ]);
}
