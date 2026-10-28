import {
  DEFAULT_API_DIAGNOSTICS_MODE,
  MANATOS_API_DIAGNOSTICS_HEADER,
  apiDiagnosticsModeHeaderValue,
  isApiDiagnosticsResponseEnvelope,
  type ApiDiagnosticsMode,
  type ApiRequestDiagnostics,
} from '@manatos/shared';

import type { ApiRequest, ApiTransport, ApiTransportResponse } from './api-client.js';
import { apiTrafficHistory, type ApiTrafficHistory } from '../debugger/api-traffic-history.js';

export interface BrowserApiTransportOptions {
  baseUrl?: string;
  trafficHistory?: ApiTrafficHistory;
  diagnosticsMode?: ApiDiagnosticsMode;
}

function requestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `ui-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function headersRecord(headers: Headers): Readonly<Record<string, string>> {
  const result: Record<string, string> = {};
  headers.forEach((value, name) => {
    result[name] = value;
  });
  return Object.freeze(result);
}

export class BrowserApiTransport implements ApiTransport {
  private readonly baseUrl: string;
  private readonly history: ApiTrafficHistory;
  private readonly diagnosticsMode: ApiDiagnosticsMode;

  constructor(options: BrowserApiTransportOptions = {}) {
    this.baseUrl = options.baseUrl ?? '';
    this.history = options.trafficHistory ?? apiTrafficHistory;
    this.diagnosticsMode = options.diagnosticsMode ?? DEFAULT_API_DIAGNOSTICS_MODE;
  }

  async request(request: ApiRequest): Promise<ApiTransportResponse> {
    const correlationId = requestId();
    const headers = new Headers(request.headers ?? {});
    headers.set('x-request-id', correlationId);
    headers.set(
      MANATOS_API_DIAGNOSTICS_HEADER,
      apiDiagnosticsModeHeaderValue(this.diagnosticsMode),
    );
    if (request.body !== undefined && !headers.has('content-type')) {
      headers.set('content-type', 'application/json');
    }

    const trafficId = this.history.begin({
      requestId: correlationId,
      method: request.method,
      path: request.path,
      requestHeaders: headers,
      ...(request.body === undefined ? {} : { requestBody: request.body }),
    });

    try {
      const response = await fetch(`${this.baseUrl}${request.path}`, {
        method: request.method,
        headers,
        ...(request.signal ? { signal: request.signal } : {}),
        body: request.body === undefined ? undefined : JSON.stringify(request.body),
        credentials: 'same-origin',
      });

      let body: unknown = undefined;
      let diagnostics: ApiRequestDiagnostics | undefined;

      if (response.status !== 204) {
        const text = await response.text();

        if (text) {
          try {
            body = JSON.parse(text);
          } catch {
            body = text;
          }
        }
      }

      if (this.diagnosticsMode !== false && isApiDiagnosticsResponseEnvelope(body)) {
        diagnostics = body.$manatosDiagnostics;
        body = body.response;
      }

      const responseHeaders = headersRecord(response.headers);
      this.history.complete(trafficId, {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        responseHeaders,
        responseBody: body,
        ...(diagnostics ? { diagnostics } : {}),
      });

      return {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
        body,
      };
    } catch (error) {
      this.history.fail(trafficId, error);
      throw error;
    }
  }
}
