import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import { dirname, extname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export type DocumentationResourceType = 'markdown' | 'svg' | 'pdf' | 'dot';

export interface DocumentationNode {
  type: 'folder' | 'file';
  name: string;
  path: string;
  resourceType?: DocumentationResourceType;
  children?: DocumentationNode[];
}

export interface DocumentationResource {
  resourceType: DocumentationResourceType;
  contentType: string;
  content: Buffer;
}

const moduleDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(moduleDirectory, '../../..');
export const documentationRoot = resolve(repositoryRoot, 'docs');

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

function resourceType(path: string): DocumentationResourceType | undefined {
  return resourceTypes.get(extname(path).toLowerCase());
}

function publicPath(absolutePath: string): string {
  return `docs/${relative(documentationRoot, absolutePath).split(sep).join('/')}`;
}

function insideDocumentationRoot(absolutePath: string): boolean {
  const relativePath = relative(documentationRoot, absolutePath);
  return relativePath === '' || (!relativePath.startsWith(`..${sep}`) && relativePath !== '..');
}

async function directoryNode(absoluteDirectory: string): Promise<DocumentationNode[]> {
  const entries = await readdir(absoluteDirectory, { withFileTypes: true });
  const nodes: DocumentationNode[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const absolutePath = resolve(absoluteDirectory, entry.name);

    if (entry.isDirectory()) {
      const children = await directoryNode(absolutePath);
      if (children.length) {
        nodes.push({ type: 'folder', name: entry.name, path: publicPath(absolutePath), children });
      }
      continue;
    }

    const type = entry.isFile() ? resourceType(entry.name) : undefined;
    if (type) {
      nodes.push({
        type: 'file',
        name: entry.name,
        path: publicPath(absolutePath),
        resourceType: type,
      });
    }
  }

  return nodes.sort((left, right) => {
    if (left.type !== right.type) return left.type === 'folder' ? -1 : 1;
    if (left.name.toLowerCase() === 'readme.md') return -1;
    if (right.name.toLowerCase() === 'readme.md') return 1;
    return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
  });
}

export async function documentationManifest(): Promise<DocumentationNode[]> {
  return [
    { type: 'file', name: 'README.md', path: 'README.md', resourceType: 'markdown' },
    {
      type: 'folder',
      name: 'docs',
      path: 'docs',
      children: await directoryNode(documentationRoot),
    },
  ];
}

export async function readDocumentationResource(
  requestedPath: string,
): Promise<DocumentationResource> {
  const normalized = String(requestedPath || '')
    .replaceAll('\\', '/')
    .replace(/^\/+/, '');
  const type = resourceType(normalized);
  if (!normalized || !type) throw new Error('A supported documentation resource is required.');

  const isRepositoryReadme = normalized.toLowerCase() === 'readme.md';
  const documentationPath = normalized.toLowerCase().startsWith('docs/')
    ? normalized.slice('docs/'.length)
    : '';
  if ((!isRepositoryReadme && !documentationPath) || (isRepositoryReadme && type !== 'markdown')) {
    throw new Error('Invalid documentation path.');
  }

  const allowedRoot = isRepositoryReadme ? repositoryRoot : documentationRoot;
  const absolutePath = isRepositoryReadme
    ? resolve(repositoryRoot, 'README.md')
    : resolve(documentationRoot, documentationPath);
  if (!isRepositoryReadme && !insideDocumentationRoot(absolutePath)) {
    throw new Error('Invalid documentation path.');
  }

  const canonicalPath = await realpath(absolutePath);
  const relativeToAllowedRoot = relative(allowedRoot, canonicalPath);
  if (
    relativeToAllowedRoot.startsWith(`..${sep}`) ||
    relativeToAllowedRoot === '..' ||
    (isRepositoryReadme && relativeToAllowedRoot.toLowerCase() !== 'readme.md')
  ) {
    throw new Error('Invalid documentation path.');
  }

  const fileStat = await stat(canonicalPath);
  if (!fileStat.isFile()) throw new Error('Documentation resource not found.');
  return {
    resourceType: type,
    contentType: contentTypes[type],
    content: await readFile(canonicalPath),
  };
}
