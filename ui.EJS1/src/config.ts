import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';

import { resolveDocumentationRepositoryRoot } from '@manatos/shared-ui/node';

export type Ejs1NodeEnvironment = 'development' | 'test' | 'production';

export interface Ejs1Config {
  readonly nodeEnv: Ejs1NodeEnvironment;
  readonly uiPort: number;
  readonly apiBaseUrl: string;
  /** Server-only identity delegation secret; never exposed to browsers. */
  readonly authDelegationSecret: string;
  readonly internalApiKey?: string;
  readonly publicBaseUrl: string;
  readonly documentationRepositoryRoot: string;
}

const uiRoot = fileURLToPath(new URL('../', import.meta.url));

function required(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`${name} is required for UI.EJS1.`);
  return value;
}

function parseEnvironment(value: string): Ejs1NodeEnvironment {
  if (value === 'development' || value === 'test' || value === 'production') return value;
  throw new Error(`NODE_ENV must be development, test, or production; received ${value}.`);
}

function parsePort(value: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`UI_PORT must be an integer from 1 to 65535; received ${value}.`);
  }
  return port;
}

function parseHttpOrigin(name: string, value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be an absolute HTTP(S) URL; received ${value}.`);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`${name} must use http or https; received ${value}.`);
  }
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error(`${name} must be an origin without credentials, path, query, or fragment.`);
  }

  return url.origin;
}

export function readEjs1Config(environment: NodeJS.ProcessEnv): Ejs1Config {
  return Object.freeze({
    nodeEnv: parseEnvironment(
      required(environment, environment.NODE_ENV?.trim() ? 'NODE_ENV' : 'UI_ENVIRONMENT'),
    ),
    uiPort: parsePort(required(environment, 'UI_PORT')),
    apiBaseUrl: parseHttpOrigin('API_BASE_URL', required(environment, 'API_BASE_URL')),
    authDelegationSecret: required(environment, 'AUTH_DELEGATION_SECRET'),
    ...(environment['INTERNAL_API_KEY']?.trim()
      ? { internalApiKey: environment['INTERNAL_API_KEY'].trim() }
      : {}),
    publicBaseUrl: parseHttpOrigin(
      'UI_PUBLIC_BASE_URL',
      required(
        environment,
        environment.UI_PUBLIC_BASE_URL?.trim() ? 'UI_PUBLIC_BASE_URL' : 'PUBLIC_BASE_URL',
      ),
    ),
    documentationRepositoryRoot: resolveDocumentationRepositoryRoot(
      required(environment, 'DOCUMENTATION_REPOSITORY_ROOT'),
      uiRoot,
    ),
  });
}

export function loadEjs1Config(): Ejs1Config {
  const envPath = resolve(uiRoot, '.env');
  if (existsSync(envPath)) loadEnvFile(envPath);
  return readEjs1Config(process.env);
}
