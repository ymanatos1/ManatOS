import { tokenizeContextPath } from '@manatos/shared';
import type { CtxTreeSource } from '../ctx-inspection.js';

const NODE_PROPERTIES = Symbol.for('manatos.ctx.node-properties');

/** Shared DOM resolution for debugger highlighting and post-render diagnostics. */
export function resolveUiSurfaceSelector(
  doc: Document,
  ownerPath: string,
  selector: string,
): {
  status: 'FOUND' | 'NO_ROOT' | 'INVALID_SELECTOR' | 'NO_MATCH' | 'HIDDEN';
  matches: HTMLElement[];
} {
  // Resolve exactly one visible Host for the selected semantic #level.
  // Never guess the last/topmost dialog or the first duplicate root. During a
  // Host transition, ambiguity must fail closed rather than highlight another
  // surface or an obsolete rendering of the selected surface.
  const roots = Array.from(doc.querySelectorAll<HTMLElement>('[data-ui-level-path]')).filter(
    (candidate) =>
      candidate.dataset['uiLevelPath'] === ownerPath &&
      candidate.isConnected &&
      candidate.getClientRects().length > 0,
  );
  if (roots.length !== 1) return { status: 'NO_ROOT', matches: [] };
  const root = roots[0]!;
  let candidates: HTMLElement[];
  try {
    candidates = [
      ...(root.matches(selector) ? [root] : []),
      ...root.querySelectorAll<HTMLElement>(selector),
    ];
  } catch {
    return { status: 'INVALID_SELECTOR', matches: [] };
  }
  // FieldTools menus leave the physical Host via the existing overlay coordinator.
  // Resolve only menus explicitly correlated with this Host and Field: never
  // fall back to a same-named field in another popup or Entry level.
  if (
    selector.includes('manatos-field-tool-menu') ||
    selector.includes('data-entry-field-action')
  ) {
    const field = selector.match(/\[data-entry-field="([A-Za-z][A-Za-z0-9]*)"\]/)?.[1];
    if (field) {
      const panels = doc.querySelectorAll<HTMLElement>(
        '[data-ui-overlay-owner-path][data-ui-overlay-field].manatos-field-tool-menu',
      );
      for (const panel of panels) {
        if (
          panel.dataset['uiOverlayOwnerPath'] !== ownerPath ||
          panel.dataset['uiOverlayField'] !== field
        )
          continue;
        if (selector.includes('data-entry-field-action')) {
          const action = selector.match(/\[data-entry-field-action="([a-z0-9-]+)"\]/)?.[1];
          if (action)
            candidates.push(
              ...panel.querySelectorAll<HTMLElement>(`[data-entry-field-action="${action}"]`),
            );
        } else candidates.push(panel);
      }
    }
  }
  if (!candidates.length) return { status: 'NO_MATCH', matches: [] };
  const matches = [...new Set(candidates)].filter(
    (element) =>
      element.getClientRects().length > 0 &&
      !element.closest('[data-popup-tab][hidden]') &&
      (element.closest('[data-ui-level-path]') === root ||
        element.closest<HTMLElement>('[data-ui-overlay-owner-path]')?.dataset[
          'uiOverlayOwnerPath'
        ] === ownerPath),
  );
  return matches.length ? { status: 'FOUND', matches } : { status: 'HIDDEN', matches: [] };
}

/**
 * Physical correlation for the EXISTING CTX Viewer, using the
 * non-enumerable layout-node metadata convention used by EJS0.
 *
 * CTX owns semantics. The renderer supplies scoped DOM attributes.
 * This class owns only the transient hover overlay, never CTX selection.
 * Selection is intentionally NOT a fallback highlight: leaving the hovered
 * #layout node must remove the overlay even when that node remains selected.
 *
 * The Host root must be the exact connected owning UI surface.
 * Hidden tabs and disconnected elements are never highlightable.
 */
export class UiSurfaceLayoutHighlight {
  private overlay: HTMLElement | null = null;
  private selectedPath: string | null = null;
  private hoveredPath: string | null = null;
  private blockedPath: string | null = null;
  private source: CtxTreeSource | null = null;
  private paintedPath: string | null = null;
  private enabled = true;

  private observedSurfacePath: string | null = null;
  private observedActiveTab: unknown = undefined;

