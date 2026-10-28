export type UiPageTemplateContext = Readonly<Record<string, unknown>>;

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function property(value: unknown, key: string): unknown {
  if (value === null || value === undefined || typeof value !== 'object') return undefined;

  return (value as Record<string, unknown>)[key];
}

function pathValue(expression: string, context: UiPageTemplateContext): unknown {
  const path = expression.trim();

  if (!path) return undefined;

  if (
    (path.startsWith('"') && path.endsWith('"')) ||
    (path.startsWith("'") && path.endsWith("'"))
  ) {
    return path.slice(1, -1);
  }

  if (path === 'true') return true;
  if (path === 'false') return false;
  if (path === 'null') return null;

  const parts = path.split('.').filter(Boolean);

  let value: unknown = context;

  for (const part of parts) {
    value = property(value, part);
  }

  return value;
}

function pageAsset(value: unknown, context: UiPageTemplateContext): string {
  const source = String(value ?? '').trim();

  if (!source) return '';

  if (/^[a-z][a-z\d+.-]*:/i.test(source) || source.startsWith('//')) {
    return source;
  }

  const base = String(pathValue('$page.resourceBaseUrl', context) ?? '').replace(/\/+$/, '');

  if (!base) {
    throw new Error('ManatOS page asset helper requires a page resource base URL.');
  }

  const relative = source.replace(/^\/+/, '').replace(/^assets\//i, '');
  const segments = relative.split('/').filter(Boolean);

  if (!segments.length || segments.some((segment) => segment === '.' || segment === '..')) {
    throw new Error('Invalid ManatOS page asset path.');
  }

  return `${base}/assets/${segments.map(encodeURIComponent).join('/')}`;
}

function evaluate(expression: string, context: UiPageTemplateContext): unknown {
  const text = expression.trim();
  const coalesce = text.indexOf('??');

  if (coalesce >= 0) {
    const left = evaluate(text.slice(0, coalesce), context);

    return left === null || left === undefined ? evaluate(text.slice(coalesce + 2), context) : left;
  }

  const helper = /^(urlEncode|pageAsset)\((.+)\)$/.exec(text);

  if (helper?.[1] === 'urlEncode') {
    return encodeURIComponent(String(evaluate(helper[2] ?? '', context) ?? ''));
  }

  if (helper?.[1] === 'pageAsset') {
    return pageAsset(evaluate(helper[2] ?? '', context), context);
  }

  return pathValue(text, context);
}

function matchingClose(
  template: string,
  start: number,
  kind: 'if' | 'each',
): { bodyEnd: number; end: number } {
  const open = `{{#${kind}`;
  const close = `{{/${kind}}}`;

  let depth = 1;
  let cursor = start;

  while (cursor < template.length) {
    const nextOpen = template.indexOf(open, cursor);
    const nextClose = template.indexOf(close, cursor);

    if (nextClose < 0) {
      throw new Error(`Unclosed ManatOS template block '${kind}'.`);
    }

    if (nextOpen >= 0 && nextOpen < nextClose) {
      depth += 1;
      cursor = nextOpen + open.length;
      continue;
    }

    depth -= 1;

    if (depth === 0) {
      return {
        bodyEnd: nextClose,
        end: nextClose + close.length,
      };
    }

    cursor = nextClose + close.length;
  }

  throw new Error(`Unclosed ManatOS template block '${kind}'.`);
}

function renderRange(template: string, context: UiPageTemplateContext): string {
  let output = '';
  let cursor = 0;

  while (cursor < template.length) {
    const tokenStart = template.indexOf('{{', cursor);

    if (tokenStart < 0) {
      return output + template.slice(cursor);
    }

    output += template.slice(cursor, tokenStart);

    const tokenEnd = template.indexOf('}}', tokenStart + 2);

    if (tokenEnd < 0) {
      throw new Error('Unclosed ManatOS template expression.');
    }

    const token = template.slice(tokenStart + 2, tokenEnd).trim();

    if (token.startsWith('#if ')) {
      const block = matchingClose(template, tokenEnd + 2, 'if');
      const body = template.slice(tokenEnd + 2, block.bodyEnd);

      if (evaluate(token.slice(4), context)) {
        output += renderRange(body, context);
      }

      cursor = block.end;
      continue;
    }

    if (token.startsWith('#each ')) {
      const match = /^#each\s+(.+?)\s+as\s+([A-Za-z_$][A-Za-z0-9_$]*)$/.exec(token);

      if (!match) {
        throw new Error(`Invalid ManatOS each expression '${token}'.`);
      }

      const block = matchingClose(template, tokenEnd + 2, 'each');
      const body = template.slice(tokenEnd + 2, block.bodyEnd);
      const values = evaluate(match[1] ?? '', context);

      if (Array.isArray(values)) {
        for (const value of values) {
          output += renderRange(
            body,
            Object.freeze({
              ...context,
              [match[2] ?? 'item']: value,
            }),
          );
        }
      }

      cursor = block.end;
      continue;
    }

    if (token.startsWith('/')) {
      throw new Error(`Unexpected ManatOS template close '${token}'.`);
    }

    output += escapeHtml(evaluate(token, context));
    cursor = tokenEnd + 2;
  }

  return output;
}

export function renderUiPageTemplate(template: string, context: UiPageTemplateContext): string {
  return renderRange(template, context);
}
