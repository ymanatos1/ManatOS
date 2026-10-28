export interface ContentOptions {
  content?: string;
}

export function renderContent(options: ContentOptions = {}): string {
  return `
    <section class="content">
      ${options.content ?? ''}
    </section>
  `;
}
