import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ViewEncapsulation,
  computed,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import {
  ContextTreeRuntime,
  type ManatOSRuntimeRootContext,
  type MetadataLanguage,
} from '@manatos/shared';
import { uiListEntityLabel, type UiLanguageDefinition } from '@manatos/shared-ui';
import { uiModalHost, type UiModalLease } from '../../../runtime/modal-host';
import { PopupTitle } from '../../surfaces/PopupTitle';
import { ListPageHost } from './ListPageHost';

/** Popup chrome only: the child ListPageHost owns the ONE nested List #level. */
@Component({
  selector: 'manatos-list-popup-host',
  standalone: true,
  imports: [PopupTitle, ListPageHost],
  encapsulation: ViewEncapsulation.None,
  templateUrl: './ListPopupHost.html',
  styleUrls: ['./ListPopupHost.css', '../../auth/AuthPopup.css'],
})
export class ListPopupHost implements AfterViewInit, OnDestroy {
  readonly contextTree = input.required<ContextTreeRuntime<ManatOSRuntimeRootContext>>();
  readonly entityKey = input.required<string>();
  readonly parentLevelPath = input.required<string>();
  readonly language = input<MetadataLanguage>('EN');
  readonly debuggerForeground = input(false);
  readonly debuggerAllowed = input(false);
  readonly debuggerDocked = input(false);
  readonly debuggerDockWidth = input<number | null>(null);
  readonly currentLanguage = input<UiLanguageDefinition | null>(null);
  readonly languages = input<readonly UiLanguageDefinition[]>([]);
  readonly initialFontScalePercent = input(100);
  readonly fontScalePercent = signal(100);
  readonly languageSelected = output<string>();
  readonly debuggerRequested = output<string>();
  readonly selected = output<string>();
  readonly dismissed = output<void>();
  readonly title = computed(() => ({
    icon: 'bi-list-ul',
    title: uiListEntityLabel(this.entityKey(), this.language()),
    subtitle: this.language() === 'EL' ? 'Επιλογή υπάρχουσας εγγραφής' : 'Select an existing entry',
  }));
  private readonly dialog = viewChild<ElementRef<HTMLElement>>('dialog');
  private modal: UiModalLease | null = null;
  readonly selectionError = signal('');
  readonly selecting = signal(false);
  setSelecting(value: boolean): void {
    this.selecting.set(value);
  }
  /** The popup is always dismissible, including during a pending selection request. */
  protected dismiss(): void {
    if (this.alive) this.dismissed.emit();
  }
  private alive = true;

  protected setFontScale(percent: number): void {
    this.fontScalePercent.set(percent);
  }
  ngAfterViewInit(): void {
    this.fontScalePercent.set(this.initialFontScalePercent());
    this.modal = uiModalHost.acquire(
      document,
      () => this.dialog()?.nativeElement ?? null,
      () => this.debuggerForeground(),
    );
    const dialog = this.dialog()?.nativeElement;
    const search = dialog?.querySelector<HTMLInputElement>('input[type=search]:not([disabled])');
    if (search?.getClientRects().length) search.focus({ preventScroll: true });
    else dialog?.focus();
  }
  protected backdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget && this.modal?.isTopmost()) this.dismiss();
  }
  protected keyboard(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.modal?.isTopmost()) {
      if (this.debuggerForeground() && !this.dialog()?.nativeElement.contains(event.target as Node))
        return;
      event.preventDefault();
      event.stopPropagation();
      this.dismiss();
    }
  }
  protected action(id: 'cancel' | 'select'): void {
    if (id === 'cancel') this.dismiss();
  }
  protected inspect(): void {
    if (this.debuggerAllowed()) this.debuggerRequested.emit(`${this.parentLevelPath()}.level`);
  }
  protected choose(id: string): void {
    if (!this.alive || this.selecting()) return;
    this.selectionError.set('');
    this.selected.emit(id);
  }
  selectionRejected(): void {
    this.selecting.set(false);
    this.selectionError.set(
      this.language() === 'EL'
        ? 'Η εγγραφή δεν είναι διαθέσιμη για επιλογή.'
        : 'This entry is not eligible for selection.',
    );
  }
  ngOnDestroy(): void {
    this.alive = false;
    this.modal?.release();
    this.modal = null;
  }
}
