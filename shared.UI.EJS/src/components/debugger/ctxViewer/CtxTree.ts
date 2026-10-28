import {
  appendContextPathMember,
  tokenizeContextPath,
  type ContextTreeMutation,
} from '@manatos/shared';
import {
  formatCtxValue,
  projectCtxChildren,
  projectCtxNode,
  visitCtxTree,
  type CtxNodeProjection,
  type CtxTreeSource,
} from '@manatos/shared-ui';

interface CtxVisibleRow {
  readonly node: CtxNodeProjection;
  readonly depth: number;
}

export interface CtxTreeState {
  readonly selectedPath: string;
  readonly expandedPaths?: readonly string[];
  readonly watchChangedPath: string | null;
  readonly revealToken: number;
  readonly revision: number;
  readonly revealLastChildFirst?: boolean;
}

export interface CtxTreeOptions {
  readonly expandAllInitially?: boolean;
  readonly expandedPaths?: readonly string[];
  readonly expandedPathsChanged?: (paths: readonly string[]) => void;
  readonly hovered?: (path: string) => void;
  readonly unhovered?: (path: string) => void;
}

export interface CtxTreeController {
  readonly element: HTMLElement;
  update(state: CtxTreeState): void;
  /** Apply the actual committed event; revisions are not a reason to scan hidden CTX. */
  applyMutation(mutation: ContextTreeMutation): void;
  destroy(): void;
}

/**
 * Native-DOM counterpart of NG1's incremental CTX tree.
 *
 * Only currently visible paths and their actual DOM rows are retained. Opening
 * a branch projects its immediate children; closing it drops all descendants.
 * CTX notifications reconcile only the affected visible branch. Existing DOM
 * rows keep their identity, focus and scroll position across unrelated changes.
 */
