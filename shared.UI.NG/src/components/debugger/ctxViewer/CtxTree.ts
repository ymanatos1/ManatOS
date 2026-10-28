import {
  AfterViewChecked,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  OnChanges,
  output,
  signal,
  SimpleChanges,
  OnDestroy,
} from '@angular/core';

import { DOCUMENT } from '@angular/common';
import { UiSurfaceLayoutHighlight } from '@manatos/shared-ui';

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
  multilingual,
} from '@manatos/shared-ui';

interface CtxVisibleRow {
  readonly node: CtxNodeProjection;
  readonly depth: number;
}

@Component({
  selector: 'manatos-ctx-tree',
  standalone: true,
  templateUrl: './CtxTree.html',
  styleUrl: './CtxTree.css',
  host: {
    'data-debug-flexible-panel': '',
    'data-debug-flexible-preferred-height': '128',
  },
})
export class CtxTree implements AfterViewChecked, OnChanges, OnDestroy {
  protected readonly multilingual = computed(() =>
    multilingual(this.language(), ['ManatOsContextTree', 'CtxPathUnavailable'] as const),
  );

  readonly language = input<'EN' | 'EL'>('EN');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly layoutHighlight = new UiSurfaceLayoutHighlight(inject(DOCUMENT));

  readonly context = input.required<CtxTreeSource>();
  readonly rootPath = input.required<string>();
  readonly expandAllInitially = input(false);
  readonly expandedPaths = input<readonly string[] | null>(null);
  readonly selectedPath = input.required<string>();
  readonly watchChangedPath = input<string | null>(null);
  readonly revealToken = input(0);
  readonly revealLastChildFirst = input(false);
  readonly layoutHighlightEnabled = input(true);
  readonly revision = input.required<number>();
  readonly selected = output<string>();
  readonly expandedPathsChanged = output<readonly string[]>();

  protected readonly expanded = signal<ReadonlySet<string>>(new Set());
  private lastRevealToken = -1;
  private expandedAllContext: CtxTreeSource | null = null;
  private expandedAllRootPath = '';

  protected readonly effectiveExpanded = computed<ReadonlySet<string>>(() => this.expanded());

  /** Only displayed paths are indexed. No hidden CTX descendants are retained. */
  private readonly visiblePaths = new Set<string>();
  protected readonly rows = signal<readonly CtxVisibleRow[]>([]);

  private redrawOpened(): void {
    const next: CtxVisibleRow[] = [];
    visitCtxTree(this.context(), this.rootPath(), (node, depth) => {
      next.push({ node, depth });
      return node.hasChildren && this.effectiveExpanded().has(node.path) ? 'continue' : 'skip';
    });
    this.publish(next);
  }

  private publish(rows: readonly CtxVisibleRow[]): void {
    this.visiblePaths.clear();
    for (const row of rows) this.visiblePaths.add(row.node.path);
    this.layoutHighlight.pruneVisiblePaths(this.visiblePaths);
    this.rows.set(rows);
  }

  private parentPath(path: string): string | null {
    const members = [...tokenizeContextPath(path)];
    if (!members.length) return null;
    members.pop();
    let parent = 'ctx';
    for (const member of members) parent = appendContextPathMember(parent, member);
    return parent;
  }

  private belongsTo(path: string, ancestor: string): boolean {
    return path === ancestor || path.startsWith(ancestor + '.') || path.startsWith(ancestor + '[');
  }

  private forgetBelow(path: string): void {
    const expanded = new Set(this.expanded());
    for (const value of expanded) if (this.belongsTo(value, path)) expanded.delete(value);
    this.expanded.set(expanded);
    this.expandedPathsChanged.emit([...expanded]);
  }

  /** Reread only the affected visible path, never an unrelated CTX branch. */
  private refresh(path: string): void {
    const rows = this.rows();
    const index = rows.findIndex((row) => row.node.path === path);
    if (index < 0) return;
    const node = projectCtxNode(this.context(), path);
    if (!node) {
      this.remove(path);
      return;
    }
    const next = [...rows];
    next[index] = { node, depth: rows[index]!.depth };
    this.publish(next);
  }

  private remove(path: string): void {
    if (!this.visiblePaths.has(path)) return;
    this.forgetBelow(path);
    this.publish(this.rows().filter((row) => !this.belongsTo(row.node.path, path)));
  }

