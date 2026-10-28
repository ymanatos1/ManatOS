import { renderUiPageTemplate, type UiPageTemplateContext } from './template.js';

/** Render trusted static HTML content without CTX subscriptions. */
export function renderUiContent(template: string, context: UiPageTemplateContext): string {
  return renderUiPageTemplate(template, context);
}
