export type DocumentationResourceType = 'markdown' | 'svg' | 'pdf' | 'dot';

export interface DocumentationNode {
  readonly type: 'folder' | 'file';
  readonly name: string;
  readonly path: string;
  readonly resourceType?: DocumentationResourceType;
  readonly children?: readonly DocumentationNode[];
}

export interface DocumentationResource {
  readonly resourceType: DocumentationResourceType;
  readonly contentType: string;
  readonly content: Uint8Array;
}

export interface DocumentationSource {
  getTree(): Promise<readonly DocumentationNode[]>;
  read(path: string): Promise<DocumentationResource>;
}

function encodedDocumentationPath(path: string): string {
  return path.split('/').filter(Boolean).map(encodeURIComponent).join('/');
}

export class BrowserDocumentationSource implements DocumentationSource {
  constructor(
    private readonly treeUrl = '/_manatos/documentation/tree',
    private readonly resourceBaseUrl = '/_manatos/documentation/resource',
  ) {}

  async getTree(): Promise<readonly DocumentationNode[]> {
    const response = await fetch(this.treeUrl, {
      headers: {
        accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Documentation tree request failed (${response.status}).`);
    }

    const payload = (await response.json()) as
      readonly DocumentationNode[] | { items?: readonly DocumentationNode[] };

    if (Array.isArray(payload)) {
      return payload as readonly DocumentationNode[];
    }

    return (payload as { items?: readonly DocumentationNode[] }).items ?? [];
  }

  async read(path: string): Promise<DocumentationResource> {
    const url = `${this.resourceBaseUrl}/${encodedDocumentationPath(path)}`;

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Documentation request failed (${response.status}).`);
    }

    const resourceType = response.headers.get(
      'x-manatos-documentation-type',
    ) as DocumentationResourceType | null;

    if (!resourceType) {
      throw new Error('Documentation response did not identify its resource type.');
    }

    return {
      resourceType,
      contentType: response.headers.get('content-type') ?? 'application/octet-stream',
      content: new Uint8Array(await response.arrayBuffer()),
    };
  }
}
