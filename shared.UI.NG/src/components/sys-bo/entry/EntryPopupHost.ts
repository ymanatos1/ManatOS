import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  computed,
  input,
  output,
  signal,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';
import {
  ContextTreeRuntime,
  type ManatOSRuntimeRootContext,
  type MetadataLanguage,
} from '@manatos/shared';
import { uiEntryCaption, type UiLanguageDefinition, type UiChangeReport } from '@manatos/shared-ui';
import { uiModalHost, type UiModalLease } from '../../../runtime/modal-host';
import { PopupTitle } from '../../surfaces/PopupTitle';
import { EntryPageHost } from './EntryPageHost';
import { EntryUIViewSelector } from './EntryUIViewSelector';

/** Modal chrome only; the existing EntryPageHost owns the child #level. */
@Component({
  selector: 'manatos-entry-popup-host',
  standalone: true,
  imports: [PopupTitle, EntryPageHost, EntryUIViewSelector],
  encapsulation: ViewEncapsulation.None,
  templateUrl: './EntryPopupHost.html',
  styleUrls: ['../list/ListPopupHost.css', '../../auth/AuthPopup.css'],
})
export class EntryPopupHost implements AfterViewInit, OnDestroy {
  readonly contextTree = input.required<ContextTreeRuntime<ManatOSRuntimeRootContext>>();
  readonly entityKey = input.required<string>();
  readonly recordId = input('new');
  readonly entryMode = input<'view' | 'edit' | 'create'>('create');
  readonly parentLevelPath = input.required<string>();
  readonly permissions = input<Readonly<Record<string, boolean>>>({});
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
  readonly created = output<Readonly<Record<string, unknown>>>();
  readonly changeReportRequested = output<UiChangeReport>();
  readonly dismissed = output<void>();
  readonly title = computed(() => ({
    icon:
      this.entryMode() === 'view'
        ? 'bi-eye'
        : this.entryMode() === 'edit'
          ? 'bi-pencil-square'
          : 'bi-plus-circle',
    title: uiEntryCaption(this.entityKey(), null, this.language()),
    subtitle:
      this.entryMode() === 'create'
        ? this.language() === 'EL'
          ? 'Νέα σχετική εγγραφή'
          : 'Create related entry'
        : this.entryMode() === 'edit'
          ? this.language() === 'EL'
            ? 'Επεξεργασία σχετικής εγγραφής'
            : 'Edit related entry'
          : this.language() === 'EL'
            ? 'Προβολή σχετικής εγγραφής'
            : 'View related entry',
  }));
  readonly selectionError = signal('');
  selectionRejected(): void {
    this.selectionError.set(
      this.language() === 'EL'
        ? 'Η εγγραφή δημιουργήθηκε, αλλά δεν μπορεί να επιλεγεί.'
        : 'Entry created, but it cannot be selected.',
    );
  }
  protected readonly entryContent = viewChild(EntryPageHost);
  private readonly dialog = viewChild<ElementRef<HTMLElement>>('dialog');
  private modal: UiModalLease | null = null;
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
    this.dialog()?.nativeElement.focus();
  }
  protected backdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget && this.modal?.isTopmost()) this.dismissed.emit();
  }
  protected keyboard(event: KeyboardEvent): void {
    if (
      event.key === 'Escape' &&
      event.target instanceof Element &&
      event.target.closest('.manatos-entry-ui-view-selector')
    )
      return;
    if (event.key === 'Escape' && this.modal?.isTopmost()) {
      if (this.debuggerForeground() && !this.dialog()?.nativeElement.contains(event.target as Node))
        return;
      event.preventDefault();
      event.stopPropagation();
      this.dismissed.emit();
    }
  }
  protected inspect(): void {
    if (this.debuggerAllowed()) this.debuggerRequested.emit(`${this.parentLevelPath()}.level`);
  }
  ngOnDestroy(): void {
    this.modal?.release();
    this.modal = null;
  }
}
