import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ContextTreeRuntime,
  type ApiDiagnosticsResponseEnvelope,
  type ApiRequestDiagnostics,
} from '@manatos/shared';

import {
  ApiTrafficHistory,
  apiTrafficHistory,
  createUiBrowserSurfaceResourcePort,
  BrowserApiTransport,
  DEFAULT_API_TRAFFIC_HISTORY_CAPACITY,
  ctxCliRootPath,
  formatCtxPath,
  nearestExistingCtxPath,
  projectCtxNodeProperties,
  searchCtx,
  visitCtxTree,
} from '../src/index.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('debugger runtime infrastructure', () => {
  it('keeps CTX children separate from semantic node properties', () => {
    const runtime = new ContextTreeRuntime({ company: { name: 'ManatOS' }, system: {} });
    const rootProjection = projectCtxNodeProperties(runtime, 'ctx');

    expect(rootProjection.main.map((row) => row.name)).toEqual([
      'Kind',
      'Type',
      'Watchable',
      'JavaScript type',
      'Value',
      'Children',
    ]);
    expect(rootProjection.main.find((row) => row.name === 'Value')?.value).toBe('');
    expect(rootProjection.properties).toEqual([]);

    const leaf = projectCtxNodeProperties(runtime, 'ctx.company.name');
    expect(leaf.main.find((row) => row.name === 'Value')?.value).toBe('ManatOS');
  });

  it('formats modern CTX aliases without changing canonical paths', () => {
    expect(formatCtxPath('ctx')).toBe('$');
    expect(formatCtxPath('ctx.runtime.entities.sysUsers')).toBe('$entities.sysUsers');
    expect(formatCtxPath('ctx.entities.sysUsers')).toBe('$entities.sysUsers');
    expect(formatCtxPath('ctx.company.platforms[0]')).toBe('$company.platforms[0]');
  });

  it('recovers stale debugger paths to the nearest existing ancestor', () => {
    const runtime = new ContextTreeRuntime({
      runtime: { entities: { sysUsers: { metadata: { key: 'sysUsers' } } } },
    });

    expect(nearestExistingCtxPath(runtime, 'ctx.runtime.entities.sysUsers.metadata.key')).toBe(
      'ctx.runtime.entities.sysUsers.metadata.key',
    );
    runtime.delete('ctx.runtime.entities.sysUsers.metadata');
    expect(nearestExistingCtxPath(runtime, 'ctx.runtime.entities.sysUsers.metadata.key')).toBe(
      'ctx.runtime.entities.sysUsers',
    );
  });

  it('starts CLI execution at a selected container or the parent of a selected scalar', () => {
    const runtime = new ContextTreeRuntime({
      company: { nested: { value: 42 } },
      system: {},
    });

    expect(ctxCliRootPath(runtime, 'ctx.company.nested')).toBe('ctx.company.nested');
    expect(ctxCliRootPath(runtime, 'ctx.company.nested.value')).toBe('ctx.company.nested');
    expect(ctxCliRootPath(runtime, 'ctx.company.missing')).toBe('ctx.company');
  });

  it('projects only genuine modern semantic properties and subscriber classifications', () => {
    const entities = { sysUsers: { fields: { id: { value: '1' } } } };
    const enums = {};
    const runtime = new ContextTreeRuntime({
      company: {},
      system: {},
      runtime: { subsystems: {}, entities, enums, user: null },
    });

    runtime.subscribe(() => undefined, { label: 'direct', path: 'ctx.entities', recursive: false });
    runtime.subscribe(() => undefined, { label: 'dependent', path: 'ctx', recursive: true });
    runtime.subscribe(() => undefined, { label: 'global' });

    const projection = projectCtxNodeProperties(runtime, 'ctx.entities');
    expect(projection.properties).toContainEqual({
      name: 'Canonical path',
      value: '$entities',
      path: 'ctx.runtime.entities',
    });
    expect(projection.attributes).toEqual([{ name: 'Compatibility alias', value: 'yes' }]);
    expect(projection.attributes.map((row) => row.name)).not.toContain('Frozen');
    expect(
      projection.subscriberRegistrations.map(({ label, match }) => ({ label, match })),
    ).toEqual([
      { label: 'direct', match: 'direct' },
      { label: 'dependent', match: 'dependent' },
      { label: 'global', match: 'global' },
    ]);
  });

  it('traverses shared CTX references by path while stopping genuine ancestry cycles', () => {
    const shared = { nested: { needle: 'found' } };
    const circular: Record<string, unknown> = { marker: 'cycle' };
    circular.self = circular;
    const runtime = new ContextTreeRuntime({
      runtime: { subsystems: {}, entities: {}, enums: shared, user: null },
      circular,
    });

    const paths: string[] = [];
    visitCtxTree(runtime, 'ctx', (node) => {
      paths.push(node.path);
    });

    expect(paths).toContain('ctx.runtime.enums.nested.needle');
    expect(paths).not.toContain('ctx.enums.nested.needle');
    expect(paths).toContain('ctx.circular.self');
    expect(paths).not.toContain('ctx.circular.self.self');
    expect(
      searchCtx(runtime, 'ctx', 'found', { mode: 'value' }).map((result) => result.path),
    ).toEqual(['ctx.runtime.enums.nested.needle']);
  });

  it('keeps a bounded sanitized canonical API traffic history', () => {
    expect(DEFAULT_API_TRAFFIC_HISTORY_CAPACITY).toBe(500);
    const history = new ApiTrafficHistory(2);

    const first = history.begin({
      requestId: 'r1',
      method: 'POST',
      path: '/one',
      requestHeaders: { authorization: 'Bearer secret', 'x-test': 'visible' },
      requestBody: { password: 'secret', name: 'visible' },
    });
    history.complete(first, {
      status: 200,
      ok: true,
      responseHeaders: { 'set-cookie': 'secret', 'x-response': 'visible' },
      responseBody: { accessToken: 'secret', value: 1 },
    });
    history.begin({ requestId: 'r2', method: 'GET', path: '/two' });
    history.begin({ requestId: 'r3', method: 'GET', path: '/three' });

    expect(history.entries().map((entry) => entry.requestId)).toEqual(['r2', 'r3']);

    history.clear();
    const sanitizedId = history.begin({
      requestId: 'r4',
      method: 'POST',
      path: '/sanitized',
      requestHeaders: { authorization: 'Bearer secret', 'x-test': 'visible' },
      requestBody: { password: 'secret', name: 'visible' },
    });
    history.complete(sanitizedId, {
      status: 200,
      ok: true,
      responseHeaders: { 'set-cookie': 'secret', 'x-response': 'visible' },
      responseBody: { accessToken: 'secret', value: 1 },
    });

    const entry = history.get(sanitizedId)!;
    expect(entry.requestHeaders.authorization).toBe('[REDACTED]');
    expect(entry.requestHeaders['x-test']).toBe('visible');
    expect(entry.requestBody).toEqual({ password: '[REDACTED]', name: 'visible' });
    expect(entry.responseHeaders['set-cookie']).toBe('[REDACTED]');
    expect(entry.responseBody).toEqual({ accessToken: '[REDACTED]', value: 1 });
  });

  it('keeps immutable API traffic snapshots stable while live history advances', () => {
    const history = new ApiTrafficHistory(2);
    const first = history.begin({ requestId: 'r1', method: 'GET', path: '/one' });
    const paused = history.snapshot();

    history.complete(first, { status: 200, ok: true, responseBody: { value: 1 } });
    history.begin({ requestId: 'r2', method: 'GET', path: '/two' });
    history.begin({ requestId: 'r3', method: 'GET', path: '/three' });

    expect(Object.isFrozen(paused.entries)).toBe(true);
    expect(paused.entries.map((entry) => [entry.requestId, entry.state])).toEqual([
      ['r1', 'pending'],
    ]);
    expect(history.entries().map((entry) => entry.requestId)).toEqual(['r2', 'r3']);
    expect(history.snapshot().revision).toBeGreaterThan(paused.revision);
  });

  it('uses the canonical diagnostics default while recording the complete exchange', async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const requestHeaders = new Headers(init?.headers);
      const diagnostics: ApiRequestDiagnostics = {
        requestId: requestHeaders.get('x-request-id') ?? 'server-id',
        capturedAt: '2026-10-08T00:00:00.000Z',
        apiContext: null,
        storageContexts: [],
        logs: [],
      };
      const envelope: ApiDiagnosticsResponseEnvelope = {
        $manatosDiagnostics: diagnostics,
        response: { success: true, data: { value: 7 } },
      };
      return new Response(JSON.stringify(envelope), {
        status: 200,
        headers: { 'content-type': 'application/json', 'x-response': 'yes' },
      });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const history = new ApiTrafficHistory(5);
    const transport = new BrowserApiTransport({ trafficHistory: history });
    const result = await transport.request({
      method: 'POST',
      path: '/api/v1/test',
      headers: { authorization: 'Bearer secret' },
      body: { password: 'secret', value: 7 },
    });

    expect(result.body).toEqual({ success: true, data: { value: 7 } });
    const sent = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(sent.get('x-manatos-diagnostics')).toBe('true');
    expect(sent.get('x-request-id')).toBeTruthy();

    const entry = history.entries()[0]!;
    expect(entry.state).toBe('completed');
    expect(entry.requestHeaders.authorization).toBe('[REDACTED]');
    expect(entry.requestBody).toEqual({ password: '[REDACTED]', value: 7 });
    expect(entry.responseHeaders['x-response']).toBe('yes');
    expect(entry.responseBody).toEqual({ success: true, data: { value: 7 } });
    expect(entry.diagnostics?.requestId).toBe(sent.get('x-request-id'));
  });

  it('records correlated browser and authenticated upstream Surface resource traffic', async () => {
    apiTrafficHistory.clear();
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toContain('/_manatos/auth/resources/list/sys-principals');
      expect(init?.credentials).toBe('same-origin');
      return new Response(JSON.stringify({ success: true, data: { items: [], paging: {} } }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'x-manatos-surface-upstream': JSON.stringify([
            { method: 'GET', path: '/api/v1/SysPrincipals?page=1', status: 200, durationMs: 13 },
          ]),
        },
      });
    });
    const port = createUiBrowserSurfaceResourcePort(fetcher as typeof fetch);
    await port.request({ kind: 'sysbo.list', entityKey: 'sys-principals', query: { page: '1' } });
    const entries = apiTrafficHistory.entries();
    expect(entries).toHaveLength(2);
    expect(entries[1]?.path).toContain('/api/v1/SysPrincipals?page=1');
    expect(entries[1]?.durationMs).toBe(13);
    expect(entries[0]?.requestId).toBe(entries[1]?.requestId);
    expect(entries[0]?.path).toContain('/_manatos/auth/resources/list/sys-principals');
    expect(entries[0]?.responseHeaders['x-manatos-surface-upstream']).toBe('[REDACTED]');
    expect(entries[1]?.status).toBe(200);
    const options = fetcher.mock.calls[0]?.[1];
    expect(options?.credentials).toBe('same-origin');
    apiTrafficHistory.clear();
  });

  it('captures a failed Surface fetch without leaving pending traffic', async () => {
    apiTrafficHistory.clear();
    const port = createUiBrowserSurfaceResourcePort(async () => {
      throw new Error('Offline');
    });
    await expect(
      port.request({ kind: 'sysbo.entry', entityKey: 'sys-principals', recordId: 'id' }),
    ).rejects.toThrow('Offline');
    expect(apiTrafficHistory.entries()[0]?.state).toBe('failed');
    apiTrafficHistory.clear();
  });

  it('distinguishes an absent response body from a legitimate JSON null body', async () => {
    let call = 0;
    const fetchMock = vi.fn(async () => {
      call += 1;
      return call === 1
        ? new Response('', { status: 200 })
        : new Response('null', {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const history = new ApiTrafficHistory(5);
    const transport = new BrowserApiTransport({ trafficHistory: history, diagnosticsMode: false });

    const absent = await transport.request({ method: 'GET', path: '/api/v1/no-body' });
    expect(absent.body).toBeUndefined();
    expect(Object.hasOwn(history.entries()[0]!, 'responseBody')).toBe(false);

    const jsonNull = await transport.request({ method: 'GET', path: '/api/v1/null-body' });
    expect(jsonNull.body).toBeNull();
    expect(Object.hasOwn(history.entries()[1]!, 'responseBody')).toBe(true);
    expect(history.entries()[1]?.responseBody).toBeNull();
  });
});
