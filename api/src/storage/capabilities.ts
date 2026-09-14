export type StorageCapabilityKey =
  | 'model.relational'
  | 'model.document-records'
  | 'transactions.atomic'
  | 'transactions.savepoints'
  | 'schema.tables'
  | 'schema.indexes'
  | 'integrity.primary-keys'
  | 'integrity.unique-constraints'
  | 'integrity.foreign-keys'
  | 'integrity.check-constraints'
  | 'calculation.generated-columns'
  | 'calculation.triggers'
  | 'programmability.views'
  | 'programmability.functions'
  | 'programmability.stored-procedures'
  | 'administration.multiple-databases';

export interface StorageCapabilityCatalogEntry {
  key: StorageCapabilityKey;
  category: string;
  label: string;
  description: string;
}

export interface StorageCapabilityValue extends StorageCapabilityCatalogEntry {
  supported: boolean;
  sourceId: string;
  sourceName: string;
  sourceKind: 'family' | 'adapter';
}

export type StorageCapabilityOverrides = Partial<Record<StorageCapabilityKey, boolean>>;

export interface StorageAdapterFamilyDefinition {
  id: string;
  name: string;
  parentId?: string;
  capabilities: StorageCapabilityOverrides;
}

export const storageCapabilityCatalog = Object.freeze([
  Object.freeze({
    key: 'model.relational',
    category: 'Data model',
    label: 'Relational model',
    description: 'Native relational tables and relationships.',
  }),
  Object.freeze({
    key: 'model.document-records',
    category: 'Data model',
    label: 'Document records',
    description: 'Native document/file-oriented record persistence.',
  }),
  Object.freeze({
    key: 'transactions.atomic',
    category: 'Transactions',
    label: 'Atomic transactions',
    description: 'Native all-or-nothing transactional writes.',
  }),
  Object.freeze({
    key: 'transactions.savepoints',
    category: 'Transactions',
    label: 'Savepoints',
    description: 'Native savepoints inside a transaction.',
  }),
  Object.freeze({
    key: 'schema.tables',
    category: 'Schema',
    label: 'Tables',
    description: 'Native table/schema structures.',
  }),
  Object.freeze({
    key: 'schema.indexes',
    category: 'Schema',
    label: 'Indexes',
    description: 'Native indexes over stored data.',
  }),
  Object.freeze({
    key: 'integrity.primary-keys',
    category: 'Integrity',
    label: 'Primary keys',
    description: 'Native primary-key constraints.',
  }),
  Object.freeze({
    key: 'integrity.unique-constraints',
    category: 'Integrity',
    label: 'Unique constraints',
    description: 'Native uniqueness constraints.',
  }),
  Object.freeze({
    key: 'integrity.foreign-keys',
    category: 'Integrity',
    label: 'Foreign keys',
    description: 'Native referential-integrity constraints.',
  }),
  Object.freeze({
    key: 'integrity.check-constraints',
    category: 'Integrity',
    label: 'Check constraints',
    description: 'Native row/value check constraints.',
  }),
  Object.freeze({
    key: 'calculation.generated-columns',
    category: 'Calculated data',
    label: 'Generated / computed columns',
    description: 'Native generated or computed column expressions.',
  }),
  Object.freeze({
    key: 'calculation.triggers',
    category: 'Calculated data',
    label: 'Triggers',
    description: 'Native data-change triggers.',
  }),
  Object.freeze({
    key: 'programmability.views',
    category: 'Programmability',
    label: 'Views',
    description: 'Native persisted/queryable views.',
  }),
  Object.freeze({
    key: 'programmability.functions',
    category: 'Programmability',
    label: 'Stored functions',
    description: 'Native database-side stored functions.',
  }),
  Object.freeze({
    key: 'programmability.stored-procedures',
    category: 'Programmability',
    label: 'Stored procedures',
    description: 'Native database-side stored procedures.',
  }),
  Object.freeze({
    key: 'administration.multiple-databases',
    category: 'Administration',
    label: 'Multiple databases / catalogs',
    description: 'A server can host and select among multiple databases or catalogs.',
  }),
] satisfies readonly StorageCapabilityCatalogEntry[]);

