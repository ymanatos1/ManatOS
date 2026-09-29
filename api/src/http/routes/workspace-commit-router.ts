import { Router, type Request } from 'express';
import {
  AppError,
  AuthenticationError,
  NotFoundError,
  ValidationAppError,
  allSysBOMetadata,
  type SysBOEntity,
  type SysBOPictureValue,
} from '@manatos/shared';

import { authenticatedAuditActor } from '../../audit/audit-service.js';
import { config } from '../../config.js';
import {
  logTransactionFaultInjected,
  logTransactionWorkspaceOperationCompleted,
  type TransactionPictureChange,
  type TransactionSemanticChange,
} from '../../logging/transaction-execution-log.js';
import type { AuthorizationService } from '../../auth/authorization-service.js';
import type { GenericSysBOService } from '../../services/sysbo/generic-service.js';
import type { InMemoryDataStore } from '../../storage/in-memory-data-store.js';
import { sendCommand } from '../response.js';
import { explicitTransactionMiddleware } from '../middleware/explicit-transaction.js';

type WorkspaceCommitOperation = {
  operationId: string;
  entityKey: string;
  identity: string;
  identityKind: 'persistent' | 'workspace';
  kind: 'create' | 'update' | 'delete';
  current: Record<string, unknown> | null;
  changedFields: string[];
  references?: Array<{
    key: string;
    entityKey: string;
    identity: string;
    identityKind: 'persistent' | 'workspace';
  }>;
  collections?: Record<string, { current?: unknown[] }>;
  dependsOn?: string[];
};

export type WorkspaceCommitCreateExecutor = (
  values: Record<string, unknown>,
  actor: ReturnType<typeof authenticatedAuditActor>,
) => Promise<SysBOEntity>;

export type WorkspaceCommitCollectionAdapter = (
  collections: NonNullable<WorkspaceCommitOperation['collections']>,
) => Readonly<Record<string, unknown>>;

type WorkspaceCommitResources = Record<
  string,
  { contentType: SysBOPictureValue['contentType']; bytes: Buffer }
>;

type WorkspaceCommitPlan = {
  version: 1;
  operations: WorkspaceCommitOperation[];
  executionOrder: string[];
};

const subjectFor = (req: Request) => {
  if (!req.auth) throw new AuthenticationError();
  return req.auth;
};

const assertPlan = (value: unknown): WorkspaceCommitPlan => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new ValidationAppError(
      'Workspace CommitPlan is missing.',
      'The workspace commit is invalid.',
    );
  const plan = value as Partial<WorkspaceCommitPlan>;
  if (plan.version !== 1 || !Array.isArray(plan.operations) || !Array.isArray(plan.executionOrder))
    throw new ValidationAppError(
      'Workspace CommitPlan has an unsupported shape.',
      'The workspace commit is invalid.',
    );
  const ids = new Set(plan.operations.map((operation) => String(operation?.operationId || '')));
  if (
    ids.size !== plan.operations.length ||
    ids.has('') ||
    plan.executionOrder.length !== ids.size ||
    plan.executionOrder.some((id) => !ids.has(String(id))) ||
    new Set(plan.executionOrder).size !== ids.size
  )
    throw new ValidationAppError(
      'Workspace CommitPlan execution order does not exactly cover its operations.',
      'The workspace commit is invalid.',
    );
  return plan as WorkspaceCommitPlan;
};

const pendingResourceKey = (value: unknown): string | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const descriptor = value as Record<string, unknown>;
  if (descriptor.pending !== true) return null;
  const identity = String(descriptor.revision ?? descriptor.id ?? '');
  return identity.startsWith('pending:') ? `picture:${identity}` : null;
};

const assertResources = (value: unknown): WorkspaceCommitResources => {
  if (value == null) return {};
  if (typeof value !== 'object' || Array.isArray(value))
    throw new ValidationAppError(
      'Workspace resources have an unsupported shape.',
      'The workspace commit is invalid.',
    );
  const resources = value as Record<string, unknown>;
  const result: WorkspaceCommitResources = {};
  for (const [key, raw] of Object.entries(resources)) {
    if (!key.startsWith('picture:') || !raw || typeof raw !== 'object' || Array.isArray(raw))
      throw new ValidationAppError(
        `Workspace resource '${key}' is invalid.`,
        'A pending picture could not be committed.',
      );
    const resource = raw as Record<string, unknown>;
    const contentType = String(resource.contentType ?? '');
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(contentType))
      throw new ValidationAppError(
        `Workspace resource '${key}' has unsupported picture content type '${contentType}'.`,
        'Choose a JPEG, PNG, WebP or GIF image.',
      );
    const dataBase64 = String(resource.dataBase64 ?? '');
    // Buffer.from(base64) is deliberately permissive, so validate the transport
    // representation before decoding instead of accepting truncated/garbled data.
    const compactBase64 = dataBase64.replace(/\s/g, '');
    if (
      !compactBase64 ||
      compactBase64.length % 4 !== 0 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(compactBase64)
    )
      throw new ValidationAppError(
        `Workspace resource '${key}' has an invalid base64 picture payload.`,
        'The pending picture could not be read.',
      );
    const bytes = Buffer.from(compactBase64, 'base64');
    if (!bytes.length || bytes.byteLength > 3_000_000)
      throw new ValidationAppError(
        `Workspace resource '${key}' picture payload size ${bytes.byteLength} is outside the supported range.`,
        'The prepared picture is too large to store.',
      );
    result[key] = {
      contentType: contentType as SysBOPictureValue['contentType'],
      bytes,
    };
  }
  return result;
};

