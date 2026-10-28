import { AppError } from '@manatos/shared/errors/app-error';

export interface ApiResponse<T> {
  success: true;
  message?: string;
  data: T;
}

export interface ApiRequest {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  signal?: AbortSignal;
  headers?: Readonly<Record<string, string>>;
  body?: unknown;
}

export interface ApiTransportResponse {
  ok: boolean;
  status: number;
  statusText: string;
  headers?: Readonly<Record<string, string>>;
  body: unknown;
}

export interface ApiTransport {
  request(request: ApiRequest): Promise<ApiTransportResponse>;
}

interface ApiErrorResponse {
  success?: false;
  errorMessage?: string;
  error?: {
    code?: string;
    message?: string;
    retryable?: boolean;
    developerMessage?: string;
  };
}

export class ManatosApiClient {
  constructor(private readonly transport: ApiTransport) {}

  get<T>(path: string, signal?: AbortSignal): Promise<ApiResponse<T>> {
    return this.request<T>({ method: 'GET', path, ...(signal ? { signal } : {}) });
  }

  post<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<ApiResponse<T>> {
    return this.request<T>({
      method: 'POST',
      path,
      ...(body === undefined ? {} : { body }),
      ...(signal ? { signal } : {}),
    });
  }

  put<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<ApiResponse<T>> {
    return this.request<T>({
      method: 'PUT',
      path,
      ...(body === undefined ? {} : { body }),
      ...(signal ? { signal } : {}),
    });
  }

  patch<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<ApiResponse<T>> {
    return this.request<T>({
      method: 'PATCH',
      path,
      body: body ?? {},
      ...(signal ? { signal } : {}),
    });
  }

  delete<T = unknown>(path: string, signal?: AbortSignal): Promise<ApiResponse<T>> {
    return this.request<T>({ method: 'DELETE', path, ...(signal ? { signal } : {}) });
  }

  private async request<T>(request: ApiRequest): Promise<ApiResponse<T>> {
    const response = await this.transport.request(request);

    if (!response.ok) {
      this.fail(response);
    }

    return response.body as ApiResponse<T>;
  }

  private fail(response: ApiTransportResponse): never {
    const payload =
      response.body && typeof response.body === 'object' ? (response.body as ApiErrorResponse) : {};

    const apiError = payload.error;

    throw new AppError(
      apiError?.code ?? `HTTP_${response.status}`,
      apiError?.developerMessage ?? apiError?.message ?? response.statusText,
      payload.errorMessage ??
        apiError?.message ??
        'The requested operation could not be completed.',
      apiError?.retryable ?? response.status >= 500,
    );
  }
}
