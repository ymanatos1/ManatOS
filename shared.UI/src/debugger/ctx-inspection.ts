import { UI_LAYOUT_NODE_PROPERTIES } from '../runtime/layout/node.js';

import {
  appendContextPathMember,
  contextCollectionMemberKey,
  tokenizeContextPath,
  type ContextTreeRuntime,
  type ContextTreeSubscriptionInfo,
} from '@manatos/shared';

export type CtxNodeType =
  | 'null'
  | 'undefined'
  | 'array'
  | 'object'
  | 'string'
  | 'number'
  | 'boolean'
  | 'bigint'
  | 'function'
  | 'symbol';

/** Minimal read-only CTX source needed by reusable tree projections. */
export interface CtxTreeSource {
  get(path: string): unknown;
  describe(path: string): import('@manatos/shared').ContextTreeNodeDescription | null;
}

export interface CtxNodeProjection {
  readonly key: string;
  readonly path: string;
  readonly type: CtxNodeType;
  readonly value: unknown;
  readonly preview: string;
  readonly childCount: number;
  readonly hasChildren: boolean;
  readonly kind: string;
  readonly calculated: boolean;
  readonly pointer: boolean;
  readonly badge?: string;
  /** Viewer-only semantic label; never used in canonical CTX paths. */
  readonly displayKey?: string;
  /** UI component identity and brief role, independent of framework renderer. */
  readonly tooltipTitle?: string;
  readonly tooltipDetail?: string;
}

export interface CtxPropertyRow {
  readonly name: string;
  readonly value: string;
  readonly path?: string;
}

export interface CtxNodePropertiesProjection {
  readonly main: readonly CtxPropertyRow[];
  readonly properties: readonly CtxPropertyRow[];
  readonly attributes: readonly CtxPropertyRow[];
  readonly subscribers: readonly ContextTreeSubscriptionInfo[];
  readonly subscriberRegistrations: readonly CtxSubscriberProjection[];
}

export type CtxSubscriberMatch = 'direct' | 'dependent' | 'global';

export interface CtxSubscriberProjection extends ContextTreeSubscriptionInfo {
  readonly match: CtxSubscriberMatch;
  readonly displayPath: string;
}

export interface CtxSearchResult {
  readonly path: string;
  readonly key: string;
  readonly preview: string;
}

export type CtxTreeVisitDecision = 'continue' | 'skip' | 'stop';

export type CtxTreeVisitor = (
  node: CtxNodeProjection,
  depth: number,
) => CtxTreeVisitDecision | void;

const ROOT_ORDER = ['company', 'system', 'runtime', 'flow', 'enums', 'entities', 'user'];
/** Display paths prefer the nearest public alias; canonical paths remain unchanged. */
export function formatCtxPath(path: string): string {
  if (path === 'ctx') return '$';
  if (!path.startsWith('ctx.') && !path.startsWith('ctx[')) return path;
  const aliases: readonly [string, string][] = [
    ['ctx.runtime.entities', '$entities'],
    ['ctx.runtime.enums', '$enums'],
    ['ctx.runtime.user', '$user'],
    ['ctx.entities', '$entities'],
    ['ctx.enums', '$enums'],
    ['ctx.user', '$user'],
    ['ctx.ui', '$ui'],
    ['ctx.flow', '$flow'],
    ['ctx.company', '$company'],
    ['ctx.system', '$system'],
    ['ctx.runtime', '$runtime'],
  ];
  for (const [prefix, alias] of aliases) {
    if (path === prefix || path.startsWith(prefix + '.') || path.startsWith(prefix + '['))
      return alias + path.slice(prefix.length);
  }
  return '$' + path.slice(3);
}

/** Resolve a stale debugger selection to the closest still-existing ancestor. */
export function nearestExistingCtxPath(
  runtime: CtxTreeSource,
  path: string,
  minimumPath = 'ctx',
): string {
  const minimumMembers = tokenizeContextPath(minimumPath);
  const members = [...tokenizeContextPath(path)];

  while (members.length >= minimumMembers.length) {
    let candidate = 'ctx';
    for (const member of members) candidate = appendContextPathMember(candidate, member);
    if (candidate === 'ctx' || runtime.get(candidate) !== undefined) return candidate;
    members.pop();
  }

  return minimumPath;
}

/** Choose a stable CLI execution root. Scalar selections start from their parent container. */
export function ctxCliRootPath(
  runtime: CtxTreeSource,
  selectedPath: string,
  minimumPath = 'ctx',
): string {
  const resolved = nearestExistingCtxPath(runtime, selectedPath, minimumPath);
  const value = runtime.get(resolved);
  if (resolved === minimumPath || (value !== null && typeof value === 'object')) return resolved;

  const members = [...tokenizeContextPath(resolved)];
  const minimumMembers = tokenizeContextPath(minimumPath);
  if (members.length <= minimumMembers.length) return minimumPath;
  members.pop();

  let parent = 'ctx';
  for (const member of members) parent = appendContextPathMember(parent, member);
  return parent;
}

