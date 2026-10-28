import { realpathSync } from 'node:fs';

import { readdir, readFile, realpath, stat } from 'node:fs/promises';

import { extname, relative, resolve, sep } from 'node:path';

import type {
  DocumentationNode,
  DocumentationResource,
  DocumentationResourceType,
  DocumentationSource,
} from '../pages/documentation/documentation-source.js';

const resourceTypes = new Map<string, DocumentationResourceType>([
  ['.md', 'markdown'],
  ['.svg', 'svg'],
  ['.pdf', 'pdf'],
  ['.dot', 'dot'],
]);

const contentTypes: Record<DocumentationResourceType, string> = {
  markdown: 'text/markdown; charset=utf-8',

  svg: 'image/svg+xml; charset=utf-8',

  pdf: 'application/pdf',

  dot: 'text/vnd.graphviz; charset=utf-8',
};

export function resolveDocumentationRepositoryRoot(
  configuredRoot: string,
  hostRoot: string,
): string {
  const value = configuredRoot.trim();

  if (!value) {
    throw new Error('DOCUMENTATION_REPOSITORY_ROOT is required.');
  }

  return resolve(hostRoot, value);
}

function resourceType(path: string): DocumentationResourceType | undefined {
  return resourceTypes.get(extname(path).toLowerCase());
}

function inside(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);

  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`));
}

function publicPath(documentationRoot: string, absolutePath: string): string {
  return `docs/${relative(documentationRoot, absolutePath).split(sep).join('/')}`;
}

export class RepositoryDocumentationSource implements DocumentationSource {
  private readonly repositoryRoot: string;
  private readonly documentationRoot: string;

  constructor(repositoryRoot: string) {
    this.repositoryRoot = realpathSync(repositoryRoot);

    this.documentationRoot = resolve(this.repositoryRoot, 'docs');
  }

  async getTree(): Promise<readonly DocumentationNode[]> {
    const readme = resolve(this.repositoryRoot, 'README.md');

    const readmeStat = await stat(readme);

    if (!readmeStat.isFile()) {
      throw new Error('Documentation repository README.md was not found.');
    }

    const docsStat = await stat(this.documentationRoot);

    if (!docsStat.isDirectory()) {
      throw new Error('Documentation repository docs folder was not found.');
    }

    return [
      {
        type: 'file',
        name: 'README.md',
        path: 'README.md',
        resourceType: 'markdown',
      },

      {
        type: 'folder',
        name: 'docs',
        path: 'docs',
        children: await this.directoryNodes(this.documentationRoot),
      },
    ];
  }

  async read(requestedPath: string): Promise<DocumentationResource> {
    const normalized = String(requestedPath || '')
      .replaceAll('\\', '/')
      .replace(/^\/+/, '');

    const type = resourceType(normalized);

    if (!normalized || !type) {
      throw new Error('A supported documentation resource is required.');
    }

    const repositoryReadme = normalized.toLowerCase() === 'readme.md';

    const documentationPath = normalized.toLowerCase().startsWith('docs/')
      ? normalized.slice('docs/'.length)
      : '';

    if ((!repositoryReadme && !documentationPath) || (repositoryReadme && type !== 'markdown')) {
      throw new Error('Invalid documentation path.');
    }

    const allowedRoot = repositoryReadme ? this.repositoryRoot : this.documentationRoot;

    const requested = repositoryReadme
      ? resolve(this.repositoryRoot, 'README.md')
      : resolve(this.documentationRoot, documentationPath);

    if (!inside(allowedRoot, requested)) {
      throw new Error('Invalid documentation path.');
    }

    const canonical = await realpath(requested);

    if (!inside(allowedRoot, canonical)) {
      throw new Error('Invalid documentation path.');
    }

    if (
      repositoryReadme &&
      relative(this.repositoryRoot, canonical).toLowerCase() !== 'readme.md'
    ) {
      throw new Error('Invalid documentation path.');
    }

    const file = await stat(canonical);

    if (!file.isFile()) {
      throw new Error('Documentation resource not found.');
    }

    return {
      resourceType: type,
      contentType: contentTypes[type],

      content: await readFile(canonical),
    };
  }

  private async directoryNodes(absoluteDirectory: string): Promise<DocumentationNode[]> {
    const entries = await readdir(absoluteDirectory, {
      withFileTypes: true,
    });

    const nodes: DocumentationNode[] = [];

    for (const entry of entries) {
      if (entry.name.startsWith('.')) {
        continue;
      }

      const absolutePath = resolve(absoluteDirectory, entry.name);

      if (entry.isDirectory()) {
        const children = await this.directoryNodes(absolutePath);

        if (children.length) {
          nodes.push({
            type: 'folder',
            name: entry.name,
            path: publicPath(this.documentationRoot, absolutePath),
            children,
          });
        }

        continue;
      }

      const type = entry.isFile() ? resourceType(entry.name) : undefined;

      if (type) {
        nodes.push({
          type: 'file',
          name: entry.name,
          path: publicPath(this.documentationRoot, absolutePath),
          resourceType: type,
        });
      }
    }

    return nodes.sort((left, right) => {
      if (left.type !== right.type) {
        return left.type === 'folder' ? -1 : 1;
      }

      if (left.name.toLowerCase() === 'readme.md') {
        return -1;
      }

      if (right.name.toLowerCase() === 'readme.md') {
        return 1;
      }

      return left.name.localeCompare(right.name, undefined, {
        sensitivity: 'base',
      });
    });
  }
}