  /** Reconcile immediate children of one visible expanded parent, preserving
   * unaffected rows and their Angular track-by identities. */
  private refreshChildren(parentPath: string): void {
    if (!this.visiblePaths.has(parentPath)) return;
    const rows = this.rows();
    const parentIndex = rows.findIndex((row) => row.node.path === parentPath);
    if (parentIndex < 0) return;
    const parent = rows[parentIndex]!;
    const projectedParent = projectCtxNode(this.context(), parentPath);
    if (!projectedParent) {
      this.remove(parentPath);
      return;
    }
    if (!this.effectiveExpanded().has(parentPath)) {
      this.refresh(parentPath);
      return;
    }

    const children = projectCtxChildren(this.context(), parentPath);
    const byPath = new Map(rows.map((row, index) => [row.node.path, index] as const));
    const next: CtxVisibleRow[] = rows.slice(0, parentIndex);
    next.push({ node: projectedParent, depth: parent.depth });
    for (const child of children) {
      const existing = byPath.get(child.path);
      if (existing === undefined) {
        next.push({ node: child, depth: parent.depth + 1 });
        continue;
      }
      next.push({ node: child, depth: parent.depth + 1 });
      // Retain any still-visible expanded descendants of the existing child.
      for (let i = existing + 1; i < rows.length && rows[i]!.depth > parent.depth + 1; i++) {
        if (this.belongsTo(rows[i]!.node.path, child.path)) next.push(rows[i]!);
        else break;
      }
    }
    let end = parentIndex + 1;
    while (end < rows.length && rows[end]!.depth > parent.depth) end++;
    next.push(...rows.slice(end));
    const nextPaths = new Set(next.map((row) => row.node.path));
    const expanded = new Set(this.expanded());
    let forgotten = false;
    for (const path of expanded) {
      if (this.belongsTo(path, parentPath) && path !== parentPath && !nextPaths.has(path)) {
        expanded.delete(path);
        forgotten = true;
      }
    }
    if (forgotten) {
      this.expanded.set(expanded);
      this.expandedPathsChanged.emit([...expanded]);
    }
    this.publish(next);
  }

  /** Apply each committed CTX event synchronously; Angular change-detection
   * batching must not discard earlier mutations to different visible paths. */
  applyMutation(mutation: ContextTreeMutation): void {
    for (const path of mutation.paths) {
      if (mutation.kind === 'set' || mutation.kind === 'set-root-members') {
        if (!this.visiblePaths.has(path)) continue;
        // A value update must not discard descendants merely because its
        // container is expanded. Reread the changed row and reconcile the
        // currently opened branch against live CTX; refreshChildren preserves
        // existing visible descendants by canonical path.
        const wasExpanded = this.effectiveExpanded().has(path);
        this.refresh(path);
        if (wasExpanded) {
          this.refreshChildren(path);
          // A set() may replace a whole container. Recheck only descendants
          // that are still visible and expanded; removed paths are forgotten
          // by refreshChildren instead of retaining stale row projections.
          const opened = [...this.expanded()]
            .filter((candidate) => candidate !== path && this.belongsTo(candidate, path))
            .sort((a, b) => tokenizeContextPath(a).length - tokenizeContextPath(b).length);
          for (const candidate of opened)
            if (this.visiblePaths.has(candidate) && this.expanded().has(candidate))
              this.refreshChildren(candidate);
        }
        continue;
      }
      const parent = this.parentPath(path);
      if (mutation.kind === 'delete') {
        if (this.visiblePaths.has(path)) this.remove(path);
        // Removing an array member shifts subsequent numeric paths: old rows
        // and their descendants must not survive under a different item.
        if (parent && Array.isArray(this.context().get(parent))) {
          const expanded = new Set(this.expanded());
          let changed = false;
          for (const key of expanded)
            if (key !== parent && this.belongsTo(key, parent)) {
              expanded.delete(key);
              changed = true;
            }
          if (changed) {
            this.expanded.set(expanded);
            this.expandedPathsChanged.emit([...expanded]);
          }
          const old = this.rows();
          const parentRow = old.find((row) => row.node.path === parent);
          if (parentRow)
            this.publish(
              old.filter(
                (row) => row.node.path === parent || !this.belongsTo(row.node.path, parent),
              ),
            );
        }
        if (parent && this.visiblePaths.has(parent)) this.refreshChildren(parent);
      } else {
        if (this.visiblePaths.has(path)) this.refresh(path);
        if (parent && this.visiblePaths.has(parent)) this.refreshChildren(parent);
      }
    }
  }

  protected toggle(row: CtxVisibleRow, event: MouseEvent): void {
    event.stopPropagation();
    if (!row.node.hasChildren) return;
    const next = new Set(this.expanded());
    if (next.has(row.node.path)) {
      for (const path of next) if (this.belongsTo(path, row.node.path)) next.delete(path);
      this.expanded.set(next);
      const rows = this.rows();
      const index = rows.findIndex((item) => item.node.path === row.node.path);
      if (index >= 0) {
        let end = index + 1;
        while (end < rows.length && rows[end]!.depth > row.depth) end++;
        this.publish([...rows.slice(0, index + 1), ...rows.slice(end)]);
      }
    } else {
      next.add(row.node.path);
      this.expanded.set(next);
      this.refreshChildren(row.node.path);
    }
    this.expandedPathsChanged.emit([...next]);
  }

  protected select(path: string): void {
    this.layoutHighlight.select(path, this.context());
    this.selected.emit(path);
  }

  protected hover(path: string): void {
    this.layoutHighlight.enter(path, this.context());
  }

  protected unhover(path: string): void {
    this.layoutHighlight.leave(path);
  }

  protected tooltipTitle(node: CtxNodeProjection): string | null {
    return node.tooltipTitle ?? (this.hasTooltipValue(node) ? node.key : null);
  }

  protected tooltipDetail(node: CtxNodeProjection): string | null {
    return node.tooltipDetail ?? null;
  }

