import {
  allSysBOMetadata,
  entryPresentationFieldKeys,
  relationshipForField,
  type ManatOSObjectMetadata,
  type SysBOEntity,
} from '@manatos/shared';
import type {
  AuthorizationService,
  AuthorizationSubject,
} from '../../auth/authorization-service.js';
import type { GenericSysBOService } from './generic-service.js';

export type ReferenceGroups = Record<string, Record<string, unknown>[]>;
export type ReferenceRecordReader = (entityKey: string, id: string) => Promise<SysBOEntity | null>;
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_REFERENCES = 500;

/** Single API-side reference expansion, always after the owner query has been authorized
 * and paged. No HTTP calls, recursive expansion, or foreign-entry disclosure.
 */
export async function resolveEntityReferences(
  entityKey: string,
  rows: readonly Readonly<Record<string, unknown>>[],
  subject: AuthorizationSubject,
  authorization: AuthorizationService,
  read: ReferenceRecordReader,
): Promise<ReferenceGroups> {
  const source = allSysBOMetadata[entityKey as keyof typeof allSysBOMetadata];
  if (!source) return Object.create(null);
  const ids = new Map<string, Set<string>>();
  for (const [fieldKey, field] of Object.entries(source.fieldDefinition)) {
    if (field.type !== 'reference' || field.sensitive) continue;
    const relationship = relationshipForField(source, fieldKey);
    const targetKey =
      relationship?.relationship.references.objectKey ?? field.inverseRelationship?.objectKey;
    if (!targetKey || !Object.hasOwn(allSysBOMetadata, targetKey)) continue;
    const set = ids.get(targetKey) ?? new Set<string>();
    for (const row of rows) {
      const id = row[fieldKey];
      if (typeof id === 'string' && GUID.test(id)) set.add(id.toLowerCase());
    }
    if (set.size) ids.set(targetKey, set);
  }
  const jobs = [...ids].flatMap(([key, values]) => [...values].map((id) => ({ key, id })));
  // Fail closed for unexpectedly large graphs, preserving the main List response.
  if (jobs.length > MAX_REFERENCES) return Object.create(null);
  const groups: ReferenceGroups = Object.create(null);
  for (const key of ids.keys()) groups[key] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(6, jobs.length) }, async () => {
      while (next < jobs.length) {
        const job = jobs[next++]!;
        try {
          const record = await read(job.key, job.id);
          if (!record || !(await authorization.can('read', subject, job.key, record))) continue;
          const metadata: ManatOSObjectMetadata<Record<string, unknown>> | undefined =
            allSysBOMetadata[job.key as keyof typeof allSysBOMetadata];
          if (!metadata) continue;
          const original = record as unknown as Readonly<Record<string, unknown>>;
          const projection: Record<string, unknown> = Object.create(null);
          for (const key of entryPresentationFieldKeys(metadata)) {
            if (Object.hasOwn(original, key)) projection[key] = original[key];
          }
          // The canonical resolver falls back to the first populated text field
          // when its configured name and primary identity are missing. Project
          // that one value only, rather than exposing every text attribute.
          if (
            original[metadata.primaryField] === null ||
            original[metadata.primaryField] === undefined ||
            original[metadata.primaryField] === ''
          ) {
            for (const [key] of Object.entries(metadata.fieldDefinition)
              .filter(([, field]) => field.type === 'string' && !field.sensitive)
              .sort((a, b) => a[1].order - b[1].order)) {
              const value = original[key];
              if (typeof value === 'string' && value.trim()) {
                projection[key] = value;
                break;
              }
            }
          }
          groups[job.key]!.push(projection);
        } catch {
          // An individual unavailable/failed/unauthorized reference remains Unknown.
          // Never reveal whether a missing target exists.
        }
      }
    }),
  );
  // Concurrent reads must not make CTX array order nondeterministic.
  for (const records of Object.values(groups))
    records.sort((left, right) => String(left.id ?? '').localeCompare(String(right.id ?? '')));
  return groups;
}

/** Factory closes over services, not HTTP. Caller owns the per-application registry. */
export function serviceReferenceReader(
  services: ReadonlyMap<string, GenericSysBOService<SysBOEntity>>,
): ReferenceRecordReader {
  return (key, id) => services.get(key)?.get(id) ?? Promise.resolve(null);
}
