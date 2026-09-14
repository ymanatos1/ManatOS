import type { StorageAdapterSourceDefinition } from '../../adapter-definition.js';

export const IN_MEMORY_JSON_ADAPTER_ID = 'in-memory-json';

export const inMemoryJsonAdapterDefinition: StorageAdapterSourceDefinition = Object.freeze({
  id: IN_MEMORY_JSON_ADAPTER_ID,
  name: 'In-memory / JSON file',
  familyId: 'document-file',
  logoUrl: '/images/storage-adapters/json.svg',
  description:
    'Keeps records in memory while the API is running and persists the datastore to a JSON file. Binary resources are stored in a filesystem folder.',
  runtimeAvailable: true,
  tabs: Object.freeze([
    Object.freeze({
      id: 'files',
      label: 'Files',
      fields: Object.freeze([
        Object.freeze({
          key: 'dataFile',
          label: 'Database JSON file',
          description: 'JSON file used to persist the datastore between API restarts.',
          type: 'path' as const,
          required: true,
        }),
        Object.freeze({
          key: 'binaryRoot',
          label: 'Binary resources folder',
          description:
            'Root folder used for pictures and other filesystem-backed binary resources.',
          type: 'path' as const,
          required: true,
        }),
      ]),
    }),
  ]),
});
