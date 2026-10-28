/** Native EJS1 counterpart to the NG transient-menu coordinator.
 * One floating overlay per document; no semantic CTX or framework state is owned here.
 */
interface ActiveMenu {
  readonly panel: HTMLElement;
  readonly anchor: HTMLElement;
  readonly owner: HTMLElement;
  readonly parent: HTMLElement;
  readonly next: Node | null;
  readonly style: string | null;
  readonly dismiss: () => void;
  readonly document: Document;
}

const coordinators = new WeakMap<Document, EjsTransientMenus>();

export class EjsTransientMenus {
  static forDocument(document: Document): EjsTransientMenus {
    let coordinator = coordinators.get(document);
    if (!coordinator) {
      coordinator = new EjsTransientMenus(document);
      coordinators.set(document, coordinator);
    }
    return coordinator;
  }

  private active: ActiveMenu | null = null;
  private constructor(private readonly document: Document) {}

  panelFor(owner: HTMLElement, selector: string): HTMLElement | null {
    const active = this.active;
    if (active && owner.contains(active.owner) && active.panel.matches(selector))
      return active.panel;
    return owner.querySelector<HTMLElement>(selector);
  }

  owns(owner: HTMLElement, node: Node): boolean {
    const active = this.active;
    return !!active && owner.contains(active.owner) && active.panel.contains(node);
  }

  isOpen(panel: HTMLElement): boolean {
    return this.active?.panel === panel;
  }

  open(panel: HTMLElement, anchor: HTMLElement, owner: HTMLElement, dismiss: () => void): void {
    if (this.active?.panel === panel) {
      this.position();
      return;
    }
    this.close();
    const parent = panel.parentElement;
    if (!parent || !anchor.isConnected || !panel.isConnected) return;
    const active: ActiveMenu = {
      panel,
      anchor,
      owner,
      parent,
      next: panel.nextSibling,
      style: panel.getAttribute('style'),
      dismiss,
      document: this.document,
    };
    this.active = active;
    this.document.defaultView?.dispatchEvent(new Event('manatos:transient-menu-open'));
    const styles = this.document.defaultView?.getComputedStyle(anchor);
    if (styles) {
      panel.style.setProperty(
        '--manatos-font-scale',
        styles.getPropertyValue('--manatos-font-scale').trim() || '1',
      );
      panel.style.font = styles.font;
      panel.style.color = styles.color;
    }
    panel.dataset['manatosTransientOverlay'] = 'true';
    // Maintain a safe physical correlation for the owning Field's CTX layout.
    if (panel.classList.contains('manatos-field-tool-menu')) {
      const field = anchor.closest<HTMLElement>('[data-entry-field]');
      const level = anchor.closest<HTMLElement>('[data-ui-level-path]');
      if (field?.dataset['entryField'] && level?.dataset['uiLevelPath']) {
        panel.dataset['uiOverlayField'] = field.dataset['entryField'];
        panel.dataset['uiOverlayOwnerPath'] = level.dataset['uiLevelPath'];
      }
    }
    this.document.body.append(panel);
    panel.hidden = false;
    panel.style.position = 'fixed';
    if (panel.classList.contains('manatos-field-tool-menu')) panel.style.display = 'grid';
    panel.style.zIndex = '2147483000';
    this.position();
    if (this.active !== active) return;
    this.document.addEventListener('pointerdown', this.outside, true);
    this.document.addEventListener('keydown', this.escape, true);
    this.document.defaultView?.addEventListener('resize', this.position);
    this.document.defaultView?.addEventListener('scroll', this.position, true);
    this.document.defaultView?.addEventListener('manatos:navigation-menu-open', this.close);
  }

