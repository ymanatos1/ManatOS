import {
  AfterViewChecked,
  Component,
  ElementRef,
  OnDestroy,
  inject,
  viewChild,
} from '@angular/core';
import { ListContext } from '../ListContext';
import { ListFilterField } from './ListFilterField';
import { UiTransientMenuCoordinator } from '../../../../runtime/surfaces/TransientMenu';

/**
 * Native Filter owns the dock/panel controls and renders declared ListFilterField children.
 * The List host does not interpret filter values or toggle its descendants. Debug:
 * toggle()/changeDock() and ListFilter.html; semantic validation stays in ListFilterEmbedded.
 */
@Component({
  selector: 'manatos-list-filter',
  standalone: true,
  imports: [ListFilterField],
  templateUrl: './ListFilter.html',
})
export class ListFilter implements AfterViewChecked, OnDestroy {
  private observedPanel: HTMLElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private readonly filterPanel = viewChild<ElementRef<HTMLElement>>('filterPanel');
  private readonly filterToggle = viewChild<ElementRef<HTMLElement>>('filterToggle');
  private releaseFloating: ((restore?: boolean) => void) | null = null;
  private floatingPanel: HTMLElement | null = null;
  private readonly element = inject(ElementRef<HTMLElement>);
  private readonly transientMenus = inject(UiTransientMenuCoordinator);
  ngAfterViewChecked(): void {
    this.syncDock();
  }
  ngOnDestroy(): void {
    this.releaseFloating?.(false);
    this.releaseFloating = null;
    this.resizeObserver?.disconnect();
  }
  private syncDock(): void {
    const element = this.element.nativeElement;
    const header = element.closest('.manatos-list-header') as HTMLElement | null;
    // viewChild retains identity when the floating panel is temporarily portaled to body.
    const panel = this.filterPanel()?.nativeElement ?? null;
    const anchor = this.filterToggle()?.nativeElement ?? null;
    const floating =
      !!panel &&
      !!anchor &&
      this.context.level()?.state.list.filtersVisible === true &&
      this.context.level()?.state.list.filtersDocked !== true;
    if ((!floating || this.floatingPanel !== panel) && this.releaseFloating) {
      // Only dock transitions keep this Angular node alive under its owner.
      this.releaseFloating(!!panel && panel === this.floatingPanel);
      this.releaseFloating = null;
      this.floatingPanel = null;
    }
    if (floating && !this.releaseFloating && panel && anchor) {
      this.floatingPanel = panel;
      this.releaseFloating = this.transientMenus.mount(panel, anchor, () =>
        this.context.setFiltersVisible(false),
      );
    }
    if (!header) return;
    if (panel !== this.observedPanel) {
      this.resizeObserver?.disconnect();
      this.observedPanel = panel;
      if (panel && typeof ResizeObserver !== 'undefined') {
        this.resizeObserver = new ResizeObserver(() => this.syncDock());
        this.resizeObserver.observe(panel);
      }
    }
    if (!panel) {
      header.style.removeProperty('--manatos-list-docked-filter-height');
      return;
    }
    const docked =
      this.context.level()?.state.list.filtersDocked &&
      this.context.level()?.state.list.filtersVisible;
    const height = docked ? `${panel.offsetHeight + 12}px` : '';
    if (header.style.getPropertyValue('--manatos-list-docked-filter-height') !== height) {
      if (height) header.style.setProperty('--manatos-list-docked-filter-height', height);
      else header.style.removeProperty('--manatos-list-docked-filter-height');
    }
  }
  protected readonly context = inject(ListContext);
  protected refresh(): void {
    this.context.dispatchAction('list-filter', 'refresh');
  }
  protected toggle(): void {
    if (!this.context.level()?.state.list.filtersVisible) this.transientMenus.dismiss();
    this.context.dispatchAction('list-filter', 'toggle');
  }
  protected changeDock(): void {
    this.context.dispatchAction('list-filter', 'dock');
  }
}
