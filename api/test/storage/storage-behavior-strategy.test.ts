import { describe, expect, it } from 'vitest';

import { storageAdapterRegistry } from '../../src/storage/adapter-registry.js';
import { resolveStorageBehaviorStrategies } from '../../src/storage/behavior-contract.js';

describe('storage behavioral contract strategy', () => {
  it('preserves invariant behavior through adapter fallback when the engine lacks native features', () => {
    const strategies = storageAdapterRegistry.behaviorStrategies('in-memory-json');

    expect(strategies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ behavior: 'writes.atomic', mechanism: 'adapter-transaction' }),
        expect.objectContaining({
          behavior: 'integrity.unique',
          mechanism: 'adapter-unique-check',
        }),
        expect.objectContaining({
          behavior: 'calculations.persisted',
          mechanism: 'adapter-evaluation',
        }),
      ]),
    );
  });

  it('uses inherited native relational capabilities without pretending ManatOS expressions are SQL-translatable', () => {
    const sqlServer = storageAdapterRegistry.get('rdbms-sql-server');
    const strategies = resolveStorageBehaviorStrategies(sqlServer);

    expect(strategies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ behavior: 'writes.atomic', mechanism: 'native-transaction' }),
        expect.objectContaining({
          behavior: 'integrity.references',
          mechanism: 'native-foreign-key',
        }),
        expect.objectContaining({
          behavior: 'calculations.persisted',
          mechanism: 'adapter-evaluation',
          nativeCandidate: 'generated-column',
        }),
      ]),
    );
  });

  it('can select native generated-column realization only when a translator is explicitly available', () => {
    const sqlServer = storageAdapterRegistry.get('rdbms-sql-server');
    const strategies = resolveStorageBehaviorStrategies(sqlServer, {
      expressionTranslationAvailable: true,
    });

    expect(strategies).toContainEqual(
      expect.objectContaining({
        behavior: 'calculations.persisted',
        mechanism: 'generated-column',
        native: true,
      }),
    );
  });
});
