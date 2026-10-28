import type { UiConfigurationSetting } from '../administration/configuration.js';
import type {
  UiStorageConfiguration,
  UiStorageDebugging,
  UiStorageSnapshot,
} from '../administration/storage.js';

type AdministrationMethod = 'GET' | 'PATCH' | 'POST' | 'DELETE';

type AdministrationEnvelope<T> = {
  success?: boolean;
  data?: T;
  error?: { code?: string; message?: string };
};

/**
 * Only the named target operations may cross the browser-to-host boundary.
 * The NG1 host independently checks the requested route and HTTP method.
 */
const STORAGE_TARGET_OPERATIONS = new Set([
  'test-connection',
  'databases',
  'database/inspect',
  'database/prepare',
  'schema/inspect',
  'schema/prepare',
]);

export class UiAdministrationFailure extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'UiAdministrationFailure';
  }
}

/**
 * Same-origin administration client used by Configuration and Storage surfaces.
 * Authentication stays in the NG1 host session; no bearer token is exposed here.
 */
export class UiBrowserAdministrationClient {
  constructor(private readonly base = '/_manatos/auth/admin') {}

  async configurations(signal?: AbortSignal): Promise<readonly UiConfigurationSetting[]> {
    const response = await this.request<{ items: UiConfigurationSetting[] }>(
      '/configuration',
      'GET',
      undefined,
      signal,
    );

    return response.items;
  }

  async setConfigurationValue(
    id: string,
    value: string,
    signal?: AbortSignal,
  ): Promise<UiConfigurationSetting> {
    this.requireConfigurationId(id);

    const response = await this.request<{ item: UiConfigurationSetting }>(
      `/configuration/${encodeURIComponent(id)}/value`,
      'PATCH',
      { value },
      signal,
    );

    return response.item;
  }

  async storage(signal?: AbortSignal): Promise<UiStorageSnapshot> {
    return this.request<UiStorageSnapshot>('/storage', 'GET', undefined, signal);
  }

  async addStorageConfiguration(
    body: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<UiStorageConfiguration> {
    const response = await this.request<{ item: UiStorageConfiguration }>(
      '/storage/configurations',
      'POST',
      body,
      signal,
    );

    return response.item;
  }

  async updateStorageConfiguration(
    id: string,
    body: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<UiStorageConfiguration> {
    const response = await this.request<{ item: UiStorageConfiguration }>(
      `/storage/configurations/${encodeURIComponent(id)}`,
      'PATCH',
      body,
      signal,
    );

    return response.item;
  }

  async deleteStorageConfiguration(id: string, signal?: AbortSignal): Promise<void> {
    await this.request(
      `/storage/configurations/${encodeURIComponent(id)}`,
      'DELETE',
      undefined,
      signal,
    );
  }

  async moveStorageConfiguration(
    id: string,
    direction: 'up' | 'down',
    signal?: AbortSignal,
  ): Promise<void> {
    await this.request(
      `/storage/configurations/${encodeURIComponent(id)}/order`,
      'PATCH',
      { direction },
      signal,
    );
  }

  /** Persist the complete list order atomically, matching the EJS0 drag/drop contract. */
  async reorderStorageConfigurations(ids: readonly string[], signal?: AbortSignal): Promise<void> {
    await this.request('/storage/configurations/order', 'PATCH', { ids: [...ids] }, signal);
  }

  async selectStorageConfiguration(configurationId: string, signal?: AbortSignal): Promise<void> {
    await this.request('/storage/current', 'PATCH', { configurationId }, signal);
  }

  async updateStorageDebugging(settings: UiStorageDebugging, signal?: AbortSignal): Promise<void> {
    await this.request('/storage/debugging', 'PATCH', settings, signal);
  }

  async storageTargetOperation<T>(
    operation: string,
    body: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<T> {
    if (!STORAGE_TARGET_OPERATIONS.has(operation)) {
      throw new Error('Unsupported storage target operation.');
    }

    return this.request<T>(`/storage/target/${operation}`, 'POST', body, signal);
  }

  private requireConfigurationId(id: string): void {
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      throw new Error('Invalid configuration identifier.');
    }
  }

  /**
   * The existing Auth endpoint supplies the CSRF token for the current session.
   * Obtain it for every mutation so a sign-in in another tab can rotate the token.
   */
  private async readCsrfToken(signal?: AbortSignal): Promise<string> {
    const response = await fetch('/_manatos/auth/csrf', {
      credentials: 'same-origin',
      cache: 'no-store',
      signal,
      headers: { accept: 'application/json' },
    });

    const envelope = (await response.json()) as AdministrationEnvelope<{
      csrfToken?: string;
    }>;
    const token = envelope.success === true ? envelope.data?.csrfToken : undefined;

    if (!response.ok || !token) {
      throw new UiAdministrationFailure(
        'CSRF_UNAVAILABLE',
        'Session verification failed.',
        response.status,
      );
    }

    return token;
  }

  private async request<T>(
    path: string,
    method: AdministrationMethod,
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<T> {
    const csrf = method === 'GET' ? undefined : await this.readCsrfToken(signal);
    const headers: Record<string, string> = {
      accept: 'application/json',
    };

    if (body !== undefined) {
      headers['content-type'] = 'application/json';
    }

    if (csrf) {
      headers['x-manatos-csrf'] = csrf;
    }

    const requestOptions: RequestInit = {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      signal,
      headers,
    };

    if (body !== undefined) {
      requestOptions.body = JSON.stringify(body);
    }

    const response = await this.send(path, requestOptions, signal);
    const envelope = await this.readEnvelope<T>(response);

    if (!response.ok || envelope.success !== true || envelope.data === undefined) {
      throw new UiAdministrationFailure(
        envelope.error?.code ?? 'ADMIN_FAILED',
        envelope.error?.message ?? 'Administration request failed.',
        response.status,
      );
    }

    return envelope.data;
  }

  /** Transport failures are distinct from API-reported authorization/validation errors. */
  private async send(path: string, options: RequestInit, signal?: AbortSignal): Promise<Response> {
    try {
      return await fetch(this.base + path, options);
    } catch (error) {
      if (signal?.aborted) {
        throw error;
      }

      throw new UiAdministrationFailure(
        'HOST_UNAVAILABLE',
        'Administration service unavailable.',
        503,
      );
    }
  }

  private async readEnvelope<T>(response: Response): Promise<AdministrationEnvelope<T>> {
    try {
      return (await response.json()) as AdministrationEnvelope<T>;
    } catch {
      throw new UiAdministrationFailure(
        'INVALID_RESPONSE',
        'Invalid administration response.',
        502,
      );
    }
  }
}