  protected tooltipValue(node: CtxNodeProjection): string | null {
    return this.hasTooltipValue(node) ? formatCtxValue(node.value) : null;
  }

  protected icon(node: CtxNodeProjection): string {
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
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['layoutHighlightEnabled']) {
      this.layoutHighlight.setEnabled(this.layoutHighlightEnabled());
    }

    if (changes['expandedPaths'] && this.expandedPaths() !== null) {
      const incoming = new Set(this.expandedPaths() ?? []);
      const current = this.expanded();
      // Output echo from parent does not require a second traversal.
      if (incoming.size !== current.size || [...incoming].some((path) => !current.has(path))) {
        this.expanded.set(incoming);
        this.redrawOpened();
      }
    }
    // Preserve the historical initial open root; unlike before, the root is
    // subsequently collapsible and does not force any descendant expansion.
    if (changes['rootPath'] && changes['rootPath'].firstChange && this.expanded().size === 0) {
      this.expanded.set(new Set([this.rootPath()]));
    }

    if (this.expandAllInitially()) {
      const context = this.context();
      const rootPath = this.rootPath();
      if (context !== this.expandedAllContext || rootPath !== this.expandedAllRootPath) {
        this.expandAllNodes();
        this.expandedAllContext = context;
        this.expandedAllRootPath = rootPath;
      }
    }

    if (changes['selectedPath'] || changes['revision'] || changes['rootPath']) {
      this.layoutHighlight.sync(this.selectedPath(), this.context());
    }

    if (changes['context'] || changes['rootPath']) this.redrawOpened();

    if (changes['revealToken'] && !changes['revealToken'].firstChange) {
      this.expandAncestors(this.selectedPath());
    }
  }

  ngOnDestroy(): void {
    this.layoutHighlight.dispose();
  }

  ngAfterViewChecked(): void {
    const token = this.revealToken();
    if (token === this.lastRevealToken) return;
    this.lastRevealToken = token;

    // Wait for the debugger tab and expanded CTX rows to render.
    // Use the owning document because the debugger may be detached.
    const owner = this.host.nativeElement.ownerDocument.defaultView;

    owner?.requestAnimationFrame(() => {
      if (this.revealToken() !== token) return;
      this.revealSelected();
    });
  }

  /**
   * Reveal a selected CTX row within the tree scroll container.
   *
   * For popup #level inspection, reach its last direct namespace
   * (#data) first, then return to #level itself.
   *
   * No temporary selection, history entry, or outer-page scrolling.
   */
  private revealSelected(): void {
    const scroller = this.host.nativeElement.querySelector<HTMLElement>('.ctx-debug-tree');
    if (!scroller) return;

    const path = this.selectedPath();
    const rows = Array.from(scroller.querySelectorAll<HTMLElement>('[data-ctx-path]'));

    const findRow = (targetPath: string): HTMLElement | undefined =>
      rows.find((row) => row.dataset['ctxPath'] === targetPath);

    const selected = findRow(path);
    if (!selected) return;

    const scrollToRow = (row: HTMLElement, position: 'start' | 'end' | 'nearest'): void => {
      const viewport = scroller.getBoundingClientRect();
      const target = row.getBoundingClientRect();

      if (position === 'start') {
        scroller.scrollTop += target.top - viewport.top;
      } else if (position === 'end') {
        scroller.scrollTop += target.bottom - viewport.bottom;
      } else if (target.top < viewport.top) {
        scroller.scrollTop += target.top - viewport.top;
      } else if (target.bottom > viewport.bottom) {
        scroller.scrollTop += target.bottom - viewport.bottom;
      }
    };

    if (this.revealLastChildFirst()) {
      // The popup runtime creates #control, #state, #layout, #data
      // in that order. The final direct child is therefore #data.
      const lastChild = findRow(appendContextPathMember(path, 'data'));

      if (lastChild) scrollToRow(lastChild, 'end');

      // Final position: the actual #level is selected and visible.
      scrollToRow(selected, 'start');
      return;
    }

    // Preserve normal CTX Viewer behavior for all other selections.
    scrollToRow(selected, 'nearest');
  }

  private expandAncestors(path: string): void {
    const next = new Set(this.expanded());
    let changed = false;
    const add = (value: string) => {
      if (next.has(value)) return;
      next.add(value);
      changed = true;
    };
    const members = [...tokenizeContextPath(path)];
    let current = 'ctx';
    add(current);
    for (const member of members.slice(0, -1)) {
      current = appendContextPathMember(current, member);
      add(current);
    }
    add(this.rootPath());
    if (!changed) return;
    this.expanded.set(next);
    this.redrawOpened();
    this.expandedPathsChanged.emit([...next]);
  }

  private expandAllNodes(): void {
    const runtime = this.context();
    const next = new Set(this.expanded());
    visitCtxTree(runtime, this.rootPath(), (node) => {
      if (node.hasChildren) next.add(node.path);
    });
    this.expanded.set(next);
    this.redrawOpened();
  }

  private hasTooltipValue(node: CtxNodeProjection): boolean {
    return node.value !== undefined && (node.value === null || typeof node.value !== 'object');
  }
}