  close = (): void => {
    const active = this.active;
    if (!active) return;
    this.active = null;
    this.document.removeEventListener('pointerdown', this.outside, true);
    this.document.removeEventListener('keydown', this.escape, true);
    this.document.defaultView?.removeEventListener('resize', this.position);
    this.document.defaultView?.removeEventListener('scroll', this.position, true);
    this.document.defaultView?.removeEventListener('manatos:navigation-menu-open', this.close);
    const { panel, parent, next, style } = active;
    panel.hidden = true;
    delete panel.dataset['manatosTransientOverlay'];
    delete panel.dataset['uiOverlayField'];
    delete panel.dataset['uiOverlayOwnerPath'];
    if (style === null) panel.removeAttribute('style');
    else panel.setAttribute('style', style);
    // Do not resurrect a retired child template during a host's disposal.
    if (parent.isConnected) parent.insertBefore(panel, next?.parentNode === parent ? next : null);
    else panel.remove();
    active.dismiss();
  };

  closeOwned(owner: HTMLElement): void {
    if (this.active && owner.contains(this.active.owner)) this.close();
  }

  private readonly outside = (event: PointerEvent): void => {
    const active = this.active;
    if (!active || !(event.target instanceof Node)) return;
    if (active.panel.contains(event.target) || active.anchor.contains(event.target)) return;
    // The ReferenceField's separate chevron toggles the same menu, even though
    // the primary value button is the positioning anchor.
    if (
      active.panel.classList.contains('manatos-reference-quick-panel') &&
      event.target instanceof Element &&
      active.owner.contains(event.target) &&
      event.target.closest('[data-entry-reference-open-arrow]')
    )
      return;
    // Preserve the click on the destination control.
    this.close();
  };

  private readonly escape = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || !this.active) return;
    const anchor = this.active.anchor;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.close();
    if (anchor.isConnected) anchor.focus({ preventScroll: true });
  };

  private readonly position = (): void => {
    const active = this.active;
    if (!active) return;
    const { panel, anchor } = active;
    const view = this.document.defaultView;
    if (!view || !panel.isConnected || !anchor.isConnected) {
      this.close();
      return;
    }
    const rect = anchor.getBoundingClientRect();
    if (
      rect.bottom <= 0 ||
      rect.top >= view.innerHeight ||
      rect.right <= 0 ||
      rect.left >= view.innerWidth
    ) {
      this.close();
      return;
    }
    const margin = 8;
    const tools = panel.classList.contains('manatos-field-tool-menu');
    const reference = panel.classList.contains('manatos-reference-quick-panel');
    const filters = panel.classList.contains('manatos-list-filters');
    const views = panel.classList.contains('manatos-list-view-menu');
    const maxWidth = Math.max(0, view.innerWidth - margin * 2);
    const width = Math.min(
      maxWidth,
      tools ? 240 : reference ? 420 : filters ? 500 : Math.max(rect.width, views ? 150 : 180),
    );
    panel.style.width = `${width}px`;
    panel.style.minWidth = '0';
    panel.style.maxWidth = `${maxWidth}px`;
    panel.style.boxSizing = 'border-box';
    panel.style.margin = '0';
    panel.style.right = 'auto';
    panel.style.insetInlineEnd = 'auto';
    const left = Math.max(margin, Math.min(rect.left, view.innerWidth - margin - width));
    const below = Math.max(0, view.innerHeight - rect.bottom - margin - 4);
    const above = Math.max(0, rect.top - margin - 4);
    const heightCap = reference ? 370 : filters ? 440 : 320;
    panel.style.maxHeight = `${Math.min(heightCap, view.innerHeight - margin * 2)}px`;
    const desired = Math.min(panel.scrollHeight, heightCap);
    const flip = below < desired && above > below;
    const available = flip ? above : below;
    const height = Math.min(desired, available);
    panel.style.maxHeight = `${Math.max(0, Math.min(heightCap, available))}px`;
    panel.style.overflowY = reference ? 'hidden' : desired > available ? 'auto' : 'visible';
    panel.style.left = `${left}px`;
    panel.style.insetInlineStart = `${left}px`;
    panel.style.top = `${Math.max(margin, Math.min(flip ? rect.top - height - 4 : rect.bottom + 4, view.innerHeight - margin - height))}px`;
  };
}