const relationalCapabilities: StorageCapabilityOverrides = Object.freeze({
  'model.relational': true,
  'model.document-records': false,
  'transactions.atomic': true,
  'transactions.savepoints': true,
  'schema.tables': true,
  'schema.indexes': true,
  'integrity.primary-keys': true,
  'integrity.unique-constraints': true,
  'integrity.foreign-keys': true,
  'integrity.check-constraints': true,
  'calculation.generated-columns': true,
  'calculation.triggers': true,
  'programmability.views': true,
});

export const storageAdapterFamilies = Object.freeze([
  Object.freeze({
    id: 'document-file',
    name: 'Document / file',
    capabilities: Object.freeze({
      'model.relational': false,
      'model.document-records': true,
      'transactions.atomic': false,
      'transactions.savepoints': false,
      'schema.tables': false,
      'schema.indexes': false,
      'integrity.primary-keys': false,
      'integrity.unique-constraints': false,
      'integrity.foreign-keys': false,
      'integrity.check-constraints': false,
      'calculation.generated-columns': false,
      'calculation.triggers': false,
      'programmability.views': false,
      'programmability.functions': false,
      'programmability.stored-procedures': false,
      'administration.multiple-databases': false,
    }),
  }),
  Object.freeze({
    id: 'relational',
    name: 'Relational',
    capabilities: relationalCapabilities,
  }),
  Object.freeze({
    id: 'server-rdbms',
    name: 'Server RDBMS',
    parentId: 'relational',
    capabilities: Object.freeze({
      'programmability.functions': true,
      'programmability.stored-procedures': true,
      'administration.multiple-databases': true,
    }),
  }),
  Object.freeze({
    id: 'embedded-rdbms',
    name: 'Embedded RDBMS',
    parentId: 'relational',
    capabilities: Object.freeze({
      'programmability.functions': false,
      'programmability.stored-procedures': false,
      'administration.multiple-databases': false,
    }),
  }),
] satisfies readonly StorageAdapterFamilyDefinition[]);

const familyById = new Map<string, StorageAdapterFamilyDefinition>(
  storageAdapterFamilies.map((family) => [family.id, family]),
);

export function storageFamilyPath(familyId: string): readonly string[] {
  const path: string[] = [];
  const seen = new Set<string>();
  let current = familyById.get(familyId);
  while (current) {
    if (seen.has(current.id)) throw new Error(`Storage adapter family cycle at '${current.id}'.`);
    seen.add(current.id);
    path.unshift(current.name);
    current = current.parentId ? familyById.get(current.parentId) : undefined;
  }
  if (!path.length) throw new Error(`Unknown storage adapter family '${familyId}'.`);
  return Object.freeze(path);
}

export function resolveStorageCapabilities(
  familyId: string,
  adapterId: string,
  adapterName: string,
  overrides: StorageCapabilityOverrides = {},
): readonly StorageCapabilityValue[] {
  const lineage: StorageAdapterFamilyDefinition[] = [];
  const seen = new Set<string>();
  let current = familyById.get(familyId);
  while (current) {
    if (seen.has(current.id)) throw new Error(`Storage adapter family cycle at '${current.id}'.`);
    seen.add(current.id);
    lineage.unshift(current);
    current = current.parentId ? familyById.get(current.parentId) : undefined;
  }
  if (!lineage.length) throw new Error(`Unknown storage adapter family '${familyId}'.`);

  const effective = new Map<
    StorageCapabilityKey,
    { supported: boolean; sourceId: string; sourceName: string; sourceKind: 'family' | 'adapter' }
  >();
  for (const family of lineage) {
    for (const [key, supported] of Object.entries(family.capabilities) as [
      StorageCapabilityKey,
      boolean,
    ][]) {
      effective.set(key, {
        supported,
        sourceId: family.id,
        sourceName: family.name,
        sourceKind: 'family',
      });
    }
  }
  for (const [key, supported] of Object.entries(overrides) as [StorageCapabilityKey, boolean][]) {
    effective.set(key, {
      supported,
      sourceId: adapterId,
      sourceName: adapterName,
      sourceKind: 'adapter',
    });
  }

  return Object.freeze(
    storageCapabilityCatalog.map((capability) => {
      const value = effective.get(capability.key) ?? {
        supported: false,
        sourceId: familyId,
        sourceName: familyById.get(familyId)?.name ?? familyId,
        sourceKind: 'family' as const,
      };
      return Object.freeze({ ...capability, ...value });
    }),
  );
}
