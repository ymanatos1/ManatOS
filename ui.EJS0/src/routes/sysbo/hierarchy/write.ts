import type { Request } from 'express';

import { AppError, type OperationNodeSnapshot } from '@manatos/shared';

import { apiClient } from '../../../api/client.js';
import { config } from '../../../config.js';
import { apiSessionOptions } from '../../../auth/api-session.js';
import { metadataHierarchyWorkspaceDescriptor } from '../../../presentation/metadata/hierarchy-workspace.js';
import type { SysBODefinition } from '../../../sysbo/types.js';
import { canonicalSysBOMetadata, canonicalSysBOUIMetadata } from '../shared/data-access.js';

interface TransactionFailure {
  description: string;
  message: string;
}

function appendRollbackDiagnostics(
  error: AppError,
  transactionId: string,
  failures: TransactionFailure[],
  rollbackRequestError?: unknown,
): void {
  if (!failures.length && !rollbackRequestError) return;
  const now = new Date().toISOString();
  const children: OperationNodeSnapshot[] = failures.map((failure, index) => ({
    id: `${transactionId}:rollback:${index}`,
    description: failure.description,
    userDescription: 'Rollback compensation failed',
    status: 'failed',
    startedAt: now,
    completedAt: now,
    comments: [],
    children: [],
    errorCode: 'TRANSACTION_ROLLBACK_FAILURE',
    errorMessage: failure.message,
  }));
  if (rollbackRequestError) {
    const rollbackError = rollbackRequestError instanceof AppError ? rollbackRequestError : null;
    children.push({
      id: `${transactionId}:rollback:request`,
      description: 'Rollback Organization Commit transaction',
      userDescription: 'Rollback could not be completed',
      status: 'failed',
      startedAt: now,
      completedAt: now,
      comments: [],
      children: rollbackError?.operationTrace ?? [],
      errorCode: rollbackError?.code ?? 'TRANSACTION_ROLLBACK_FAILURE',
      errorMessage: rollbackError?.message ?? String(rollbackRequestError),
    });
  }
  error.operationTrace = [
    ...(error.operationTrace ?? []),
    {
      id: `${transactionId}:rollback`,
      description: 'Rollback Organization Commit transaction',
      userDescription: 'Rollback encountered problems; storage may require maintenance',
      status: 'failed',
      startedAt: now,
      completedAt: now,
      comments: [],
      children,
      errorCode: 'TRANSACTION_ROLLBACK_INCOMPLETE',
      errorMessage: 'One or more rollback operations failed.',
    },
  ];
}

async function finalizeTransaction<T>(
  req: Request,
  transactionId: string,
  phase: 'commit' | 'rollback',
): Promise<T> {
  const path = `/api/v1/transactions/${encodeURIComponent(transactionId)}/$${phase}`;
  let firstError: unknown;
  try {
    return (await apiClient.post<T>(path, undefined, apiSessionOptions(req))).data;
  } catch (error) {
    firstError = error;
  }
  try {
    return (await apiClient.post<T>(path, undefined, apiSessionOptions(req))).data;
  } catch (retryError) {
    if (phase === 'commit') {
      const uncertain = new AppError(
        'TRANSACTION_COMMIT_UNCERTAIN',
        `Organization Commit transaction '${transactionId}' commit could not be confirmed after retry.`,
        'The Organization reached its final commit stage, but the server could not confirm the result. Refresh before making further changes.',
        false,
        { cause: retryError ?? firstError },
      );
      const diagnostic =
        retryError instanceof AppError
          ? retryError
          : firstError instanceof AppError
            ? firstError
            : null;
      if (diagnostic?.operationTrace?.length)
        uncertain.operationTrace = [...diagnostic.operationTrace];
      throw uncertain;
    }
    throw retryError;
  }
}

/**
 * Persist one metadata-driven hierarchy aggregate through one explicit API
 * transaction. CommitPlan is semantic; pending binary bytes travel separately.
 */
