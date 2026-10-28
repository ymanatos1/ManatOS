import { existsSync } from 'node:fs';

import { resolve } from 'node:path';

import { loadEnvFile } from 'node:process';

import { fileURLToPath } from 'node:url';

import { resolveDocumentationRepositoryRoot } from '@manatos/shared-ui/node';

export type Ng1HostEnvironment = 'development' | 'test' | 'production';

export interface Ng1HostConfig {
  readonly nodeEnv: Ng1HostEnvironment;

  readonly uiPort: number;

  readonly apiBaseUrl: string;
  /** Server-only signing secret shared with the API, never Angular. */
  readonly authDelegationSecret: string;
  /** Trusted API credential; never sent to Angular. External OAuth is disabled without it. */
  readonly internalApiKey?: string;
  readonly publicBaseUrl?: string;

  readonly documentationRepositoryRoot: string;

  readonly angularDistRoot: string;
}

export const ng1HostRoot = fileURLToPath(new URL('../../', import.meta.url));

function required(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required for UI.NG1 host.`);
  }

  return value;
}

function parseEnvironment(value: string): Ng1HostEnvironment {
  if (value === 'development' || value === 'test' || value === 'production') {
    return value;
  }

  throw new Error(`NODE_ENV must be development, test, or production; received ${value}.`);
}

function parsePort(value: string): number {
  const port = Number(value);

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`UI_PORT must be an integer from 1 to 65535; received ${value}.`);
  }

  return port;
}

function parseApiOrigin(value: string): string {
  const url = new URL(value);

  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error('API_BASE_URL must be an HTTP(S) origin without credentials, path or query.');
  }

  return url.origin;
}

function publicOrigin(value: string): string {
  const url = new URL(value);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error('UI_PUBLIC_BASE_URL must be an HTTP(S) origin.');
  }
  return url.origin;
}

export function readNg1HostConfig(environment: NodeJS.ProcessEnv): Ng1HostConfig {
  return Object.freeze({
    nodeEnv: parseEnvironment(
      environment['UI_ENVIRONMENT']?.trim() || environment['NODE_ENV']?.trim() || 'development',
    ),

    uiPort: parsePort(required(environment, 'UI_PORT')),

    apiBaseUrl: parseApiOrigin(required(environment, 'API_BASE_URL')),
    authDelegationSecret: required(environment, 'AUTH_DELEGATION_SECRET'),
    ...(environment['INTERNAL_API_KEY']?.trim()
      ? { internalApiKey: environment['INTERNAL_API_KEY'].trim() }
      : {}),
    ...(environment['UI_PUBLIC_BASE_URL']?.trim()
      ? { publicBaseUrl: publicOrigin(environment['UI_PUBLIC_BASE_URL'].trim()) }
      : {}),

    documentationRepositoryRoot: resolveDocumentationRepositoryRoot(
      required(environment, 'DOCUMENTATION_REPOSITORY_ROOT'),
      ng1HostRoot,
    ),

    // The common UI .env intentionally has no implementation-specific keys.
    angularDistRoot: resolve(
      ng1HostRoot,
      environment['ANGULAR_DIST_ROOT']?.trim() || 'dist/ui.NG1/browser',
    ),
  });
}

export function loadNg1HostConfig(): Ng1HostConfig {
  const envPath = resolve(ng1HostRoot, '.env');

  if (existsSync(envPath)) {
    loadEnvFile(envPath);
  }

  return readNg1HostConfig(process.env);
}
