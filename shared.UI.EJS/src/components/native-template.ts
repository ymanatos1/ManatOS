import { escapeHtml } from '../rendering/html.js';

/** Read the concrete EJS1 component's HTML template installed by index.ejs.
 * HTML slots are composed only from child renderers; data tokens are escaped here.
 * Missing definitions fail visibly instead of silently fabricating native markup.
 */
export function renderNativeComponent(
  name: string,
  data: Readonly<Record<string, unknown>> = {},
  children: Readonly<Record<string, string>> = {},
): string {
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(name)) throw new Error('Invalid EJS UIS component.');
  const template = document.querySelector<HTMLTemplateElement>(
    `template[data-uis-component-template="${name}"]`,
  );
  if (!template) throw new Error(`Missing EJS UIS component template: ${name}`);
  return template.innerHTML
    .replace(/__UIS_([A-Za-z][A-Za-z0-9]*)__/g, (_match, slot: string) => {
      if (!Object.hasOwn(data, slot)) throw new Error(`Missing ${name} data: ${slot}`);
      return escapeHtml(data[slot]);
    })
    .replace(/<!--\s*UIS:([A-Za-z][A-Za-z0-9]*)\s*-->/g, (_match, slot: string) => {
      if (!Object.hasOwn(children, slot)) throw new Error(`Missing ${name} child: ${slot}`);
      return children[slot];
    });
}

/** Mount a concrete template as a DOM element before attaching its native actions. */
export function createNativeElement(
  name: string,
  data: Readonly<Record<string, unknown>> = {},
  children: Readonly<Record<string, string>> = {},
): HTMLElement {
  const holder = document.createElement('template');
  holder.innerHTML = renderNativeComponent(name, data, children).trim();
  const element = holder.content.firstElementChild;
  if (!(element instanceof HTMLElement) || holder.content.children.length !== 1)
    throw new Error(`EJS UIS template must produce one element: ${name}`);
  return element;
}
