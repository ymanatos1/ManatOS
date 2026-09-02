import { AppError, operationContext, type OperationNodeSnapshot } from '@manatos/shared';

import { config } from './config.js';
import { addApiTrafficEntry, sanitizeTrafficValue } from './debug/api-traffic-store.js';

/**
 * Standard successful API envelope.
 *
 * GET/query:
 *
 *   {
 *     success: true,
 *     data: ...
 *   }
 *
 * Command:
 *
 *   {
 *     success: true,
 *     message: "...",
 *     data: ...
 *   }
 */
export interface ApiResponse<T> {
  success: true;

  message?: string;

  data: T;
}

/**
 * Per-request API options.
 *
 * accessToken:
 *   Used for normal authenticated user operations.
 *
 * internal:
 *   Adds the trusted UI -> API internal key.
 *
 *   This must not be used as a substitute for normal
 *   user authorization.
 *
 * clientName:
 *   Optional diagnostic client name recorded when an
 *   API session is created.
 */
export interface ApiRequestOptions {
  accessToken?: string;

  internal?: boolean;

  clientName?: string;
}

/**
 * Shape of a failed API response.
 */
interface ApiErrorResponse {
  success?: false;

  errorMessage?: string;

  error?: {
    code?: string;

    message?: string;

    retryable?: boolean;

    operationTrace?: OperationNodeSnapshot[];

    developerMessage?: string;

    stack?: string;
  };
}

/**
 * UI -> API HTTP boundary.
 *
 * The browser never receives the API Bearer token.
 *
 * The token is held only inside the server-side Express
 * UI session and supplied to this client for protected
 * UI -> API requests.
 */
export class ApiClient {
  /**
   * Execute a GET/query operation.
   */
  get<T>(
    path: string,

    options: ApiRequestOptions = {},
  ): Promise<ApiResponse<T>> {
    return this.request<T>(
      path,

      {
        method: 'GET',
      },

      options,
    );
  }

  /**
   * Execute a POST command.
   */
  post<T>(
    path: string,

    body?: unknown,

    options: ApiRequestOptions = {},
  ): Promise<ApiResponse<T>> {
    return this.request<T>(
      path,

      {
        method: 'POST',

        /**
         * exactOptionalPropertyTypes:
         *
         * Do not explicitly provide:
         *
         *   body: undefined
         *
         * Omit the property instead.
         */
        ...(body === undefined
          ? {}
          : {
              body: JSON.stringify(body),
            }),
      },

      options,
    );
  }

  /**
   * Execute a PUT command.
   */
  put<T>(
    path: string,

    body?: unknown,

    options: ApiRequestOptions = {},
  ): Promise<ApiResponse<T>> {
    return this.request<T>(
      path,

      {
        method: 'PUT',

        ...(body === undefined
          ? {}
          : {
              body: JSON.stringify(body),
            }),
      },

      options,
    );
  }

  /**
   * Execute a PATCH command.
   */
  patch<T>(
    path: string,

    body?: unknown,

    options: ApiRequestOptions = {},
  ): Promise<ApiResponse<T>> {
    return this.request<T>(
      path,

      {
        method: 'PATCH',

        body: JSON.stringify(body ?? {}),
      },

      options,
    );
  }

  /**
   * Execute a DELETE command.
   *
   * DELETE follows the normal ManatOS command envelope
   * and therefore returns JSON rather than being treated
   * as an HTTP 204/no-content special case.
   */
  delete<T = unknown>(
    path: string,

    options: ApiRequestOptions = {},
  ): Promise<ApiResponse<T>> {
    return this.request<T>(
      path,

      {
        method: 'DELETE',
      },

      options,
    );
  }