function displayValue(value: unknown, maxLength = 160): string {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (typeof value === 'string')
    return JSON.stringify(value.length > maxLength ? `${value.slice(0, maxLength)}…` : value);
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint')
    return String(value);
  if (typeof value === 'function') return '[Function]';
  if (typeof value === 'symbol') return String(value);
  if (Array.isArray(value)) return `Array(${value.length})`;
  return `{${Object.keys(value as Record<string, unknown>).length}}`;
}

function propertyValue(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (typeof value === 'string') return value;
  return displayValue(value);
}

function childPath(parentPath: string, key: string, value: unknown, index?: number): string {
  if (index !== undefined && Array.isArray(value)) return `${parentPath}[${index}]`;
  return appendContextPathMember(parentPath, key);
}

function orderedObjectEntries(path: string, value: Record<string, unknown>): [string, unknown][] {
  const entries = Object.entries(value);
  if (path !== 'ctx') return entries;
  return entries.sort(([left], [right]) => {
    const leftIndex = ROOT_ORDER.indexOf(left);
    const rightIndex = ROOT_ORDER.indexOf(right);
    if (leftIndex < 0 && rightIndex < 0) return 0;
    if (leftIndex < 0) return 1;
    if (rightIndex < 0) return -1;
    return leftIndex - rightIndex;
  });
}

/** A deliberately small shared semantic description catalogue. No separate viewer registry. */
const LAYOUT_ROLE: Readonly<Record<string, string>> = {
  List: 'List content and component layout.',
  ListHeader: 'Entry count and List toolbar controls.',
  ListColumnsRow: 'Column headers and sorting controls.',
  ListColumnHeader: 'Column label and sorting control.',
  ListRow: 'One record in the List.',
  ListCell: 'Presentation of one record field.',
  ListPagination: 'Page navigation and page-size controls.',
  Entry: 'Entry record content and tab layout.',
  EntryTab: 'A metadata-defined Entry tab and its fields.',
  EntryField: 'One canonical record field.',
};
function semanticPresentation(
  runtime: CtxTreeSource,
  path: string,
  key: string,
): {
  displayKey?: string;
  tooltipTitle?: string;
  tooltipDetail?: string;
} {
  const marker = path.indexOf('.layout.');
  if (marker < 0) return {};
  const layoutRoot = path.slice(0, marker + '.layout'.length);
  let cursor = path;
  let properties: { rendererRef?: string } | undefined;
  while (cursor.length > layoutRoot.length) {
    const value = runtime.get(cursor);
    if (value && typeof value === 'object') {
      properties = (value as Record<symbol, unknown>)[UI_LAYOUT_NODE_PROPERTIES] as
        { rendererRef?: string } | undefined;
      if (properties?.rendererRef) break;
    }
    cursor = cursor.slice(0, cursor.lastIndexOf('.'));
  }
  if (!properties?.rendererRef) return {};
  const ref = properties.rendererRef;
  const component = ref.split(':').at(-1) ?? '';
  let base = component.replace(/\d+$/, '');
  if (ref.startsWith('entry:') && base === 'Tab') base = 'EntryTab';
  if (ref.startsWith('entry:') && base === 'Field') base = 'EntryField';
  const ownNode = cursor === path;
  const parent = path.slice(0, path.lastIndexOf('.'));
  const inColumns = /\.ListColumnsRow$/.test(parent);
  const inRows = /\.rows$/.test(parent);
  let displayKey: string | undefined;
  if (ownNode && component === 'ListHeader') displayKey = 'header';
  else if (ownNode && component === 'ListColumnsRow') displayKey = 'columns';
  else if (ownNode && component === 'ListPagination') displayKey = 'pagination';
  else if (ownNode && inColumns && base === 'ListColumnHeader')
    displayKey = `[${component.slice('ListColumnHeader'.length)}]`;
  else if (ownNode && inRows && base === 'ListRow')
    displayKey = `[${component.slice('ListRow'.length)}]`;
  else if (ownNode && base === 'ListCell') displayKey = `cell${component.slice('ListCell'.length)}`;
  else if (ownNode && base === 'EntryTab') displayKey = `[${component.slice('Tab'.length)}]`;
  else if (ownNode && base === 'EntryField') displayKey = `field${component.slice('Field'.length)}`;
  const role = LAYOUT_ROLE[base] ?? 'UI Surface component.';
  return {
    ...(displayKey ? { displayKey } : {}),
    tooltipTitle: ownNode ? base : key,
    tooltipDetail: ownNode ? role : `${base} — ${role}`,
  };
}

