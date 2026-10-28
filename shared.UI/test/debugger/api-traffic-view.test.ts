import { describe, expect, it } from 'vitest';

import {
  ApiTrafficHistory,
  apiTrafficRouteKey,
  clearApiTrafficView,
  correlatedUiResourceResponse,
  apiTrafficResponseBody,
  findApiTrafficEntry,
  projectApiTrafficEntries,
  projectApiTrafficRoutes,
  projectApiTrafficTransactionEntries,
  toggleApiTrafficPause,
} from '../../src/index.js';

describe('API traffic view projections', () => {
  it('keeps filtering, route projection and newest-first presentation framework-neutral', () => {
    const history = new ApiTrafficHistory(10);
    history.begin({ requestId: 'r1', method: 'GET', path: '/api/v1/users/1?x=1' });
    history.begin({ requestId: 'r2', method: 'GET', path: '/api/v1/users/2' });
    const failed = history.begin({ requestId: 'r3', method: 'POST', path: '/api/v1/jobs' });
    history.fail(failed, new Error('failed'));

    const entries = history.entries();
    expect(projectApiTrafficEntries(entries).map((entry) => entry.requestId)).toEqual([
      'r3',
      'r2',
      'r1',
    ]);

    const userRoute = apiTrafficRouteKey(entries[0]!);
    expect(userRoute).toBe('GET ./users/{id}');
    expect(projectApiTrafficRoutes(entries).find((route) => route.key === userRoute)?.count).toBe(
      2,
    );

    expect(
      projectApiTrafficEntries(entries, { errorsOnly: true }).map((entry) => entry.requestId),
    ).toEqual(['r3']);
    expect(
      projectApiTrafficEntries(entries, { hiddenRoutes: new Set([userRoute]) }).map(
        (entry) => entry.requestId,
      ),
    ).toEqual(['r3']);
    expect(
      projectApiTrafficEntries(entries, { searchText: 'users/2' }).map((entry) => entry.requestId),
    ).toEqual(['r2']);
  });

  it('keeps pause/resume/clear semantics independent of a specific UI framework', () => {
    const history = new ApiTrafficHistory(10);
    const first = history.begin({ requestId: 'r1', method: 'GET', path: '/one' });

    const paused = toggleApiTrafficPause(history, { pausedSnapshot: null, selectedId: first });
    expect(paused.pausedSnapshot?.entries.map((entry) => entry.requestId)).toEqual(['r1']);

    history.complete(first, { status: 200, ok: true });
    history.begin({ requestId: 'r2', method: 'GET', path: '/two' });
    expect(paused.pausedSnapshot?.entries.map((entry) => entry.requestId)).toEqual(['r1']);
    expect(paused.pausedSnapshot?.entries[0]?.state).toBe('pending');

    const cleared = clearApiTrafficView(history, paused);
    expect(cleared.selectedId).toBeNull();
    expect(cleared.pausedSnapshot?.entries).toEqual([]);

    history.begin({ requestId: 'r3', method: 'GET', path: '/three' });
    expect(cleared.pausedSnapshot?.entries).toEqual([]);

    const resumed = toggleApiTrafficPause(history, cleared);
    expect(resumed.pausedSnapshot).toBeNull();
    expect(resumed.selectedId).toBeNull();
  });

  it('resolves selection and transaction groups from the exact supplied snapshot entries', () => {
    const history = new ApiTrafficHistory(10);
    const first = history.begin({ requestId: 'r1', method: 'GET', path: '/one' });
    history.complete(first, {
      status: 200,
      ok: true,
      responseHeaders: { 'x-manatos-transaction-id': 'tx-1' },
    });
    const second = history.begin({ requestId: 'r2', method: 'GET', path: '/two' });
    history.complete(second, {
      status: 200,
      ok: true,
      responseHeaders: { 'x-manatos-transaction-id': 'tx-1' },
    });

    const snapshot = history.snapshot();
    expect(findApiTrafficEntry(snapshot.entries, first)?.requestId).toBe('r1');
    expect(
      projectApiTrafficTransactionEntries(snapshot.entries, 'tx-1').map((entry) => entry.requestId),
    ).toEqual(['r1', 'r2']);
  });
});

describe('Surface upstream traffic presentation', () => {
  it('projects the real captured UI result for its matching upstream entity request only', () => {
    const history = new ApiTrafficHistory(10);
    const browser = history.begin({
      requestId: 'operation-1',
      method: 'GET',
      path: '/_manatos/auth/resources/list/sys-principals?page=1',
    });
    history.complete(browser, {
      status: 200,
      ok: true,
      responseBody: { success: true, data: { items: [{ name: 'Example' }] } },
    });
    const bootstrap = history.begin({
      requestId: 'operation-1',
      source: 'surface-upstream',
      method: 'GET',
      path: '/api/v1/public/ui-bootstrap',
    });
    const upstream = history.begin({
      requestId: 'operation-1',
      source: 'surface-upstream',
      method: 'GET',
      path: '/api/v1/SysPrincipals?page=1',
      requestHeaders: { authorization: 'Bearer private-value', accept: 'application/json' },
    });
    history.complete(upstream, {
      status: 200,
      ok: true,
      responseHeaders: { 'content-type': 'application/json' },
    });
    const entries = history.entries();
    expect(correlatedUiResourceResponse(entries, entries[2]!)?.id).toBe(browser);
    expect(correlatedUiResourceResponse(entries, entries[1]!)).toBeNull();
    expect(entries[2]?.requestHeaders.authorization).toBe('[REDACTED]');
    expect(entries[2]?.responseHeaders['content-type']).toBe('application/json');
    expect(Object.hasOwn(entries[2]!, 'responseBody')).toBe(false);
    expect(correlatedUiResourceResponse(entries, entries[0]!)).toBeNull();
    expect(bootstrap).toBeGreaterThan(browser);
  });
});

describe('API traffic response body presence', () => {
  it('preserves captured null, false, empty string and zero; omits only undefined', () => {
    const history = new ApiTrafficHistory(10);
    for (const body of [null, false, '', 0]) {
      const id = history.begin({
        requestId: `captured-${String(body)}`,
        method: 'GET',
        path: '/data',
      });
      history.complete(id, { status: 200, ok: true, responseBody: body });
      expect(apiTrafficResponseBody(history.entries(), history.get(id)!)).toBe(body);
    }
    const absent = history.begin({ requestId: 'absent', method: 'GET', path: '/data' });
    history.complete(absent, { status: 204, ok: true });
    expect(apiTrafficResponseBody(history.entries(), history.get(absent)!)).toBeUndefined();
  });

  it('uses a correlated UI resource response only when the upstream body is absent', () => {
    const history = new ApiTrafficHistory(10);
    const browser = history.begin({
      requestId: 'operation-null',
      method: 'GET',
      path: '/_manatos/auth/resources/list/sys-users',
    });
    history.complete(browser, { status: 200, ok: true, responseBody: null });
    const upstream = history.begin({
      requestId: 'operation-null',
      source: 'surface-upstream',
      method: 'GET',
      path: '/api/v1/SysUsers',
    });
    history.complete(upstream, { status: 200, ok: true });
    expect(apiTrafficResponseBody(history.entries(), history.get(upstream)!)).toBeNull();

    // A directly captured upstream body takes priority, even when null.
    const direct = history.begin({
      requestId: 'operation-null',
      source: 'surface-upstream',
      method: 'GET',
      path: '/api/v1/SysUsers/record',
    });
    history.complete(direct, { status: 200, ok: true, responseBody: false });
    expect(apiTrafficResponseBody(history.entries(), history.get(direct)!)).toBe(false);
  });
});