export async function commitMetadataDrivenHierarchy(
  req: Request,
  definition: SysBODefinition,
): Promise<{
  items: Record<string, unknown>[];
  idMap: Record<string, string>;
  rootId: string;
}> {
  const commitPlan = req.body?.commitPlan;
  const resources = req.body?.resources ?? {};
  const simulateTransactionFailure =
    config.NODE_ENV !== 'production' && req.body?.debug?.simulateTransactionFailure === true;
  if (!commitPlan || commitPlan.version !== 1 || !Array.isArray(commitPlan.operations)) {
    throw new Error('Organization Commit requires an immutable CommitPlan.');
  }
  if (String(commitPlan.rootEntityKey || '') !== definition.key) {
    throw new Error('CommitPlan root entity does not match the requested hierarchy.');
  }
  const identityField = String(commitPlan.identityField || 'id');
  const snapshot = commitPlan.rootSnapshot;
  if (!snapshot || !Array.isArray(snapshot.entries) || !Array.isArray(snapshot.entriesOriginal)) {
    throw new Error('CommitPlan is missing its immutable root aggregate snapshot.');
  }

  const started = await apiClient.post<{ transactionId: string }>(
    '/api/v1/transactions',
    undefined,
    apiSessionOptions(req),
  );
  const transactionId = started.data.transactionId;
  let committed: { data: { idMap?: Record<string, string> } };

  try {
    committed = await apiClient.post<{ idMap?: Record<string, string> }>(
      '/api/v1/workspace/$commit',
      {
        commitPlan,
        resources,
        debug: simulateTransactionFailure ? { simulateTransactionFailure: true } : undefined,
      },
      { ...apiSessionOptions(req), transactionId },
    );
  } catch (error) {
    let rollbackFailures: TransactionFailure[] = [];
    let rollbackRequestError: unknown;
    try {
      const rolledBack = await finalizeTransaction<{
        transactionId: string;
        rollbackFailures: TransactionFailure[];
      }>(req, transactionId, 'rollback');
      rollbackFailures = rolledBack.rollbackFailures ?? [];
    } catch (rollbackError) {
      rollbackRequestError = rollbackError;
    }
    const finalError =
      error instanceof AppError
        ? error
        : new AppError(
            'UNEXPECTED_ERROR',
            error instanceof Error ? error.message : String(error),
            'The Organization could not be committed.',
            true,
            { cause: error },
          );
    appendRollbackDiagnostics(finalError, transactionId, rollbackFailures, rollbackRequestError);
    throw finalError;
  }

  // Never issue a compensating rollback after an ambiguous COMMIT response.
  await finalizeTransaction<{ transactionId: string; cleanupFailures: TransactionFailure[] }>(
    req,
    transactionId,
    'commit',
  );

  const idMap = committed.data.idMap ?? {};
  const resolveRootIdentity = (value: unknown) => {
    const identity = String(value ?? '');
    return idMap[`${definition.key}:${identity}`] ?? identity;
  };
  const rootRows = snapshot.entries.map((row: Record<string, unknown>) => ({
    ...row,
    [identityField]: resolveRootIdentity(row[identityField]),
  }));
  const [metadata, metadataUI] = await Promise.all([
    canonicalSysBOMetadata(req, definition),
    canonicalSysBOUIMetadata(req, definition),
  ]);
  const descriptor = metadataHierarchyWorkspaceDescriptor(metadata, metadataUI);
  const root = descriptor
    ? rootRows.find(
        (row: Record<string, unknown>) =>
          row[descriptor.parentField] == null || String(row[descriptor.parentField] ?? '') === '',
      )
    : null;
  return {
    items: rootRows,
    idMap: Object.fromEntries(
      Object.entries(idMap)
        .filter(([key]) => key.startsWith(`${definition.key}:`))
        .map(([key, value]) => [key.slice(key.indexOf(':') + 1), value]),
    ),
    rootId: root && descriptor ? String(root[descriptor.idField] ?? '') : '',
  };
}
