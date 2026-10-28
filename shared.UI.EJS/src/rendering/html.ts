export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function safeIconClass(value: string | undefined): string {
  const icon = value?.trim();

  return icon && /^[A-Za-z0-9_-]+$/.test(icon) ? icon : '';
}
