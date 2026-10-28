import { apiTrafficHistory } from '../debugger/api-traffic-history.js';
import {
  UiSurfaceResourceFailure,
  type UiSurfaceResourcePort,
} from '../runtime/surface/resource-port.js';
/** Same-origin browser adapter: the UI host's HttpOnly session cookie is sent automatically. */
export function createUiBrowserSurfaceResourcePort(
  fetcher: typeof fetch = fetch,
): UiSurfaceResourcePort {
  return {
    async request<T>(
      request: import('../runtime/surface/resource-port.js').UiSurfaceResourceRequest,
    ): Promise<T> {
      const endpoint =
        request.kind === 'sysbo.list'
          ? '/_manatos/auth/resources/list/' +
            encodeURIComponent(request.entityKey) +
            '?' +
            new URLSearchParams(request.query).toString()
          : request.kind === 'sysbo.expression-function'
            ? '/_manatos/auth/resources/expression-function'
            : request.kind === 'sysbo.entry-draft' || request.kind === 'sysbo.entry-create'
              ? '/_manatos/auth/resources/entry-draft/' + encodeURIComponent(request.entityKey)
              : request.kind === 'sysbo.entry'
                ? '/_manatos/auth/resources/entry/' +
                  encodeURIComponent(request.entityKey) +
                  '/' +
                  encodeURIComponent(request.recordId)
                : request.kind === 'sysbo.reference-choice'
                  ? '/_manatos/auth/resources/reference-choice'
                  : '/_manatos/auth/resources/references';
      const method =
        request.kind === 'sysbo.expression-function' ||
        request.kind === 'sysbo.references' ||
        request.kind === 'sysbo.entry-create' ||
        request.kind === 'sysbo.reference-choice'
          ? 'POST'
          : 'GET';
      const body =
        request.kind === 'sysbo.expression-function'
          ? { functionName: request.functionName, args: request.args }
          : request.kind === 'sysbo.references'
            ? { targets: request.targets }
            : request.kind === 'sysbo.entry-create'
              ? { record: request.record }
              : request.kind === 'sysbo.reference-choice'
                ? {
                    sourceEntity: request.sourceEntity,
                    sourceId: request.sourceId,
                    field: request.field,
                    candidateId: request.candidateId,
                  }
                : undefined;
      const requestId =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `surface-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const csrf =
        request.kind === 'sysbo.expression-function' ||
        request.kind === 'sysbo.entry-create' ||
        request.kind === 'sysbo.reference-choice'
          ? await (async () => {
              const response = await fetcher('/_manatos/auth/csrf', {
                credentials: 'same-origin',
                cache: 'no-store',
              });
              const data: unknown = await response.json();
              const token = (data as { data?: { csrfToken?: unknown } })?.data?.csrfToken;
              if (!response.ok || typeof token !== 'string' || !token)
                throw new UiSurfaceResourceFailure(response.status, 'CSRF unavailable.');
              return token;
            })()
          : null;
      const headers = {
        accept: 'application/json',
        'x-request-id': requestId,
        ...(body ? { 'content-type': 'application/json' } : {}),
        ...(csrf ? { 'x-manatos-csrf': csrf } : {}),
      };
      const trafficId = apiTrafficHistory.begin({
        requestId,
        method,
        path: endpoint,
        requestHeaders: headers,
        ...(body ? { requestBody: body } : {}),
      });
      let response: Response;
      try {
        response = await fetcher(endpoint, {
          method,
          credentials: 'same-origin',
          headers,
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
      } catch (error) {
        apiTrafficHistory.fail(trafficId, error);
        throw error;
      }
      // The UI server emits sanitized upstream status/path/timing plus an
      // allowlist of transport headers. Never upstream bodies or credentials.
      const upstream = response.headers.get('x-manatos-surface-upstream');
      if (upstream && upstream.length <= 16000) {
        try {
          const exchanges: unknown = JSON.parse(upstream);
          if (Array.isArray(exchanges))
            for (const item of exchanges.slice(0, 24)) {
              if (!item || typeof item !== 'object') continue;
              const entry = item as Record<string, unknown>;
              if (
                typeof entry.method !== 'string' ||
                !['GET', 'POST'].includes(entry.method) ||
                typeof entry.path !== 'string' ||
                !entry.path.startsWith('/api/v1/') ||
                typeof entry.status !== 'number' ||
                !Number.isInteger(entry.status)
              )
                continue;
              const id = apiTrafficHistory.begin({
                requestId,
                source: 'surface-upstream',
                method: entry.method,
                path: entry.path,
                ...(entry.requestHeaders && typeof entry.requestHeaders === 'object'
                  ? { requestHeaders: entry.requestHeaders as Record<string, string> }
                  : {}),
              });
              apiTrafficHistory.complete(id, {
                status: entry.status,
                statusText: typeof entry.statusText === 'string' ? entry.statusText : '',
                ...(entry.responseHeaders && typeof entry.responseHeaders === 'object'
                  ? { responseHeaders: entry.responseHeaders as Record<string, string> }
                  : {}),
                ok: entry.status >= 200 && entry.status < 400,
                durationMs:
                  typeof entry.durationMs === 'number' && Number.isFinite(entry.durationMs)
                    ? Math.max(0, entry.durationMs)
                    : undefined,
              });
            }
        } catch {
          // An invalid optional trace must never affect the resource operation.
        }
      }
      let payload: { success?: boolean; data?: T; error?: { message?: string } };
      try {
        payload = await response.json();
      } catch {
        apiTrafficHistory.complete(trafficId, {
          status: response.status,
          statusText: response.statusText,
          ok: false,
          responseHeaders: response.headers,
        });
        throw new UiSurfaceResourceFailure(response.status, 'Invalid resource response.');
      }
      apiTrafficHistory.complete(trafficId, {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok && payload.success === true,
        responseHeaders: response.headers,
        responseBody: payload,
      });
      if (!response.ok || payload.success !== true || payload.data === undefined)
        throw new UiSurfaceResourceFailure(
          response.status,
          payload.error?.message ?? 'Resource unavailable.',
        );
      return payload.data;
    },
  };
}