function projectNode(
  runtime: CtxTreeSource,
  path: string,
  key: string,
  value: unknown,
): CtxNodeProjection {
  const description = runtime.describe(path);
  if (!description) throw new Error('CTX node disappeared during projection: ' + path);
  return Object.freeze({
    key,
    path,
    type: description.type as CtxNodeType,
    value,
    preview: displayValue(value),
    childCount: description.childCount,
    hasChildren: description.childCount > 0,
    kind: description.kind,
    calculated: description.calculated,
    pointer: description.pointer,
    ...(description.badge ? { badge: description.badge } : {}),
    ...semanticPresentation(runtime, path, key),
  });
}

/** Framework-independent live CTX children projection. */
export function projectCtxChildren(
  runtime: CtxTreeSource,
  parentPath: string,
): readonly CtxNodeProjection[] {
  const value = runtime.get(parentPath);
  if (!value || typeof value !== 'object') return [];

  if (Array.isArray(value)) {
    const semanticKeys = value.map(contextCollectionMemberKey);
    const frequencies = new Map<string, number>();
    for (const key of semanticKeys) if (key) frequencies.set(key, (frequencies.get(key) ?? 0) + 1);
    return value.map((item, index) => {
      const semanticKey = semanticKeys[index];
      const uniqueSemanticKey =
        semanticKey && frequencies.get(semanticKey) === 1 ? semanticKey : null;
      const key = uniqueSemanticKey ? `[${uniqueSemanticKey}]` : `[${index}]`;
      const path = uniqueSemanticKey
        ? appendContextPathMember(parentPath, uniqueSemanticKey)
        : `${parentPath}[${index}]`;
      return projectNode(runtime, path, key, item);
    });
  }

  return orderedObjectEntries(parentPath, value as Record<string, unknown>).map(([key, item]) =>
    projectNode(
      runtime,
      childPath(parentPath, key, item),
      Array.isArray(item) ? `${key}[]` : key,
      item,
    ),
  );
}

