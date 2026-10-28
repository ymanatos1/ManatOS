import { existsSync, realpathSync } from 'node:fs';

import { readFile, realpath, stat } from 'node:fs/promises';

import { extname, relative, resolve, sep } from 'node:path';

import { fileURLToPath } from 'node:url';

import type { UiPageIdentity } from '@manatos/shared';

import type { UiPageContentSource } from '../pages/source.js';

export interface UiPageResource {
  readonly contentType: string;
  readonly content: Uint8Array;
}

const packageRoot = fileURLToPath(new URL('../../', import.meta.url));

const sourcePagesRoot = resolve(packageRoot, 'src/pages');

const packagedPagesRoot = resolve(packageRoot, 'dist/pages');

const resourceContentTypes = new Map<string, string>([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.gif', 'image/gif'],
  ['.svg', 'image/svg+xml; charset=utf-8'],
  ['.webp', 'image/webp'],
  ['.avif', 'image/avif'],
]);

function pagesRoot(): string {
  const candidate = existsSync(sourcePagesRoot) ? sourcePagesRoot : packagedPagesRoot;

  return realpathSync(candidate);
}

function safeRelativePath(value: string): string {
  const normalized = String(value || '')
    .replaceAll('\\', '/')
    .replace(/^\/+/, '');

  if (
    !normalized ||
    normalized.split('/').some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    throw new Error('Invalid UI page resource path.');
  }

  return normalized;
}

function inside(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);

  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`));
}

export class NodeUiPageContentSource implements UiPageContentSource {
  private readonly root: string;

  constructor(root = pagesRoot()) {
    this.root = realpathSync(root);
  }

  async readPage(page: UiPageIdentity, language = 'en'): Promise<string> {
    const folder = safeRelativePath(page.folder);

    const name = safeRelativePath(page.name);

    if (name.includes('/')) {
      throw new Error('UI page name must be one path segment.');
    }

    let resource: UiPageResource;
    if (language.toLowerCase() === 'el') {
      try {
        resource = await this.readResource(`${folder}/${name}-EL.html`);
      } catch (error) {
        // Only a missing localized file triggers the English fallback.
        if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error;
        resource = await this.readResource(`${folder}/${name}.html`);
      }
    } else {
      resource = await this.readResource(`${folder}/${name}.html`);
    }

    return new TextDecoder().decode(resource.content);
  }

  // Language-specific HTML is optional. Resolve a missing Greek template on the host
  // so the browser receives a successful response instead of an expected 404.
  // Do not hide other failures or missing ordinary resources.
  async readServedResource(requestedPath: string): Promise<UiPageResource> {
    try {
      return await this.readResource(requestedPath);
    } catch (error) {
      if (
        !requestedPath.endsWith('-EL.html') ||
        !(error instanceof Error) ||
        !('code' in error) ||
        error.code !== 'ENOENT'
      )
        throw error;

      return this.readResource(requestedPath.slice(0, -'-EL.html'.length) + '.html');
    }
  }

  async readResource(requestedPath: string): Promise<UiPageResource> {
    const normalized = safeRelativePath(requestedPath);

    const contentType = resourceContentTypes.get(extname(normalized).toLowerCase());

    if (!contentType) {
      throw new Error('Unsupported UI page resource type.');
    }

    const requested = resolve(this.root, normalized);

    if (!inside(this.root, requested)) {
      throw new Error('Invalid UI page resource path.');
    }

    const canonical = await realpath(requested);

    if (!inside(this.root, canonical)) {
      throw new Error('Invalid UI page resource path.');
    }

    const file = await stat(canonical);

    if (!file.isFile()) {
      throw new Error('UI page resource not found.');
    }

    return {
      contentType,
      content: await readFile(canonical),
    };
  }
}
