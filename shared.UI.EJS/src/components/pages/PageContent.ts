export interface PageContentOptions {
  content?: string;
}

export function renderPageContent(options: PageContentOptions = {}): string {
  return `
    <div class="page-content">
      ${options.content ?? ''}
    </div>
  `;
}