  private observedRoot: HTMLElement | null = null;
  private observedElements: readonly HTMLElement[] = [];

  private readonly resizeObserver =
    typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => this.paint());

  private readonly mutationObserver =
    typeof MutationObserver === 'undefined' ? null : new MutationObserver(() => this.paint());

  constructor(private readonly doc: Document) {
    this.doc.addEventListener('scroll', this.reposition, true);
    this.doc.defaultView?.addEventListener('resize', this.reposition);
  }

  /**
   * The CTX viewer controls whether physical layout highlighting is enabled.
   *
   * Disabling clears physical highlighting immediately, without
   * changing CTX selection or its navigation history.
   *
   * Re-enabling does not resurrect the old highlight. Only a fresh
   * pointer hover can paint another overlay.
   */
  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return;

    this.enabled = enabled;
    this.hoveredPath = null;
    this.blockedPath = this.selectedPath;
    this.removeOverlay();
  }

  /** Used after CTX selection/revision, surface close and tab switch. */
  /**
   * Synchronize physical highlighting with CTX selection and lifecycle.
   *
   * An active-tab change invalidates even a still-visible target,
   * such as #layout.title. A fresh hover is required before painting resumes.
   */
  sync(selectedPath: string, source: CtxTreeSource): void {
    const selectionChanged = selectedPath !== this.selectedPath;

    const layoutPath = [selectedPath, this.hoveredPath, this.paintedPath].find((path) =>
      path?.includes('.layout'),
    );

    const marker = layoutPath?.indexOf('.layout') ?? -1;

    const surfacePath = marker >= 0 && layoutPath ? layoutPath.slice(0, marker) : null;

    const activeTab = surfacePath ? source.get(`${surfacePath}.state.tab`) : undefined;

    const tabChanged =
      surfacePath !== null &&
      surfacePath === this.observedSurfacePath &&
      this.observedActiveTab !== activeTab;

    this.source = source;
    this.selectedPath = selectedPath;

    if (tabChanged) {
      // Clear transient hover when the owning Surface changes tabs.
      // The CTX selection itself remains untouched.
      this.hoveredPath = null;
      this.blockedPath = selectedPath;
      this.removeOverlay();
    }

    this.observedSurfacePath = surfacePath;
    this.observedActiveTab = activeTab;

    if (selectionChanged) this.blockedPath = null;

    this.paint();
  }

  /** Selection only changes CTX navigation; it never starts physical highlighting. */
  select(path: string, source: CtxTreeSource): void {
    this.selectedPath = path;
    this.source = source;
    // A click can select the row while the pointer still hovers it. That hover
    // stays authoritative; subsequent mouseleave removes the overlay.
    this.paint();
  }

  enter(path: string, source: CtxTreeSource): void {
    this.source = source;
    this.hoveredPath = path;
    this.blockedPath = null;

    this.paint();
  }

  leave(path: string): void {
    if (this.hoveredPath !== path) return;

    this.hoveredPath = null;
    // Selection must not re-paint the element after hover ends.
    this.removeOverlay();
  }

  /** A reconciled/removed tree row cannot retain a physical hover overlay. */
  pruneVisiblePaths(visiblePaths: ReadonlySet<string>): void {
    if (this.hoveredPath && !visiblePaths.has(this.hoveredPath)) {
      this.hoveredPath = null;
      this.removeOverlay();
    }
  }

  dispose(): void {
    this.doc.removeEventListener('scroll', this.reposition, true);

    this.doc.defaultView?.removeEventListener('resize', this.reposition);

    this.removeOverlay();
    this.source = null;
    this.selectedPath = null;
    this.hoveredPath = null;
  }

  private readonly reposition = (): void => {
    this.paint();
  };

  private paint(): void {
    if (!this.enabled) {
      this.removeOverlay();
      return;
    }

    const path = this.hoveredPath;

    if (!path || !this.source || path === this.blockedPath) {
      this.removeOverlay();
      return;
    }

    const elements = this.correlatedElements(path, this.source);

    if (elements.length === 0) {
      // A hovered node has lost its physical target.
      // Suppress the stale overlay until a fresh hover.
      if (this.paintedPath === path) {
        this.blockedPath = path;
        this.hoveredPath = null;
      }

      this.removeOverlay();
      return;
    }

    this.observeGeometry(elements);

    const rects = elements.map((element) => element.getBoundingClientRect());

    const left = Math.min(...rects.map((rect) => rect.left));
    const top = Math.min(...rects.map((rect) => rect.top));
    const right = Math.max(...rects.map((rect) => rect.right));
    const bottom = Math.max(...rects.map((rect) => rect.bottom));

    if (!this.overlay) {
      this.overlay = this.doc.createElement('div');
      this.overlay.className = 'ctx-ui-surface-layout-highlight';
      this.overlay.setAttribute('aria-hidden', 'true');
      this.doc.body.appendChild(this.overlay);
    }

    Object.assign(this.overlay.style, {
      position: 'fixed',
      pointerEvents: 'none',
      zIndex: '2102',
      left: `${left}px`,
      top: `${top}px`,
      width: `${right - left}px`,
      height: `${bottom - top}px`,
      border: '2px solid rgba(13, 110, 253, .9)',
      background: 'rgba(13, 110, 253, .14)',
      boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, .7)',
      boxSizing: 'border-box',
    });

    this.paintedPath = path;
  }

  private correlatedElements(path: string, source: CtxTreeSource): HTMLElement[] {
    const marker = '.layout';
    const index = path.indexOf(marker);

    if (index < 0) return [];

    const ownerPath = path.slice(0, index);
    const node = source.get(path);

    if (!node || typeof node !== 'object') return [];

    const metadata = (node as Record<symbol, unknown>)[NODE_PROPERTIES] as
      { domSelector?: string; traverseChildren?: boolean } | undefined;

    if (!metadata?.domSelector) return [];

    const selectors = new Set<string>([metadata.domSelector]);

    // Only an explicitly traversable embedded component contributes
    // descendant areas to its parent highlight.
    //
    // Traverse the authored #layout hierarchy, NOT the DOM tree.
    if (metadata.traverseChildren === true) {
      const visit = (parent: Record<string, unknown>): void => {
        for (const child of Object.values(parent)) {
          if (!child || typeof child !== 'object' || Array.isArray(child)) continue;

          const descendant = child as Record<string | symbol, unknown>;
          const properties = descendant[NODE_PROPERTIES] as { domSelector?: string } | undefined;

          if (properties?.domSelector) selectors.add(properties.domSelector);

          visit(descendant as Record<string, unknown>);
        }
      };

      visit(node as Record<string, unknown>);
    }

    const members = tokenizeContextPath(path.slice(index + 1));
    if (members[0] === 'layout' && members[1] === 'tabs') {
      const tab = source.get(ownerPath + '.state.tab');
      if (tab !== undefined && members[2] !== tab) return [];
    }
    const matches = new Set<HTMLElement>();
    for (const selector of selectors) {
      for (const element of resolveUiSurfaceSelector(this.doc, ownerPath, selector).matches)
        matches.add(element);
    }
    return [...matches];
  }

  /**
   * Keep the overlay aligned with its rendered UI targets.
   *
   * ResizeObserver handles resized fields, sections and Host areas.
   * The root mutation observer handles styling/font-scale changes
   * that can reposition content without scrolling the window.
   *
   * Observers are attached only while a valid highlight exists.
   */
  private observeGeometry(elements: readonly HTMLElement[]): void {
    const root = elements[0]?.closest<HTMLElement>('[data-ui-level-path]') ?? null;

    if (root !== this.observedRoot) {
      this.mutationObserver?.disconnect();
      this.observedRoot = root;

      if (root) {
        this.mutationObserver?.observe(root, {
          attributes: true,
          attributeFilter: ['style', 'class', 'data-popup-active-tab'],
        });
      }
    }

    const targetsChanged =
      elements.length !== this.observedElements.length ||
      elements.some((element, index) => element !== this.observedElements[index]);

    if (targetsChanged) {
      this.resizeObserver?.disconnect();
      this.observedElements = [...elements];

      if (root) this.resizeObserver?.observe(root);

      for (const element of elements) {
        if (element !== root) this.resizeObserver?.observe(element);
      }
    }
  }

  private removeOverlay(): void {
    this.resizeObserver?.disconnect();
    this.mutationObserver?.disconnect();

    this.observedElements = [];
    this.observedRoot = null;

    this.overlay?.remove();
    this.overlay = null;
    this.paintedPath = null;
  }
}
