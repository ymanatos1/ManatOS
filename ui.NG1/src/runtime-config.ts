export interface Ng1PublicRuntimeConfig {
  readonly apiBaseUrl: string;
}

declare global {
  // Set by /manatos-config.js before Angular starts. This object is public.
  var manatosConfig: Readonly<Partial<Ng1PublicRuntimeConfig>> | undefined;
}

function normalizeApiBaseUrl(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('NG1 runtime configuration requires apiBaseUrl.');
  }

  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error(`NG1 apiBaseUrl must be an absolute HTTP(S) URL; received ${String(value)}.`);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`NG1 apiBaseUrl must use http or https; received ${value}.`);
  }
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error(
      'NG1 apiBaseUrl must be an origin without credentials, path, query, or fragment.',
    );
  }

  return url.origin;
}

export function readNg1RuntimeConfig(
  source: Readonly<Partial<Ng1PublicRuntimeConfig>> | undefined = globalThis.manatosConfig,
): Ng1PublicRuntimeConfig {
  if (!source) {
    throw new Error('NG1 public runtime configuration was not loaded.');
  }

  return Object.freeze({
    apiBaseUrl: normalizeApiBaseUrl(source.apiBaseUrl),
  });
}

export function getNg1RuntimeConfig(): Ng1PublicRuntimeConfig {
  return readNg1RuntimeConfig();
}
