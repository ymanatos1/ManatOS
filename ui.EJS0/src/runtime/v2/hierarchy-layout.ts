import { ctxNodePropertiesOf, withCtxNodeProperties } from './ctx-node-properties.js';
import type { UiLayoutNode, UiLayoutProjection } from './layout.js';

const token = (value: string): string =>
  value
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'member';

const cloneNode = (node: UiLayoutNode): UiLayoutNode =>
  withCtxNodeProperties(
    Object.fromEntries(Object.entries(node).map(([key, child]) => [key, cloneNode(child)])),
    ctxNodePropertiesOf(node),
  );

const rendererNode = (
  key: string,
  kind: 'component' | 'actions',
  rendererRef: string,
  properties: Readonly<Record<string, string | number | boolean | null>> = {},
  children: Readonly<Record<string, UiLayoutNode>> = {},
): UiLayoutNode =>
  withCtxNodeProperties(
    { ...children },
    {
      key,
      kind,
      rendererRef,
      domSelector: `[data-v2-layout-component-instance="${rendererRef.slice('component-instance:'.length).replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"]`,
      ...properties,
    },
  );

/**
 * Inspection projection for the repeated members rendered by a hierarchy component.
 * It enriches the existing canonical #layout component node; it does not create a
 * second debugger/highlighting model and carries no hierarchy mutation semantics.
 */
export const projectHierarchyMembersIntoLayout = (
  layout: UiLayoutProjection,
  entries: readonly Readonly<Record<string, unknown>>[],
  identityField: string,
  parentField: string,
  resolveName?: (row: Readonly<Record<string, unknown>>) => string,
): UiLayoutProjection => {
  const next = cloneNode(layout as UiLayoutNode) as UiLayoutProjection;
  const content = next.content;
  if (!content) return next;
  const contentProperties = ctxNodePropertiesOf(content);
  const hasHierarchyProjection =
    Boolean(content.hierarchy) || contentProperties?.hierarchyMembersProjection === true;
  if (!hasHierarchyProjection) return next;

  const byParent = new Map<string, Readonly<Record<string, unknown>>[]>();
  const ids = new Set(entries.map((row) => String(row[identityField] ?? '')).filter(Boolean));
  for (const row of entries) {
    const parent = String(row[parentField] ?? '');
    const bucket = byParent.get(parent) ?? [];
    bucket.push(row);
    byParent.set(parent, bucket);
  }

  let memberSequence = 0;
  const memberNode = (row: Readonly<Record<string, unknown>>): [string, UiLayoutNode] => {
    const identity = String(row[identityField] ?? '');
    const rendererToken = token(identity);
    const descendants = byParent.get(identity) ?? [];
    const memberKey = `member-${++memberSequence}`;
    return [
      memberKey,
      rendererNode(
        memberKey,
        'component',
        `component-instance:hierarchy-member-${rendererToken}`,
        {
          identity,
          ...(resolveName ? { label: resolveName(row) } : {}),
        },
        Object.fromEntries(descendants.map((child) => memberNode(child))),
      ),
    ];
  };

  const roots = entries.filter((row) => {
    const parent = String(row[parentField] ?? '');
    return !parent || !ids.has(parent);
  });
  const memberNodes = Object.fromEntries(roots.map((row) => memberNode(row)));

  const enrichedContent = withCtxNodeProperties(
    {
      ...Object.fromEntries(
        Object.entries(content)
          .filter(([key]) => key !== 'hierarchy' && !key.startsWith('member-'))
          .map(([key, child]) => [key, cloneNode(child)]),
      ),
      ...memberNodes,
    },
    { ...contentProperties, hierarchyMembersProjection: true },
  );
  const rootProps = ctxNodePropertiesOf(next as UiLayoutNode);
  return withCtxNodeProperties(
    {
      ...Object.fromEntries(
        Object.entries(next).map(([key, child]) => [
          key,
          key === 'content' ? enrichedContent : cloneNode(child),
        ]),
      ),
    },
    rootProps,
  );
};
