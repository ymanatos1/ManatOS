import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

import {
  ContextTreeRuntime,
  MANATOS_COMPANY,
  appendContextPathMember,
  contextPointer,
  createCompanyContext,
  createEntitiesContext,
  createSystemContext,
  entityContextName,
  resolvePlatform,
  type ManatOSCompanyContext,
  type ManatOSEntitiesContext,
  type ManatOSSystemContext,
  type ManatOSUserContext,
  type SysBOUserRole,
} from '@manatos/shared';

export interface ApiContextControl {
  readonly host: 'api';
  readonly kind: 'request' | 'operation';
  readonly id: string;
  readonly name: string;
  readonly method?: string;
  readonly path?: string;
}

export interface ApiContextLevel {
  control: ApiContextControl;
  /** Present on request levels; nested levels resolve it lexically from the request owner. */
  user?: ManatOSUserContext | null;
  data?: Record<string, unknown>;
  resources?: Record<string, unknown>;
  state?: Record<string, unknown>;
  [key: `level-${string}`]: unknown;
}

export interface ApiRootContext {
  system: ManatOSSystemContext;
  entities: ManatOSEntitiesContext;
  company: ManatOSCompanyContext;
  api: Record<string, ApiContextLevel>;
}

interface ExecutionScope {
  readonly callId: string;
  readonly callPath: string;
  readonly levelPath: string;
  readonly diagnosticGroup?: string;
  readonly diagnosticLevelIds: readonly string[];
}

export interface ApiRequestContextInfo {
  readonly method: string;
  readonly path: string;
}

export interface ApiUserSubject {
  readonly userId: string;
  readonly userName: string;
  readonly role: SysBOUserRole;
}

export interface ApiNestedLevelDefinition {
  readonly name: string;
  readonly data?: Record<string, unknown>;
  readonly resources?: Record<string, unknown>;
  readonly state?: Record<string, unknown>;
  /** Start a diagnostic subtree whose descendants inherit the same group. */
  readonly diagnosticGroup?: string;
}

export interface ApiRequestSnapshot {
  readonly callId: string;
  readonly callPath: string;
  readonly levelPath: string;
  readonly context: ApiContextLevel;
}

export interface ApiLevelSnapshot extends ApiRequestSnapshot {
  readonly diagnosticGroup?: string;
  readonly diagnosticLevelIds: readonly string[];
}

export interface ApiContextSnapshotCapture {
  captureRequest(snapshot: ApiRequestSnapshot): void;
  captureLevel(snapshot: ApiLevelSnapshot): void;
}

/**
 * API host for the shared CTX tree framework.
 *
 * The API owns one process-lifetime root. Every HTTP call contributes one
 * parallel `ctx.api.level-<call-id>` branch and owns its user context there.
 * Nested subsystem operations add child levels beneath the currently active
 * level. AsyncLocalStorage stores only the active level pointer; semantic state
 * remains in the one CTX tree.
 */
export class ApiContextRuntime {
  private readonly execution = new AsyncLocalStorage<ExecutionScope>();
  private readonly treeRuntime: ContextTreeRuntime<ApiRootContext>;
  private snapshotCapture: ApiContextSnapshotCapture | null;

  constructor(
    root: ApiRootContext = createApiRootContext(),
    snapshotCapture: ApiContextSnapshotCapture | null = null,
  ) {
    this.treeRuntime = new ContextTreeRuntime(root);
    this.snapshotCapture = snapshotCapture;
  }

  setSnapshotCapture(snapshotCapture: ApiContextSnapshotCapture | null): void {
    this.snapshotCapture = snapshotCapture;
  }

  tree(): ApiRootContext {
    return this.treeRuntime.root();
  }

  currentPath(): string | null {
    return this.execution.getStore()?.levelPath ?? null;
  }

  currentLevel(): ApiContextLevel | null {
    const path = this.currentPath();
    return path ? ((this.treeRuntime.get(path) as ApiContextLevel | undefined) ?? null) : null;
  }

  /**
   * Establish one request branch and the async execution pointer that owns it.
   * The branch remains alive until endRequest() is called by the HTTP lifecycle.
   */
  runRequest<T>(callId: string, info: ApiRequestContextInfo, fn: () => T): T {
    const key = apiLevelKey(callId);
    const callPath = this.treeRuntime.add('ctx.api', key, {
      control: {
        host: 'api',
        kind: 'request',
        id: callId,
        name: `${info.method} ${info.path}`,
        method: info.method,
        path: info.path,
      },
      user: null,
    } satisfies ApiContextLevel);

    return this.execution.run(
      { callId, callPath, levelPath: callPath, diagnosticLevelIds: [] },
      fn,
    );
  }

