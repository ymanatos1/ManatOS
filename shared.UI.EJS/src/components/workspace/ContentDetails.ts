export interface ContentDetailsOptions {
  content?: string;
}

export function renderContentDetails(options: ContentDetailsOptions = {}): string {
  return `
    <aside class="content-details" aria-label="Content details">
      ${options.content ?? ''}
    </aside>
  `;
}
