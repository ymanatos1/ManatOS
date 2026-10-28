export interface WorkspaceOptions {
  content: string;
}

export function renderWorkspace(options: WorkspaceOptions): string {
  return `
    <section class="workspace">
      ${options.content}
    </section>
  `;
}