  /** Dispose exactly one completed API-call subtree. Safe to call more than once. */
  endRequest(callId: string): void {
    const key = apiLevelKey(callId);
    if (!Object.prototype.hasOwnProperty.call(this.treeRuntime.root().api, key)) return;
    const callPath = appendContextPathMember('ctx.api', key);
    const context = this.treeRuntime.get(callPath) as ApiContextLevel | undefined;
    if (context) {
      this.captureSafely(() =>
        this.snapshotCapture?.captureRequest({
          callId,
          callPath,
          levelPath: callPath,
          context: structuredClone(context),
        }),
      );
    }
    this.treeRuntime.delete(callPath);
  }

  /** Populate the authenticated user owned by the current request level. */
  setUser(subject: ApiUserSubject | null): void {
    const scope = this.execution.getStore();
    if (!scope) throw new Error('API CTX user requires an active API request level.');
    this.treeRuntime.set(`${scope.callPath}.user`, subject ? apiUserContext(subject) : null);
  }

  /**
   * Run one nested subsystem level under the currently active API level.
   * Parallel siblings receive independent keys and AsyncLocalStorage pointers.
   */
  async runLevel<T>(
    definition: ApiNestedLevelDefinition,
    fn: (level: ApiContextLevel) => Promise<T> | T,
  ): Promise<T> {
    const parent = this.execution.getStore();
    if (!parent) throw new Error('Nested API CTX level requires an active API request.');

    const id = randomUUID();
    const key = apiLevelKey(id);
    const level: ApiContextLevel = {
      control: { host: 'api', kind: 'operation', id, name: definition.name },
      ...(definition.data ? { data: definition.data } : {}),
      ...(definition.resources ? { resources: definition.resources } : {}),
      ...(definition.state ? { state: definition.state } : {}),
    };
    const levelPath = this.treeRuntime.add(parent.levelPath, key, level);
    const diagnosticGroup = definition.diagnosticGroup ?? parent.diagnosticGroup;
    const startsDiagnosticGroup =
      Boolean(definition.diagnosticGroup) && definition.diagnosticGroup !== parent.diagnosticGroup;
    const diagnosticLevelIds = diagnosticGroup
      ? startsDiagnosticGroup
        ? [id]
        : [...parent.diagnosticLevelIds, id]
      : [];

    try {
      return await this.execution.run(
        {
          callId: parent.callId,
          callPath: parent.callPath,
          levelPath,
          ...(diagnosticGroup ? { diagnosticGroup } : {}),
          diagnosticLevelIds,
        },
        () => fn(level),
      );
    } finally {
      const context = this.treeRuntime.get(levelPath) as ApiContextLevel | undefined;
      if (context) {
        this.captureSafely(() =>
          this.snapshotCapture?.captureLevel({
            callId: parent.callId,
            callPath: parent.callPath,
            levelPath,
            context: structuredClone(context),
            ...(diagnosticGroup ? { diagnosticGroup } : {}),
            diagnosticLevelIds,
          }),
        );
        this.treeRuntime.delete(levelPath);
      }
    }
  }

  private captureSafely(capture: () => void): void {
    try {
      capture();
    } catch {
      // Diagnostics must never change API behavior or CTX cleanup semantics.
    }
  }
}

export function createApiRootContext(): ApiRootContext {
  const currentPlatform = resolvePlatform(MANATOS_COMPANY);
  return {
    system: createSystemContext({
      scope: 'sys',
      runtimeMode: process.env.NODE_ENV ?? 'development',
      apiBaseUrl: `/api`,
      clientKind: 'api',
      clientVersion: '0.1.0',
    }),
    entities: createEntitiesContext(),
    company: createCompanyContext(MANATOS_COMPANY, currentPlatform),
    api: {},
  };
}

function apiLevelKey(id: string): `level-${string}` {
  return `level-${id}`;
}

function apiUserContext(subject: ApiUserSubject): ManatOSUserContext {
  return {
    scope: 'sys',
    entityName: entityContextName('sys-users'),
    mode: contextPointer('view'),
    fields: {
      id: { value: subject.userId },
      name: { value: subject.userName },
      role: { value: subject.role },
    },
    permissions: {
      userRole: subject.role,
      platforms: {},
    },
  };
}

export const apiContextRuntime = new ApiContextRuntime();
