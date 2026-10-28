export type DebuggerVerticalPanelKey = 'ctx-properties' | 'cli' | 'api-details';

interface DebuggerVerticalPanelConfiguration {
  readonly minimum: number;
  readonly hardMinimum: number;
  readonly maximum: number;
  readonly defaultHeight: number;
  readonly invert: boolean;
}

interface DebuggerVerticalPanelEntry {
  readonly key: DebuggerVerticalPanelKey;
  readonly config: DebuggerVerticalPanelConfiguration;
  readonly element: HTMLElement;
}

export interface DebuggerVerticalLayoutOptions {
  readonly dock: HTMLElement;
  readonly heightChanged: (key: DebuggerVerticalPanelKey, height: number | null) => void;
}

type DebuggerBrowserWindow = Window & {
  readonly ResizeObserver?: typeof ResizeObserver;
  readonly MutationObserver?: typeof MutationObserver;
};

const CONFIGURATION: Readonly<
  Record<DebuggerVerticalPanelKey, DebuggerVerticalPanelConfiguration>
> = Object.freeze({
  'ctx-properties': Object.freeze({
    minimum: 110,
    hardMinimum: 110,
    maximum: 420,
    defaultHeight: 190,
    invert: false,
  }),
  cli: Object.freeze({
    minimum: 192,
    hardMinimum: 96,
    maximum: 576,
    defaultHeight: 192,
    invert: true,
  }),
  'api-details': Object.freeze({
    minimum: 140,
    hardMinimum: 96,
    maximum: Number.POSITIVE_INFINITY,
    defaultHeight: 260,
    invert: false,
  }),
});

export class DebuggerVerticalLayout {
  private disposed = false;
  private resizing = false;
  private pointerId: number | null = null;
  private target: DebuggerVerticalPanelKey | null = null;
  private panel: HTMLElement | null = null;
  private handle: HTMLElement | null = null;
  private startY = 0;
  private startHeight = 0;
  private currentHeight: number | null = null;
  private dragDocument: Document | null = null;
  private reconcileFrame: number | null = null;
  private reconcileView: Window | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private mutationObserver: MutationObserver | null = null;

  constructor(private readonly options: DebuggerVerticalLayoutOptions) {
    options.dock.addEventListener('pointerdown', this.start);
    options.dock.addEventListener('dblclick', this.reset);
    this.bindObservers();
    this.scheduleReconcile();
  }

  refresh(): void {
    this.scheduleReconcile();
  }

  ownerDocumentChanged(): void {
    if (this.disposed) return;
    this.cancelReconcile();
    this.bindObservers();
    this.scheduleReconcile();
  }

  destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelReconcile();
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.mutationObserver?.disconnect();
    this.mutationObserver = null;
    this.finishDrag();
    this.options.dock.removeEventListener('pointerdown', this.start);
    this.options.dock.removeEventListener('dblclick', this.reset);
  }

  private readonly start = (event: PointerEvent): void => {
    if (this.disposed || event.button !== 0) return;
    const candidate = (event.target as Element | null)?.closest<HTMLElement>(
      '[data-debug-vertical-resize]',
    );
    if (!candidate || !this.options.dock.contains(candidate)) return;

    const key = this.panelKey(candidate.dataset.debugVerticalResize);
    const config = key ? CONFIGURATION[key] : null;
    const panel = key
      ? candidate.closest<HTMLElement>(`[data-debug-resizable-panel="${key}"]`)
      : null;
    if (!key || !config || !panel) return;

    this.finishDrag();
    this.resizing = true;
    this.pointerId = event.pointerId;
    this.target = key;
    this.handle = candidate;
    this.panel = panel;
    this.startY = event.clientY;
    this.startHeight = panel.getBoundingClientRect().height;
    this.currentHeight = this.clamp(this.startHeight, config, panel);
    this.applyHeight(panel, this.currentHeight);
    try {
      candidate.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is a convenience; document listeners keep the drag alive without it.
    }
    this.dragDocument = candidate.ownerDocument;
    this.dragDocument.addEventListener('pointermove', this.move, true);
    this.dragDocument.addEventListener('pointerup', this.finish, true);
    this.dragDocument.addEventListener('pointercancel', this.finish, true);
    event.preventDefault();
  };

  private readonly move = (event: PointerEvent): void => {
    if (!this.resizing || event.pointerId !== this.pointerId) return;
    const key = this.target;
    const panel = this.panel;
    if (!key || !panel) return;
    const config = CONFIGURATION[key];
    const delta = event.clientY - this.startY;
    this.currentHeight = this.clamp(
      this.startHeight + (config.invert ? -delta : delta),
      config,
      panel,
    );
    this.applyHeight(panel, this.currentHeight);
    event.preventDefault();
  };

  private readonly finish = (event: PointerEvent): void => {
    if (!this.resizing || event.pointerId !== this.pointerId) return;
    const key = this.target;
    const panel = this.panel;
    const config = key ? CONFIGURATION[key] : null;
    const height =
      config && panel
        ? (this.currentHeight ?? this.clamp(this.startHeight, config, panel))
        : this.currentHeight;

    this.finishDrag();
    this.currentHeight = null;
    if (key && panel && height !== null) {
      const rounded = Math.round(height);
      panel.dataset.debugPreferredHeight = String(rounded);
      this.applyHeight(panel, rounded);
      this.options.heightChanged(key, rounded);
    }
    event.preventDefault();
    this.scheduleReconcile();
  };

  private readonly reset = (event: MouseEvent): void => {
    const candidate = (event.target as Element | null)?.closest<HTMLElement>(
      '[data-debug-vertical-resize]',
    );
    if (!candidate || !this.options.dock.contains(candidate)) return;
    const key = this.panelKey(candidate.dataset.debugVerticalResize);
    const config = key ? CONFIGURATION[key] : null;
    const panel = key
      ? candidate.closest<HTMLElement>(`[data-debug-resizable-panel="${key}"]`)
      : null;
    if (!key || !config || !panel) return;

    this.finishDrag();
    this.currentHeight = null;
    panel.dataset.debugPreferredHeight = String(config.defaultHeight);
    this.applyHeight(panel, config.defaultHeight);
    this.options.heightChanged(key, null);
    event.preventDefault();
    this.scheduleReconcile();
  };

  private bindObservers(): void {
    this.resizeObserver?.disconnect();
    this.mutationObserver?.disconnect();
    this.resizeObserver = null;
    this.mutationObserver = null;

    const view = this.view() as DebuggerBrowserWindow | null;
    const ResizeObserverCtor = view?.ResizeObserver;
    if (ResizeObserverCtor) {
      const observer = new ResizeObserverCtor(() => this.scheduleReconcile());
      this.resizeObserver = observer;
      observer.observe(this.options.dock);
    }

    const MutationObserverCtor = view?.MutationObserver;
    if (MutationObserverCtor) {
      const observer = new MutationObserverCtor(() => this.scheduleReconcile());
      this.mutationObserver = observer;
      observer.observe(this.options.dock, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['data-debug-preferred-height', 'hidden', 'aria-hidden'],
      });
    }
  }

  private scheduleReconcile(): void {
    if (this.disposed || this.resizing || this.reconcileFrame !== null) return;
    const view = this.view();
    if (!view) {
      this.reconcileAll();
      return;
    }
    this.reconcileView = view;
    this.reconcileFrame = view.requestAnimationFrame(() => this.reconcileAll());
  }

  private cancelReconcile(): void {
    if (this.reconcileFrame !== null) this.reconcileView?.cancelAnimationFrame(this.reconcileFrame);
    this.reconcileFrame = null;
    this.reconcileView = null;
  }

  private reconcileAll(): void {
    this.reconcileFrame = null;
    this.reconcileView = null;
    if (this.disposed || this.resizing) return;
    const containers = new Set<HTMLElement>();
    for (const candidate of Array.from(
      this.options.dock.querySelectorAll<HTMLElement>('[data-debug-resizable-panel]'),
    )) {
      const container = this.layoutContainer(candidate);
      if (container) containers.add(container);
    }
    for (const container of containers) this.reconcileContainer(container);
  }

  private reconcileContainer(container: HTMLElement): void {
    if (this.resizing || this.isHidden(container)) return;
    const entries = this.panelEntries(container);
    if (!entries.length) return;

    const budget = this.containerBudget(container, entries);
    if (!Number.isFinite(budget)) {
      for (const entry of entries) {
        this.applyHeight(entry.element, this.preferredHeight(entry.element, entry.config));
      }
      return;
    }

    const heights = entries.map((entry) =>
      Math.min(entry.config.hardMinimum, this.preferredHeight(entry.element, entry.config)),
    );
    const total = heights.reduce((sum, value) => sum + value, 0);

    if (total > budget) {
      let remaining = budget;
      for (let index = 0; index < entries.length; index += 1) {
        const slots = entries.length - index;
        const share = slots > 0 ? remaining / slots : 0;
        heights[index] = Math.max(0, Math.min(heights[index]!, share));
        remaining = Math.max(0, remaining - heights[index]!);
      }
    } else {
      let remaining = budget - total;
      for (let index = 0; index < entries.length && remaining > 0; index += 1) {
        const desired = this.preferredHeight(entries[index]!.element, entries[index]!.config);
        const extra = Math.min(Math.max(0, desired - heights[index]!), remaining);
        heights[index]! += extra;
        remaining -= extra;
      }
    }

    entries.forEach((entry, index) => this.applyHeight(entry.element, heights[index]!));
  }

  private panelEntries(container: HTMLElement): readonly DebuggerVerticalPanelEntry[] {
    const entries: DebuggerVerticalPanelEntry[] = [];
    for (const child of this.layoutChildren(container)) {
      const key = this.panelKey(child.dataset.debugResizablePanel);
      if (!key) continue;
      entries.push({ key, config: CONFIGURATION[key], element: child });
    }
    return entries;
  }

  private containerBudget(container: HTMLElement, entries = this.panelEntries(container)): number {
    if (container.clientHeight <= 0) return Number.POSITIVE_INFINITY;
    const resizable = new Set(entries.map((entry) => entry.element));
    let fixedHeight = 0;
    for (const child of this.layoutChildren(container)) {
      if (resizable.has(child)) continue;
      if (child.hasAttribute('data-debug-flexible-panel')) continue;
      fixedHeight += child.getBoundingClientRect().height;
    }

    const available = Math.max(0, container.clientHeight - fixedHeight);
    return Math.max(0, available - this.flexibleReserve(container, entries, available));
  }

  private flexibleReserve(
    container: HTMLElement,
    entries: readonly DebuggerVerticalPanelEntry[],
    available: number,
  ): number {
    const flexible = this.layoutChildren(container).find((child) =>
      child.hasAttribute('data-debug-flexible-panel'),
    );
    if (!flexible) return 0;

    const minimumValue = this.view()?.getComputedStyle(flexible).minHeight ?? '';
    const minimumParsed = Number.parseFloat(minimumValue);
    const minimum = Number.isFinite(minimumParsed) ? Math.max(0, minimumParsed) : 0;
    const preferredParsed = Number.parseFloat(flexible.dataset.debugFlexiblePreferredHeight ?? '');
    const preferred = Number.isFinite(preferredParsed)
      ? Math.max(minimum, preferredParsed)
      : minimum;
    const hardPanelTotal = entries.reduce((sum, entry) => sum + entry.config.hardMinimum, 0);
    const maximumReserve = Math.max(minimum, available - hardPanelTotal);
    return Math.min(preferred, maximumReserve);
  }

  private preferredHeight(
    element: HTMLElement,
    config: DebuggerVerticalPanelConfiguration,
  ): number {
    const parsed = Number.parseFloat(element.dataset.debugPreferredHeight ?? '');
    const preferred = Number.isFinite(parsed) ? parsed : config.defaultHeight;
    return Math.max(config.hardMinimum, Math.min(config.maximum, Math.round(preferred)));
  }

  private availableHeight(element: HTMLElement): number {
    const container = this.layoutContainer(element);
    if (!container) return Number.POSITIVE_INFINITY;
    const entries = this.panelEntries(container);
    const budget = this.containerBudget(container, entries);
    if (!Number.isFinite(budget)) return budget;
    let occupied = 0;
    for (const entry of entries) {
      if (entry.element === element) continue;
      occupied += entry.element.getBoundingClientRect().height;
    }
    return Math.max(0, budget - occupied);
  }

  private clamp(
    value: number,
    config: DebuggerVerticalPanelConfiguration,
    element: HTMLElement,
  ): number {
    const maximum = Math.min(config.maximum, this.availableHeight(element));
    if (!Number.isFinite(maximum)) {
      return Math.max(config.minimum, Math.min(config.maximum, Math.round(value)));
    }
    const minimum =
      maximum >= config.minimum ? config.minimum : Math.min(config.hardMinimum, maximum);
    return Math.max(minimum, Math.min(maximum, Math.round(value)));
  }

  private applyHeight(element: HTMLElement, height: number): void {
    const rounded = Math.max(0, Math.round(height));
    if (Math.abs(element.getBoundingClientRect().height - rounded) > 0.5) {
      element.style.height = `${rounded}px`;
    }
    element.style.flex = '0 0 auto';
  }

  private finishDrag(): void {
    if (this.handle && this.pointerId !== null) {
      try {
        if (this.handle.hasPointerCapture?.(this.pointerId)) {
          this.handle.releasePointerCapture(this.pointerId);
        }
      } catch {
        // The pointer may already have been released by the browser.
      }
    }
    this.resizing = false;
    this.pointerId = null;
    this.removeDragListeners();
    this.target = null;
    this.panel = null;
    this.handle = null;
  }

  private removeDragListeners(): void {
    if (!this.dragDocument) return;
    this.dragDocument.removeEventListener('pointermove', this.move, true);
    this.dragDocument.removeEventListener('pointerup', this.finish, true);
    this.dragDocument.removeEventListener('pointercancel', this.finish, true);
    this.dragDocument = null;
  }

  private panelKey(value: string | undefined): DebuggerVerticalPanelKey | null {
    return value === 'ctx-properties' || value === 'cli' || value === 'api-details' ? value : null;
  }

  private isHidden(element: HTMLElement): boolean {
    return element.hidden || element.closest('[hidden]') !== null;
  }

  private layoutContainer(element: HTMLElement): HTMLElement | null {
    let container = element.parentElement;
    while (container && this.display(container) === 'contents') container = container.parentElement;
    return container;
  }

  private layoutChildren(container: HTMLElement): readonly HTMLElement[] {
    const children: HTMLElement[] = [];
    const append = (element: HTMLElement): void => {
      if (this.isHidden(element)) return;
      if (this.display(element) === 'contents') {
        for (const child of Array.from(element.children)) append(child as HTMLElement);
        return;
      }
      children.push(element);
    };
    for (const child of Array.from(container.children)) append(child as HTMLElement);
    return children;
  }

  private display(element: HTMLElement): string {
    return this.view()?.getComputedStyle(element).display ?? '';
  }

  private view(): Window | null {
    return this.options.dock.ownerDocument.defaultView;
  }
}