const resourceBytes = (
  resources: WorkspaceCommitResources,
  descriptor: unknown,
): { contentType: SysBOPictureValue['contentType']; bytes: Buffer } => {
  const key = pendingResourceKey(descriptor);
  if (!key || !resources[key])
    throw new ValidationAppError(
      `Pending picture resource '${key ?? '<unknown>'}' is missing.`,
      'A pending picture could not be committed.',
    );
  const resource = resources[key]!;
  const semantic = descriptor as Record<string, unknown>;
  const descriptorContentType = String(semantic.contentType ?? '');
  if (descriptorContentType && descriptorContentType !== resource.contentType)
    throw new ValidationAppError(
      `Pending picture resource '${key}' content type does not match its CommitPlan descriptor.`,
      'A pending picture could not be committed safely.',
    );
  const descriptorSize = Number(semantic.size);
  if (
    Number.isFinite(descriptorSize) &&
    descriptorSize >= 0 &&
    descriptorSize !== resource.bytes.byteLength
  )
    throw new ValidationAppError(
      `Pending picture resource '${key}' size does not match its CommitPlan descriptor.`,
      'A pending picture could not be committed safely.',
    );
  return { contentType: resource.contentType, bytes: resource.bytes };
};

const safeDiagnosticValue = (value: unknown): unknown => {
  if (
    value == null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  )
    return value;
  if (Array.isArray(value)) return value.map((item) => safeDiagnosticValue(item));
  if (typeof value !== 'object') return String(value);
  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(record)
      .filter(
        ([key]) =>
          !/(dataBase64|password|secret|token|authorization|cookie|api[-_]?key)/i.test(key),
      )
      .map(([key, item]) => [key, safeDiagnosticValue(item)]),
  );
};

const pictureDiagnostic = (value: unknown): unknown => {
  if (value == null) return null;
  if (Array.isArray(value)) return value.map((item) => pictureDiagnostic(item));
  if (typeof value !== 'object') return safeDiagnosticValue(value);
  const descriptor = value as Record<string, unknown>;
  return {
    ...(descriptor.id ? { id: String(descriptor.id) } : {}),
    ...(descriptor.pending === true ? { pending: true } : {}),
    ...(descriptor.contentType ? { contentType: String(descriptor.contentType) } : {}),
    ...(Number.isFinite(Number(descriptor.size)) ? { size: Number(descriptor.size) } : {}),
  };
};

