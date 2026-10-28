import {
  AfterViewInit,
  Directive,
  ElementRef,
  Injectable,
  OnDestroy,
  inject,
  input,
} from '@angular/core';

type ActiveMenu = {
  readonly menu: HTMLElement;
  readonly anchor: HTMLElement;
  readonly dismiss: () => void;
  readonly origin: HTMLElement;
  readonly nextSibling: Node | null;
  readonly originalStyle: string | null;
};

/** A single, clipping-safe transient overlay per UI document (including nested popups). */
@Injectable({ providedIn: 'root' })
export class UiTransientMenuCoordinator {
  private active: ActiveMenu | null = null;
  private readonly outside = (event: PointerEvent): void => {
    const active = this.active;
    if (!active) return;
    const target = event.target;
    if (target instanceof Node && (active.menu.contains(target) || active.anchor.contains(target)))
      return;
    this.dismiss(); // Do not consume the click: the next control must still work.
  };
  private readonly keyboard = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || !this.active) return;
    const anchor = this.active.anchor;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.dismiss();
    if (anchor.isConnected) anchor.focus({ preventScroll: true });
  };
  private readonly navigationOpened = (): void => this.dismiss();
  private readonly reposition = (): void => {
    const active = this.active;
    if (!active) return;
    const { menu, anchor } = active;
    if (!menu.isConnected || !anchor.isConnected) {
      this.dismiss();
      return;
    }
    const rect = anchor.getBoundingClientRect();
    // A scrolled-away anchor must not leave a detached ghost panel on screen.
    if (
      rect.bottom <= 0 ||
      rect.top >= window.innerHeight ||
      rect.right <= 0 ||
      rect.left >= window.innerWidth
    ) {
      this.dismiss();
      return;
    }
    const margin = 8;
    const viewportWidth = Math.max(0, window.innerWidth - margin * 2);
    const viewportHeight = Math.max(0, window.innerHeight - margin * 2);
    const isTools = menu.classList.contains('manatos-field-tool-menu');
    const isReference = menu.classList.contains('manatos-reference-quick-panel');
    const isFilters = menu.classList.contains('manatos-list-filters');
    const isEnum = menu.classList.contains('manatos-enum-menu');
    const desiredWidth = isTools
      ? 240
      : isReference
        ? 420
        : isFilters
          ? 500
          : Math.max(rect.width, menu.classList.contains('manatos-list-view-menu') ? 150 : 180);
    const width = Math.max(0, Math.min(desiredWidth, viewportWidth));
    menu.style.width = `${width}px`;
    menu.style.minWidth = '0';
    menu.style.maxWidth = `${viewportWidth}px`;
    menu.style.boxSizing = 'border-box';
    menu.style.right = 'auto';
    menu.style.insetInlineEnd = 'auto';
    menu.style.margin = '0';
    const left = Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin));
    const below = Math.max(0, window.innerHeight - rect.bottom - margin - 4);
    const above = Math.max(0, rect.top - margin - 4);
    // Measure unconstrained first, then choose the side with sufficient space.
    menu.style.maxHeight = `${viewportHeight}px`;
    const heightCap = isReference ? 370 : isEnum ? 260 : isFilters ? 440 : 320;
    const desiredHeight = Math.min(menu.scrollHeight, heightCap);
    const flip = below < desiredHeight && above > below;
    const available = Math.max(0, flip ? above : below);
    const height = Math.min(desiredHeight, available, viewportHeight);
    menu.style.maxHeight = `${Math.min(heightCap, available, viewportHeight)}px`;
    menu.style.overflowY = isReference ? 'hidden' : desiredHeight > available ? 'auto' : 'visible';
    menu.style.left = `${left}px`;
    menu.style.insetInlineStart = `${left}px`;
    const preferredTop = flip ? rect.top - height - 4 : rect.bottom + 4;
    menu.style.top = `${Math.max(
      margin,
      Math.min(preferredTop, window.innerHeight - height - margin),
    )}px`;
  };
  dismiss(): void {
    const active = this.active;
    if (!active) return;
    // Clear ownership immediately; no transient can block a second menu while
    // Angular is still reconciling the previous menu's @if template.
    this.active = null;
    this.stopListeners();
    active.menu.style.display = 'none';
    active.dismiss();
  }
  private stopListeners(): void {
    document.removeEventListener('pointerdown', this.outside, true);
    document.removeEventListener('keydown', this.keyboard, true);
    window.removeEventListener('resize', this.reposition);
    window.removeEventListener('scroll', this.reposition, true);
    window.removeEventListener('manatos:navigation-menu-open', this.navigationOpened);
  }
  mount(menu: HTMLElement, anchor: HTMLElement, dismiss: () => void): (restore?: boolean) => void {
    if (this.active && this.active.menu !== menu) this.dismiss();
    const origin = menu.parentElement;
    if (!origin) return () => {};
    const entry: ActiveMenu = {
      menu,
      anchor,
      dismiss,
      origin,
      nextSibling: menu.nextSibling,
      originalStyle: menu.getAttribute('style'),
    };
    this.active = entry;
    window.dispatchEvent(new CustomEvent('manatos:transient-menu-open'));
    menu.dataset['manatosTransientOverlay'] = 'true';
    // A floating Tools menu keeps its semantic owner in the existing Entry level.
    if (menu.classList.contains('manatos-field-tool-menu')) {
      const field = anchor.closest<HTMLElement>('[data-entry-field]');
      const level = anchor.closest<HTMLElement>('[data-ui-level-path]');
      if (field?.dataset['entryField'] && level?.dataset['uiLevelPath']) {
        menu.dataset['uiOverlayField'] = field.dataset['entryField'];
        menu.dataset['uiOverlayOwnerPath'] = level.dataset['uiLevelPath'];
      }
    }
    // Body portaling avoids clipping/parent scrollbars. Preserve popup-local
    // typography/font scaling, which otherwise disappears with DOM ancestry.
    const anchorStyle = getComputedStyle(anchor);
    menu.style.setProperty(
      '--manatos-font-scale',
      anchorStyle.getPropertyValue('--manatos-font-scale').trim() || '1',
    );
    menu.style.font = anchorStyle.font;
    menu.style.color = anchorStyle.color;
    document.body.appendChild(menu);
    menu.style.position = 'fixed';
    menu.style.zIndex = '2147483000';
    this.reposition();
    if (this.active !== entry) {
      // The anchor was already outside the viewport; do not register orphan listeners.
      delete menu.dataset['manatosTransientOverlay'];
      delete menu.dataset['uiOverlayField'];
      delete menu.dataset['uiOverlayOwnerPath'];
      menu.remove();
      return () => {};
    }
    document.addEventListener('pointerdown', this.outside, true);
    document.addEventListener('keydown', this.keyboard, true);
    window.addEventListener('resize', this.reposition);
    window.addEventListener('scroll', this.reposition, true);
    window.addEventListener('manatos:navigation-menu-open', this.navigationOpened);
    return (restore = true) => {
      if (this.active === entry) {
        this.active = null;
        this.stopListeners();
      }
      delete menu.dataset['manatosTransientOverlay'];
      delete menu.dataset['uiOverlayField'];
      delete menu.dataset['uiOverlayOwnerPath'];
      if (entry.originalStyle === null) menu.removeAttribute('style');
      else menu.setAttribute('style', entry.originalStyle);
      // On Angular view destruction, restoring to an already-retired @if block
      // would reinsert orphaned "ghost" menus. Restore only for a live remount
      // (e.g. floating Filters changing to docked); destroy removes the portal.
      if (restore && origin.isConnected)
        origin.insertBefore(
          menu,
          entry.nextSibling?.parentNode === origin ? entry.nextSibling : null,
        );
      else menu.remove();
    };
  }
}

/** Native templates retain semantic ownership; the directive owns only placement/dismissal. */
@Directive({ selector: '[manatosTransientMenu]', standalone: true })
export class TransientMenuDirective implements AfterViewInit, OnDestroy {
  readonly anchor = input.required<HTMLElement>({ alias: 'manatosTransientMenu' });
  readonly onDismiss = input.required<() => void>({ alias: 'onTransientDismiss' });
  private readonly coordinator = inject(UiTransientMenuCoordinator);
  private readonly element = inject(ElementRef<HTMLElement>);
  private release: ((restore?: boolean) => void) | null = null;
  ngAfterViewInit(): void {
    this.release = this.coordinator.mount(this.element.nativeElement, this.anchor(), () =>
      this.onDismiss()(),
    );
  }
  ngOnDestroy(): void {
    this.release?.(false);
    this.release = null;
  }
}
