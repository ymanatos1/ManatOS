import { resolveMetadataText, type MetadataLanguage } from '@manatos/shared';

/** Refresh only explicitly annotated EJS presentation elements. Never infer
 * translatable content from DOM text, CTX values, API payloads, or user data.
 */
export function refreshMultilingualElements(root: HTMLElement, language: MetadataLanguage): void {
  const elements = [
    root,
    ...root.querySelectorAll<HTMLElement>(
      '[data-multilingual-text], [data-multilingual-title], [data-multilingual-aria-label], [data-multilingual-tooltip], [data-multilingual-tooltip-detail], [data-multilingual-placeholder]',
    ),
  ];
  for (const element of elements) {
    const key = (name: string): string | undefined =>
      element.getAttribute(`data-multilingual-${name}`) ?? undefined;
    const resolve = (name: string): string | undefined => {
      const reference = key(name);
      return reference ? resolveMetadataText(`@CM.${reference}`, language) : undefined;
    };
    const text = resolve('text');
    if (text !== undefined) element.textContent = text;
    const title = resolve('title');
    if (title !== undefined) element.title = title;
    const aria = resolve('aria-label');
    if (aria !== undefined) element.setAttribute('aria-label', aria);
    const tooltip = resolve('tooltip');
    if (tooltip !== undefined) element.dataset.debugTooltip = tooltip;
    const detail = resolve('tooltip-detail');
    if (detail !== undefined) element.dataset.debugTooltipDetail = detail;
    const placeholder = resolve('placeholder');
    if (placeholder !== undefined && 'placeholder' in element)
      (element as HTMLInputElement).placeholder = placeholder;
  }
}