  /**
   * Common API request implementation.
   */
  private async request<T>(
    path: string,

    init: RequestInit,

    options: ApiRequestOptions,
  ): Promise<ApiResponse<T>> {
    const startedAt = new Date();
    const started = performance.now();
    const method = String(init.method ?? 'GET').toUpperCase();
    let requestBody: unknown;
    if (typeof init.body === 'string' && init.body) {
      try { requestBody = JSON.parse(init.body); } catch { requestBody = init.body; }
    }

    const recordTraffic = (entry: Parameters<typeof addApiTrafficEntry>[0]) => {
      if (config.NODE_ENV !== 'production') addApiTrafficEntry(entry);
    };

    let response: Response;
    try {
      response = await fetch(
      config.API_BASE_URL + path,

      {
        ...init,

        headers: {
          accept: 'application/json',

          /**
           * Add Content-Type only when a request body exists.
           */
          ...(init.body
            ? {
                'content-type': 'application/json',
              }
            : {}),

          /**
           * Normal authenticated business/API operation.
           *
           * This is the Bearer token belonging to the
           * current server-side website session.
           */
          ...(options.accessToken
            ? {
                authorization: `Bearer ${options.accessToken}`,
              }
            : {}),

          /**
           * Trusted process-to-process operation.
           *
           * Only explicitly internal API endpoints should
           * use this mechanism.
           *
           * It must never replace normal Bearer authorization
           * for business operations.
           */
          ...(options.internal
            ? {
                'x-internal-api-key': config.INTERNAL_API_KEY,
              }
            : {}),

          /**
           * Optional non-security-critical client information.
           *
           * Primarily useful while creating API sessions so
           * they can later be identified in the Sessions view.
           */
          ...(options.clientName
            ? {
                'x-client-name': options.clientName,
              }
            : {}),
        },
      },
    );
    } catch (error) {
      recordTraffic({
        requestId: operationContext.getRequestId(),
        startedAt: startedAt.toISOString(),
        durationMs: Math.max(0, Math.round((performance.now() - started) * 10) / 10),
        method,
        path,
        status: null,
        ok: false,
        ...(requestBody === undefined ? {} : { requestBody: sanitizeTrafficValue(requestBody) }),
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    let responseBody: unknown;
    try {
      const contentType = response.headers.get('content-type') ?? '';
      if (contentType.includes('application/json')) responseBody = await response.clone().json();
      else responseBody = await response.clone().text();
    } catch {
      responseBody = undefined;
    }

    recordTraffic({
      requestId: operationContext.getRequestId(),
      startedAt: startedAt.toISOString(),
      durationMs: Math.max(0, Math.round((performance.now() - started) * 10) / 10),
      method,
      path,
      status: response.status,
      ok: response.ok,
      ...(requestBody === undefined ? {} : { requestBody: sanitizeTrafficValue(requestBody) }),
      ...(responseBody === undefined ? {} : { responseBody: sanitizeTrafficValue(responseBody) }),
    });

    if (!response.ok) {
      await this.fail(response, options);
    }

    /**
     * IMPORTANT:
     *
     * Keep the type assertion around the complete awaited
     * expression.
     *
     * Writing:
     *
     *   return await response.json()
     *     as ApiResponse<T>;
     *
     * caused TypeScript TS1434 in the previous version.
     */
    const result = (await response.json()) as ApiResponse<T>;

    return result;
  }

  /**
   * Convert an API failure envelope into the shared AppError model.
   *
   * Special case:
   *
   * If a request actually carried a Bearer token and the
   * API returns HTTP 401, the website session can no longer
   * use its associated API session.
   *
   * Possible reasons include:
   *
   * - API token expiration;
   * - explicit logout/revocation;
   * - logout-all from another client;
   * - API restart while AccessTokenStore is still in memory;
   * - other invalidation of the access token.
   *
   * The central UI error handler recognizes:
   *
   *   UI_API_SESSION_EXPIRED
   *
   * clears authentication state and redirects the browser
   * back to sign-in.
   */
  private async fail(
    response: Response,

    options: ApiRequestOptions,
  ): Promise<never> {
    let payload: ApiErrorResponse = {};

    try {
      /**
       * IMPORTANT:
       *
       * As above, put the assertion around the complete
       * awaited expression.
       */
      payload = (await response.json()) as ApiErrorResponse;
    } catch {
      /**
       * A non-JSON failure still becomes a normal AppError
       * below.
       */
    }

    const apiError = payload.error;

    /**
     * A 401 returned from an already authenticated Bearer
     * request means that the UI/API bridge session has been
     * invalidated.
     *
     * This is deliberately different from:
     *
     *   POST /auth/login -> 401 INVALID_CREDENTIALS
     *
     * because login itself does not yet have an accessToken
     * in ApiRequestOptions.
     */
    if (response.status === 401 && options.accessToken) {
      throw new AppError(
        'UI_API_SESSION_EXPIRED',

        apiError?.developerMessage ?? apiError?.message ?? 'The API session is no longer valid.',

        'Your session has expired. Please sign in again.',

        false,
      );
    }

    const userMessage =
      payload.errorMessage ??
      apiError?.message ??
      'The requested operation could not be completed.';

    const error = new AppError(
      apiError?.code ?? `HTTP_${response.status}`,

      apiError?.developerMessage ?? apiError?.message ?? response.statusText,

      userMessage,

      apiError?.retryable ?? response.status >= 500,
    );

    /**
     * exactOptionalPropertyTypes:
     *
     * Do not assign undefined explicitly to an optional
     * property.
     */
    if (apiError?.operationTrace) {
      error.operationTrace = apiError.operationTrace;
    }

    throw error;
  }
}

/**
 * Shared UI API client instance.
 */
export const apiClient = new ApiClient();