export function projectCtxNode(runtime: CtxTreeSource, path: string): CtxNodeProjection | null {
  const value = runtime.get(path);
  if (value === undefined && path !== 'ctx') return null;
  const key =
    path === 'ctx'
      ? '$'
      : (path
          .replace(/^ctx\.?/, '')
          .split(/\.|\[/)
          .filter(Boolean)
          .at(-1) ?? '$');
  return projectNode(runtime, path, key, value);
}

/**
 * Traverse the projected CTX path tree depth-first.
 *
 * Object identity is tracked only along the active ancestor chain. This stops
 * genuine circular references while still allowing the same object to appear
 * under multiple legitimate CTX paths (for example runtime members and their
 * root compatibility aliases).
 */
export function visitCtxTree(
  runtime: CtxTreeSource,
  rootPath: string,
  visitor: CtxTreeVisitor,
): void {
  const root = projectCtxNode(runtime, rootPath);
  if (!root) return;

  const ancestors = new Set<object>();

  const visit = (node: CtxNodeProjection, depth: number): boolean => {
    const decision = visitor(node, depth) ?? 'continue';
    if (decision === 'stop') return false;
    if (decision === 'skip' || !node.hasChildren) return true;

    const value = node.value;
    if (!value || typeof value !== 'object') return true;
    if (ancestors.has(value)) return true;

    ancestors.add(value);
    try {
      for (const child of projectCtxChildren(runtime, node.path)) {
        if (!visit(child, depth + 1)) return false;
      }
    } finally {
      ancestors.delete(value);
    }

    return true;
  };

  visit(root, 0);
}

export function projectCtxNodeProperties<TRoot extends object>(
  runtime: ContextTreeRuntime<TRoot>,
  path: string,
): CtxNodePropertiesProjection {
  const node = projectCtxNode(runtime, path);
  if (!node) {
    return Object.freeze({
      main: [],
      properties: [],
      attributes: [],
      subscribers: [],
      subscriberRegistrations: [],
    });
  }

  const value = node.value;
  const isContainer = value !== null && typeof value === 'object';
  const javascriptType = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
  const main: CtxPropertyRow[] = [
    { name: 'Kind', value: node.kind },
    { name: 'Type', value: node.type },
    { name: 'Watchable', value: value === undefined ? 'no' : 'yes' },
    { name: 'JavaScript type', value: javascriptType },
    { name: 'Value', value: isContainer ? '' : propertyValue(value) },
    { name: 'Children', value: String(node.childCount) },
  ];

  /* CTX children remain data. Only genuine modern-runtime semantics belong here. */
  const properties: CtxPropertyRow[] = [];

  // Expose semantic popup layout metadata as node properties,
  // without making that metadata ordinary CTX child nodes.
  if (path.includes('.layout') && node.value && typeof node.value === 'object') {
    const metadata = (node.value as Record<symbol, Record<string, unknown> | undefined>)[
      Symbol.for('manatos.ctx.node-properties')
    ];

    for (const [name, value] of Object.entries(metadata ?? {})) {
      properties.push({ name, value: String(value) });
    }
  }

  const attributes: CtxPropertyRow[] = [];

  const canonicalAlias = canonicalCompatibilityAlias(runtime, path);
  if (canonicalAlias) {
    properties.push({
      name: 'Canonical path',
      value: formatCtxPath(canonicalAlias),
      path: canonicalAlias,
    });
    attributes.push({ name: 'Compatibility alias', value: 'yes' });
  }

  if (node.calculated && value && typeof value === 'object') {
    properties.push({
      name: 'Expression',
      value: String((value as Record<string, unknown>).expression ?? ''),
    });
    attributes.push({ name: 'Calculated', value: 'yes' });
  }

  if (node.pointer && value && typeof value === 'object') {
    properties.push({
      name: 'Pointer value',
      value: displayValue((value as Record<string, unknown>).value),
    });
    attributes.push({ name: 'Pointer', value: 'yes' });
  }

  const subscribers = runtime.subscriptionInfo(path);

  return Object.freeze({
    main: Object.freeze(main),
    properties: Object.freeze(properties),
    attributes: Object.freeze(attributes),
    subscribers,
    subscriberRegistrations: Object.freeze(
      subscribers.map((subscriber) =>
        Object.freeze({
          ...subscriber,
          match: subscriberMatch(subscriber, canonicalAlias ?? path),
          displayPath: subscriber.path ? formatCtxPath(subscriber.path) : '*',
        }),
      ),
    ),
  });
}

function canonicalCompatibilityAlias<TRoot extends object>(
  runtime: ContextTreeRuntime<TRoot>,
  path: string,
): string | null {
  const aliases = [
    ['ctx.entities', 'ctx.runtime.entities'],
    ['ctx.enums', 'ctx.runtime.enums'],
    ['ctx.user', 'ctx.runtime.user'],
  ] as const;
  const mapping = aliases.find(
    ([alias]) => path === alias || path.startsWith(`${alias}.`) || path.startsWith(`${alias}[`),
  );
  if (!mapping) return null;

  const [alias, canonicalRoot] = mapping;
  const canonical = `${canonicalRoot}${path.slice(alias.length)}`;
  return runtime.get(path) === runtime.get(canonical) ? canonical : null;
}

function subscriberMatch(
  subscriber: ContextTreeSubscriptionInfo,
  selectedPath: string,
): CtxSubscriberMatch {
  if (!subscriber.path) return 'global';
  if (subscriber.path === selectedPath) return 'direct';
  return 'dependent';
}

export type CtxSearchMode = 'key' | 'value' | 'both';
export type CtxSearchSyntax = 'wildcard' | 'regex';

export interface CtxSearchOptions {
  readonly mode?: CtxSearchMode;
  readonly syntax?: CtxSearchSyntax;
  readonly limit?: number;
}

function wildcardPattern(term: string): string {
  return term
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
}

function searchMatcher(
  query: string,
  syntax: CtxSearchSyntax,
): ((candidate: string) => boolean) | null {
  const term = query.trim();
  if (!term) return null;

  if (syntax === 'regex') {
    try {
      const regex = new RegExp(term, 'i');
      return (candidate) => regex.test(candidate);
    } catch {
      return null;
    }
  }

  if (term.includes('*') || term.includes('?')) {
    const regex = new RegExp(`^${wildcardPattern(term)}$`, 'i');
    return (candidate) => regex.test(candidate);
  }

  const normalized = term.toLocaleLowerCase();
  return (candidate) => candidate.toLocaleLowerCase().includes(normalized);
}

function searchableValue(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  return '';
}

export function searchCtx<TRoot extends object>(
  runtime: ContextTreeRuntime<TRoot>,
  rootPath: string,
  query: string,
  options: CtxSearchOptions = {},
): readonly CtxSearchResult[] {
  const matcher = searchMatcher(query, options.syntax ?? 'wildcard');
  if (!matcher) return [];

  const mode = options.mode ?? 'both';
  const limit = Math.max(1, options.limit ?? 250);
  const results: CtxSearchResult[] = [];

  visitCtxTree(runtime, rootPath, (node) => {
    if (results.length >= limit) return 'stop';
    const key = node.path === rootPath && rootPath !== 'ctx' ? rootPath : node.key;
    const byKey = mode !== 'value' && matcher(key);
    const byValue = mode !== 'key' && matcher(searchableValue(node.value));
    if (byKey || byValue) {
      results.push(Object.freeze({ path: node.path, key, preview: node.preview }));
      if (results.length >= limit) return 'stop';
    }
    return 'continue';
  });

  return Object.freeze(results);
}

export function formatCtxValue(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