export function createCtxTree(
  document: Document,
  context: CtxTreeSource,
  rootPath: string,
  onSelected: (path: string) => void,
  options: CtxTreeOptions = {},
): CtxTreeController {
  const abortController = new AbortController();
  const element = document.createElement('div');
  element.className = 'ctx-debug-tree';
  element.dataset.debugFlexiblePanel = '';
  element.dataset.debugFlexiblePreferredHeight = '128';
  element.setAttribute('role', 'tree');
  element.setAttribute('aria-label', 'ManatOS context tree');
  element.dataset.multilingualAriaLabel = 'ManatOsContextTree';

  // NG1 opens the root on first mount even when the saved expansion list is empty.
  // Once the user changes expansion, an empty list can collapse that root.
  const expanded = new Set<string>(
    options.expandedPaths?.length ? options.expandedPaths : [rootPath],
  );
  // The persisted empty expansion list is also the initial/default state. Keep
  // the root open until this viewer has an explicit expansion interaction, as NG1
  // does on its first render. In particular, a second UI-state notification
  // during debugger mounting must not silently collapse the root.
  let expansionWasControlled = Boolean(options.expandedPaths?.length);
  const visiblePaths = new Set<string>();
  const domRows = new Map<string, HTMLElement>();
  let rows: readonly CtxVisibleRow[] = [];
  let state: CtxTreeState = {
    selectedPath: rootPath,
    watchChangedPath: null,
    revealToken: 0,
    revision: 0,
  };

  const belongsTo = (path: string, ancestor: string): boolean =>
    path === ancestor || path.startsWith(ancestor + '.') || path.startsWith(ancestor + '[');

  const parentPath = (path: string): string | null => {
    const members = [...tokenizeContextPath(path)];
    if (!members.length) return null;
    members.pop();
    let parent = 'ctx';
    for (const member of members) parent = appendContextPathMember(parent, member);
    return parent;
  };

  const notifyExpanded = (): void => options.expandedPathsChanged?.([...expanded]);

  const forgetBelow = (path: string): void => {
    let changed = false;
    for (const member of [...expanded]) {
      if (belongsTo(member, path)) {
        expanded.delete(member);
        changed = true;
      }
    }
    if (changed) notifyExpanded();
  };

  const icon = (node: CtxNodeProjection): string => {
    const icons: Readonly<Record<string, string>> = {
      'context-root': 'bi-diagram-3',
      'company-context': 'bi-building',
      'system-context': 'bi-gear',
      'runtime-context': 'bi-activity',
      'subsystems-context': 'bi-boxes',
      subsystem: 'bi-box',
      'entities-context': 'bi-database',
      entity: 'bi-table',
      'enums-context': 'bi-list-check',
      enum: 'bi-list-ul',
      'user-context': 'bi-person-circle',
      'ui-level': 'bi-window',
      flow: 'bi-diagram-3',
      'flow-step': 'bi-bezier2',
      tab: 'bi-window-stack',
      title: 'bi-type-h1',
      column: 'bi-layout-three-columns',
      region: 'bi-border-all',
      component: 'bi-box',
      actions: 'bi-menu-button-wide',
      action: 'bi-cursor',
      collection: 'bi-collection',
      container: 'bi-braces',
      fields: 'bi-ui-checks-grid',
      field: 'bi-input-cursor-text',
      calculated: 'bi-calculator',
      reference: 'bi-link-45deg',
      value: 'bi-dot',
    };
    return icons[node.kind] ?? 'bi-dot';
  };

  /** Patch an existing row without unmounting its listeners or descendants. */
  const drawRow = (line: HTMLElement, row: CtxVisibleRow): void => {
    const node = row.node;
    line.className = 'ctx-debug-row';
    line.classList.toggle('is-selected', node.path === state.selectedPath);
    line.classList.toggle('is-derived', node.calculated);
    line.classList.toggle('is-flow-step', node.kind === 'flow-step');
    line.classList.toggle('is-watch-changed', node.path === state.watchChangedPath);
    line.style.paddingLeft = `${row.depth * 16}px`;
    line.dataset.ctxPath = node.path;
    line.setAttribute('role', 'treeitem');
    line.setAttribute('aria-selected', String(node.path === state.selectedPath));
    if (node.hasChildren) line.setAttribute('aria-expanded', String(expanded.has(node.path)));
    else line.removeAttribute('aria-expanded');
    if (node.value !== undefined && (node.value === null || typeof node.value !== 'object')) {
      line.dataset.debugTooltip = node.tooltipTitle ?? node.key;
      line.dataset.debugTooltipValue = formatCtxValue(node.value);
    } else {
      if (node.tooltipTitle) line.dataset.debugTooltip = node.tooltipTitle;
      else delete line.dataset.debugTooltip;
      delete line.dataset.debugTooltipValue;
    }
    if (node.tooltipDetail) line.dataset.debugTooltipDetail = node.tooltipDetail;
    else delete line.dataset.debugTooltipDetail;
    const toggle = document.createElement('button');
    toggle.className = 'ctx-debug-toggle';
    toggle.type = 'button';
    toggle.disabled = !node.hasChildren;
    toggle.dataset.ctxToggle = node.path;
    if (node.hasChildren) {
      toggle.setAttribute('aria-label', expanded.has(node.path) ? 'Collapse' : 'Expand');
      const toggleIcon = document.createElement('i');
      toggleIcon.className = `bi ${expanded.has(node.path) ? 'bi-caret-down-fill' : 'bi-caret-right-fill'}`;
      toggleIcon.setAttribute('aria-hidden', 'true');
      toggle.append(toggleIcon);
    }
    const nodeIcon = document.createElement('i');
    nodeIcon.className = `bi ${icon(node)} ctx-debug-node-icon`;
    nodeIcon.setAttribute('aria-hidden', 'true');
    const key = document.createElement('span');
    key.className = 'ctx-debug-key';
    key.textContent = node.displayKey ?? node.key;
    line.replaceChildren(toggle, nodeIcon, key);
    if (node.badge) {
      const badge = document.createElement('span');
      badge.className = 'ctx-debug-ui-level-badge';
      badge.classList.toggle('is-flow-badge', node.kind === 'flow-step' || node.kind === 'flow');
      badge.textContent = node.badge;
      line.append(badge);
    }
    if (
      (rootPath === 'ctx' || node.path !== rootPath || !node.hasChildren) &&
      node.preview !== '{0}'
    ) {
      const value = document.createElement('span');
      value.className = 'ctx-debug-value';
      value.textContent = node.preview;
      line.append(value);
    }
  };

  /** Reorder/reuse by canonical path; never rebuild unmodified DOM rows. */
  const publish = (next: readonly CtxVisibleRow[]): void => {
    const paths = new Set(next.map((row) => row.node.path));
    for (const [path, line] of domRows) {
      if (!paths.has(path)) {
        // A removed DOM row may never fire mouseout; clear its active hover.
        options.unhovered?.(path);
        line.remove();
        domRows.delete(path);
      }
    }
    visiblePaths.clear();
    let nextSibling: ChildNode | null = element.firstChild;
    for (const row of next) {
      const path = row.node.path;
      visiblePaths.add(path);
      let line = domRows.get(path);
      if (!line) {
        line = document.createElement('div');
        domRows.set(path, line);
        drawRow(line, row);
      } else {
        const previous = rows.find((item) => item.node.path === path);
        if (!previous || previous.node !== row.node || previous.depth !== row.depth) {
          drawRow(line, row);
        }
      }
      if (line !== nextSibling) element.insertBefore(line, nextSibling);
      nextSibling = line.nextSibling;
    }
    rows = next;
    if (!next.length) {
      const empty = document.createElement('div');
      empty.className = 'ctx-debug-empty';
      empty.textContent = 'CTX path is not currently available.';
      empty.dataset.multilingualText = 'CtxPathUnavailable';
      element.replaceChildren(empty);
    } else {
      element.querySelector('.ctx-debug-empty')?.remove();
    }
  };

  const redrawOpened = (): void => {
    const next: CtxVisibleRow[] = [];
    visitCtxTree(context, rootPath, (node, depth) => {
      next.push({ node, depth });
      return node.hasChildren && expanded.has(node.path) ? 'continue' : 'skip';
    });
    publish(next);
  };

  const refresh = (path: string): void => {
    const index = rows.findIndex((row) => row.node.path === path);
    if (index < 0) return;
    const node = projectCtxNode(context, path);
    if (!node) {
      forgetBelow(path);
      publish(rows.filter((row) => !belongsTo(row.node.path, path)));
      return;
    }
    const next = [...rows];
    next[index] = { node, depth: rows[index]!.depth };
    publish(next);
  };

  /** Project only immediate children of one opened parent, preserving opened grandchildren. */
  const refreshChildren = (path: string): void => {
    const index = rows.findIndex((row) => row.node.path === path);
    if (index < 0) return;
    const parent = rows[index]!;
    const projectedParent = projectCtxNode(context, path);
    if (!projectedParent) {
      refresh(path);
      return;
    }
    if (!expanded.has(path)) {
      refresh(path);
      return;
    }
    const old = rows;
    const oldByPath = new Map(old.map((row, i) => [row.node.path, i] as const));
    const next: CtxVisibleRow[] = [
      ...old.slice(0, index),
      { node: projectedParent, depth: parent.depth },
    ];
    for (const child of projectCtxChildren(context, path)) {
      next.push({ node: child, depth: parent.depth + 1 });
      const oldIndex = oldByPath.get(child.path);
      if (oldIndex === undefined || !expanded.has(child.path)) continue;
      for (let i = oldIndex + 1; i < old.length && old[i]!.depth > parent.depth + 1; i++) {
        if (!belongsTo(old[i]!.node.path, child.path)) break;
        next.push(old[i]!);
      }
    }
    let end = index + 1;
    while (end < old.length && old[end]!.depth > parent.depth) end++;
    next.push(...old.slice(end));
    const retained = new Set(next.map((row) => row.node.path));
    let changed = false;
    for (const member of [...expanded]) {
      if (member !== path && belongsTo(member, path) && !retained.has(member)) {
        expanded.delete(member);
        changed = true;
      }
    }
    if (changed) notifyExpanded();
    publish(next);
  };

  const applyMutation = (mutation: ContextTreeMutation): void => {
    for (const path of mutation.paths) {
      if (mutation.kind === 'set' || mutation.kind === 'set-root-members') {
        if (!visiblePaths.has(path)) continue;
        const opened = expanded.has(path);
        refresh(path);
        if (opened) {
          refreshChildren(path);
          // Whole-container replacement also invalidates expanded descendants.
          for (const child of [...expanded]
            .filter((member) => member !== path && belongsTo(member, path))
            .sort((a, b) => tokenizeContextPath(a).length - tokenizeContextPath(b).length)) {
            if (visiblePaths.has(child) && expanded.has(child)) refreshChildren(child);
          }
        }
        continue;
      }
      const parent = parentPath(path);
      if (mutation.kind === 'delete') {
        if (visiblePaths.has(path)) {
          forgetBelow(path);
          publish(rows.filter((row) => !belongsTo(row.node.path, path)));
        }
        // Deleting an array item shifts numeric paths: reproject the opened array.
        if (parent && Array.isArray(context.get(parent))) {
          for (const member of [...expanded]) {
            if (member !== parent && belongsTo(member, parent)) expanded.delete(member);
          }
          notifyExpanded();
          publish(
            rows.filter((row) => row.node.path === parent || !belongsTo(row.node.path, parent)),
          );
        }
      } else if (visiblePaths.has(path)) refresh(path);
      if (parent && visiblePaths.has(parent)) refreshChildren(parent);
    }
  };

  const toggle = (path: string): void => {
    const node = projectCtxNode(context, path);
    if (!node?.hasChildren) return;
    expansionWasControlled = true;
    if (expanded.has(path)) {
      forgetBelow(path);
      publish(rows.filter((row) => row.node.path === path || !belongsTo(row.node.path, path)));
      refresh(path);
    } else {
      expanded.add(path);
      refreshChildren(path);
      notifyExpanded();
    }
  };

  const expandAncestors = (path: string): void => {
    const members = tokenizeContextPath(path);
    let current = 'ctx';
    let changed = !expanded.has(current);
    expanded.add(current);
    for (const member of members.slice(0, -1)) {
      current = appendContextPathMember(current, member);
      if (!expanded.has(current)) changed = true;
      expanded.add(current);
    }
    if (!expanded.has(rootPath)) changed = true;
    expanded.add(rootPath);
    if (changed) {
      notifyExpanded();
      redrawOpened();
    }
  };

  const revealSelected = (): void => {
    const selected = domRows.get(state.selectedPath);
    if (!selected) return;
    // NG1 first reveals the final namespace of a popup #level, then its title.
    // Use the tree's own scrolling region, never scroll the outer application.
    const reveal = (row: HTMLElement, placement: 'start' | 'end' | 'nearest'): void => {
      const viewport = element.getBoundingClientRect();
      const box = row.getBoundingClientRect();
      // A detached tree or a not-yet-measured viewport has no usable scroll
      // geometry. Fall back to native row reveal; in a measured debugger tree,
      // keep scrolling confined to the tree instead of the application page.
      if (!element.isConnected || viewport.height <= 0) {
        row.scrollIntoView?.({ block: placement, inline: 'nearest' });
        return;
      }
      if (placement === 'start') element.scrollTop += box.top - viewport.top;
      else if (placement === 'end') element.scrollTop += box.bottom - viewport.bottom;
      else if (box.top < viewport.top) element.scrollTop += box.top - viewport.top;
      else if (box.bottom > viewport.bottom) element.scrollTop += box.bottom - viewport.bottom;
    };
    if (state.revealLastChildFirst) {
      const last = domRows.get(appendContextPathMember(state.selectedPath, 'data'));
      if (last) reveal(last, 'end');
      reveal(selected, 'start');
    } else reveal(selected, 'nearest');
  };

  element.addEventListener(
    'click',
    (event) => {
      const target = event.target as Element;
      const path = target.closest<HTMLElement>('[data-ctx-toggle]')?.dataset.ctxToggle;
      if (path) {
        event.stopPropagation();
        toggle(path);
        return;
      }
      const selected = target.closest<HTMLElement>('[data-ctx-path]')?.dataset.ctxPath;
      if (selected) onSelected(selected);
    },
    { signal: abortController.signal },
  );
  element.addEventListener(
    'dblclick',
    (event) => {
      const target = event.target as Element;
      if (target.closest('[data-ctx-toggle]')) return;
      const path = target.closest<HTMLElement>('[data-ctx-path]')?.dataset.ctxPath;
      if (path) toggle(path);
    },
    { signal: abortController.signal },
  );
  element.addEventListener(
    'mouseover',
    (event) => {
      const target = event.target as Element;
      const line = target.closest<HTMLElement>('[data-ctx-path]');
      if (line && !line.contains(event.relatedTarget as Node | null)) {
        const path = line.dataset.ctxPath;
        if (path) options.hovered?.(path);
      }
    },
    { signal: abortController.signal },
  );
  element.addEventListener(
    'mouseout',
    (event) => {
      const target = event.target as Element;
      const line = target.closest<HTMLElement>('[data-ctx-path]');
      if (line && !line.contains(event.relatedTarget as Node | null)) {
        const path = line.dataset.ctxPath;
        if (path) options.unhovered?.(path);
      }
    },
    { signal: abortController.signal },
  );

  if (options.expandAllInitially) {
    visitCtxTree(context, rootPath, (node) => {
      if (node.hasChildren) expanded.add(node.path);
    });
  }
  redrawOpened();
  return {
    element,
    applyMutation,
    update(nextState) {
      const previousSelected = state.selectedPath;
      const previousWatch = state.watchChangedPath;
      const previousToken = state.revealToken;
      state = nextState;
      if (state.expandedPaths) {
        const incoming = new Set(state.expandedPaths);
        if (!expansionWasControlled && incoming.size === 0) incoming.add(rootPath);
        if (incoming.size !== expanded.size || [...incoming].some((path) => !expanded.has(path))) {
          expanded.clear();
          for (const path of incoming) expanded.add(path);
          redrawOpened();
        }
      }
      // Selection/watch changes need only restyle two previously rendered rows.
      for (const path of new Set([
        previousSelected,
        state.selectedPath,
        previousWatch,
        state.watchChangedPath,
      ])) {
        if (!path) continue;
        const existing = domRows.get(path);
        const row = rows.find((candidate) => candidate.node.path === path);
        if (existing && row) drawRow(existing, row);
      }
      if (state.revealToken !== previousToken) expandAncestors(state.selectedPath);
      if (state.selectedPath !== previousSelected || state.revealToken !== previousToken)
        queueMicrotask(revealSelected);
    },
    destroy() {
      abortController.abort();
      element.replaceChildren();
      domRows.clear();
      visiblePaths.clear();
      expanded.clear();
      rows = [];
    },
  };
}