/** Execute the exact reviewed CommitPlan as one datastore transaction. */
export function createWorkspaceCommitRouter(
  store: InMemoryDataStore,
  authorization: AuthorizationService,
  services: ReadonlyMap<string, GenericSysBOService<SysBOEntity>>,
  createExecutors: ReadonlyMap<string, WorkspaceCommitCreateExecutor> = new Map(),
  collectionAdapters: ReadonlyMap<string, WorkspaceCommitCollectionAdapter> = new Map(),
) {
  const router = Router();
  router.use(explicitTransactionMiddleware(store));

  router.post('/$commit', async (req, res) => {
    const plan = assertPlan(req.body?.commitPlan);
    const resources = assertResources(req.body?.resources);
    const simulateTransactionFailure = req.body?.debug?.simulateTransactionFailure === true;
    if (simulateTransactionFailure && config.NODE_ENV === 'production')
      throw new ValidationAppError(
        'Workspace transaction fault injection is unavailable in production.',
        'The workspace commit contains an unsupported development option.',
      );
    const transactionId = req.header('x-manatos-transaction-id')?.trim() ?? '';
    if (simulateTransactionFailure && !transactionId)
      throw new ValidationAppError(
        'Workspace transaction fault injection requires an explicit transaction.',
        'The simulated transaction failure could not be started safely.',
      );
    const subject = subjectFor(req);
    const actor = authenticatedAuditActor(subject.userId, subject.userName);
    const byId = new Map(plan.operations.map((operation) => [operation.operationId, operation]));
    const originalByOperationId = new Map<string, SysBOEntity>();
    const orderPosition = new Map(
      plan.executionOrder.map((operationId, index) => [operationId, index]),
    );

    // Validate the complete plan and authorization before the first write.
    for (const operation of plan.operations) {
      const metadata = allSysBOMetadata[operation.entityKey as keyof typeof allSysBOMetadata];
      const service = services.get(operation.entityKey);
      if (!metadata || !service)
        throw new ValidationAppError(
          `CommitPlan entity '${operation.entityKey}' has no registered transactional executor.`,
          'This related record cannot be committed by this workspace.',
        );
      if (operation.kind === 'create') {
        await authorization.assertCan('create', subject, operation.entityKey);
      } else {
        const existing = await service.get(operation.identity);
        if (!existing) throw new NotFoundError(metadata.label, operation.identity);
        originalByOperationId.set(operation.operationId, existing);
        await authorization.assertCan(
          operation.kind === 'delete' ? 'delete' : 'update',
          subject,
          operation.entityKey,
          existing,
        );
      }
      for (const dependency of operation.dependsOn ?? []) {
        if (!byId.has(dependency))
          throw new ValidationAppError(
            `CommitPlan operation '${operation.operationId}' has unknown dependency '${dependency}'.`,
            'The workspace commit dependency graph is invalid.',
          );
        if (
          (orderPosition.get(dependency) ?? -1) >= (orderPosition.get(operation.operationId) ?? -1)
        )
          throw new ValidationAppError(
            `CommitPlan operation '${operation.operationId}' executes before dependency '${dependency}'.`,
            'The workspace commit dependency graph is invalid.',
          );
      }

      // Resolve every pending binary reference before the first write. This makes a
      // malformed/incomplete Commit package fail without touching persisted state.
      if (operation.kind !== 'delete') {
        const source = operation.current ?? {};
        const selectedKeys =
          operation.kind === 'update' ? operation.changedFields : Object.keys(source);
        for (const key of selectedKeys) {
          const field = metadata.fieldDefinition[key];
          if (!field) continue;
          if (field.type === 'picture' && pendingResourceKey(source[key]))
            resourceBytes(resources, source[key]);
          if (field.type === 'pictures') {
            const pictures = Array.isArray(source[key]) ? (source[key] as unknown[]) : [];
            for (const picture of pictures)
              if (pendingResourceKey(picture)) resourceBytes(resources, picture);
          }
        }
      }
    }

    const idMap: Record<string, string> = {};
    const results: Record<string, Record<string, unknown>> = {};
    await store.executeTransaction(async () => {
      for (const operationId of plan.executionOrder) {
        const operation = byId.get(operationId)!;
        const service = services.get(operation.entityKey)!;
        const operationStartedAt = performance.now();
        const original = originalByOperationId.get(operation.operationId);
        if (operation.kind === 'delete') {
          await service.delete(operation.identity, actor);
          if (transactionId) {
            logTransactionWorkspaceOperationCompleted(transactionId, {
              operationId: operation.operationId,
              kind: operation.kind,
              entityKey: operation.entityKey,
              entityLabel: service.metadata.label,
              identity: operation.identity,
              description: String(
                (original as unknown as Record<string, unknown> | undefined)?.[
                  service.metadata.primaryField
                ] ?? operation.identity,
              ),
              durationMs: Math.round((performance.now() - operationStartedAt) * 100) / 100,
              changes: [],
              pictures: [],
              collections: [],
            });
          }
          continue;
        }

        const source = operation.current ?? {};
        const values: Record<string, unknown> = {};
        const selectedKeys =
          operation.kind === 'update' ? operation.changedFields : Object.keys(source);
        for (const key of selectedKeys) {
          const field = service.metadata.fieldDefinition[key];
          if (key === 'id' || !field || field.type === 'picture' || field.type === 'pictures')
            continue;
          values[key] = source[key];
        }
        const collections = operation.collections ?? {};
        const collectionAdapter = collectionAdapters.get(operation.entityKey);
        if (Object.keys(collections).length && !collectionAdapter) {
          throw new ValidationAppError(
            `CommitPlan entity '${operation.entityKey}' has related collections but no registered collection adapter.`,
            'These related changes cannot be committed safely.',
          );
        }
        if (collectionAdapter) Object.assign(values, collectionAdapter(collections));
        // Resolve every reviewed workspace reference only after its provider was created.
        for (const reference of operation.references ?? []) {
          if (reference.identityKind !== 'workspace') continue;
          const resolved = idMap[`${reference.entityKey}:${reference.identity}`];
          if (!resolved)
            throw new ValidationAppError(
              `CommitPlan reference '${reference.key}' was not resolved before '${operation.operationId}'.`,
              'A related record could not be linked during Commit.',
            );
          values[reference.key] = resolved;
        }
        // Root hierarchy references predate explicit reference descriptors. Resolve exact
        // workspace identities from already-created providers without field-name heuristics.
        for (const [key, value] of Object.entries(values)) {
          if (typeof value !== 'string') continue;
          const resolved = idMap[`${operation.entityKey}:${value}`];
          if (resolved) values[key] = resolved;
        }

        let persistedId: string;
        let persisted: SysBOEntity;
        if (operation.kind === 'create') {
          const createExecutor = createExecutors.get(operation.entityKey);
          persisted = createExecutor
            ? await createExecutor(values, actor)
            : await service.create(values as never, actor);
          persistedId = persisted.id;
          idMap[`${operation.entityKey}:${operation.identity}`] = persistedId;
        } else {
          persistedId = operation.identity;
          persisted = await service.update(operation.identity, values as never, actor);
        }

        // Binary fields use the same transactional service primitives as ordinary
        // Entry Save. Semantic descriptors remain in CommitPlan; bytes come only
        // from the Organization UiLevel's private resource package.
        for (const key of selectedKeys) {
          const field = service.metadata.fieldDefinition[key];
          if (!field) continue;
          if (field.type === 'picture') {
            const descriptor = source[key];
            if (descriptor == null) persisted = await service.clearPicture(persistedId, key, actor);
            else if (pendingResourceKey(descriptor)) {
              const resource = resourceBytes(resources, descriptor);
              persisted = await service.writePicture(
                persistedId,
                key,
                resource.contentType,
                resource.bytes,
                actor,
              );
            }
          } else if (field.type === 'pictures') {
            const descriptors = Array.isArray(source[key]) ? (source[key] as unknown[]) : [];
            const replacement = descriptors.map((descriptor) => {
              const pendingKey = pendingResourceKey(descriptor);
              if (pendingKey) {
                const resource = resourceBytes(resources, descriptor);
                return { contentType: resource.contentType, bytes: resource.bytes };
              }
              const id =
                descriptor && typeof descriptor === 'object' && !Array.isArray(descriptor)
                  ? String((descriptor as Record<string, unknown>).id ?? '')
                  : '';
              if (!id)
                throw new ValidationAppError(
                  `Picture descriptor in '${key}' has no identity.`,
                  'A picture collection could not be committed.',
                );
              return { id };
            });
            persisted = await service.replacePictureItems(persistedId, key, replacement, actor);
          }
        }
        results[operation.operationId] = persisted as unknown as Record<string, unknown>;
        if (transactionId) {
          const changes: TransactionSemanticChange[] = [];
          const pictures: TransactionPictureChange[] = [];
          for (const key of selectedKeys) {
            const field = service.metadata.fieldDefinition[key];
            if (!field || field.sensitive) continue;
            const before = (original as unknown as Record<string, unknown> | undefined)?.[key];
            const after = source[key];
            if (field.type === 'picture') {
              pictures.push({
                field: key,
                label: field.label,
                action: after == null ? 'clear' : before == null ? 'add' : 'replace',
                before: pictureDiagnostic(before),
                after: pictureDiagnostic(after),
              });
            } else if (field.type === 'pictures') {
              pictures.push({
                field: key,
                label: field.label,
                action: 'replace-collection',
                before: pictureDiagnostic(before),
                after: pictureDiagnostic(after),
              });
            } else {
              changes.push({
                field: key,
                label: field.label,
                before: safeDiagnosticValue(before),
                after: safeDiagnosticValue(after),
              });
            }
          }
          logTransactionWorkspaceOperationCompleted(transactionId, {
            operationId: operation.operationId,
            kind: operation.kind,
            entityKey: operation.entityKey,
            entityLabel: service.metadata.label,
            identity: persistedId,
            description: String(
              (persisted as unknown as Record<string, unknown>)[service.metadata.primaryField] ??
                persistedId,
            ),
            durationMs: Math.round((performance.now() - operationStartedAt) * 100) / 100,
            changes,
            pictures,
            collections: Object.entries(operation.collections ?? {}).map(([key, value]) => ({
              key,
              itemCount: Array.isArray(value.current) ? value.current.length : 0,
            })),
          });
        }
      }
    });

    if (simulateTransactionFailure) {
      // Deliberately fail only after every reviewed workspace mutation and the
      // datastore persistence step have succeeded. The explicit transaction has
      // therefore accumulated its real rollback journal, and the normal UI-server
      // failure path must request rollback exactly as it would for a real failure.
      logTransactionFaultInjected(transactionId, 'after-workspace-storage-mutations');
      throw new AppError(
        'DEBUG_TRANSACTION_FAILURE',
        'Development fault injected after workspace storage mutations and before transaction Commit.',
        'A development transaction failure was intentionally injected. The transaction will be rolled back.',
        true,
      );
    }

    sendCommand(res, 'Workspace committed successfully.', { idMap, results });
  });

  return router;
}
