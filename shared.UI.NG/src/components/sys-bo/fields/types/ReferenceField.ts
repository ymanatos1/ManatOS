import { EntryFieldRendererBase } from '../EntryFieldRendererBase';
import { FieldControlShell } from '../FieldControlShell';
import { NativeFieldInteraction } from '../NativeFieldInteraction';
import { EntryContext } from '../../entry/EntryContext';
import { Component, ElementRef, effect, inject, signal, viewChild } from '@angular/core';
import { TransientMenuDirective } from '../../../../runtime/surfaces/TransientMenu';

/** Reference selection is native UI only; the hidden select forwards a single
 * canonical UIS control-input, validated against authenticated candidates. */
@Component({
  selector: 'manatos-reference-field',
  standalone: true,
  imports: [FieldControlShell, NativeFieldInteraction, TransientMenuDirective],
  templateUrl: './ReferenceField.html',
})
export class ReferenceField extends EntryFieldRendererBase {
  private readonly entry = inject(EntryContext);
  protected readonly dismissMenu = (): void => this.close();
  protected readonly search = signal('');
  protected readonly selecting = signal(false);
  private selectionGeneration = 0;
  private browseGeneration = 0;
  protected readonly browseReady = signal(false);
  protected readonly browseChecking = signal(false);
  protected readonly selectionError = signal('');
  private readonly trigger = viewChild<ElementRef<HTMLButtonElement>>('trigger');
  private readonly searchBox = viewChild<ElementRef<HTMLInputElement>>('searchBox');

  constructor() {
    super();
    effect(() => {
      if (this.opened()) this.searchBox()?.nativeElement.focus();
    });
  }

  protected catalogueMessage(): string {
    const status = this.field().relatedCatalogueStatus;
    const el = this.field().language === 'EL';
    if (status === 'unauthorized')
      return el
        ? 'Δεν επιτρέπεται η φόρτωση των σχετικών εγγραφών.'
        : 'You are not authorized to browse the reference catalogue.';
    if (status === 'unavailable')
      return el
        ? 'Η φόρτωση των σχετικών εγγραφών απέτυχε. Δοκιμάστε την αναζήτηση σε λίστα.'
        : 'Reference catalogue unavailable. Try Browse list.';
    return el
      ? 'Εμφανίζεται μέρος των εγγραφών. Χρησιμοποιήστε τη λίστα για όλες.'
      : 'Showing a limited selection. Browse list for more.';
  }

  protected text(kind: 'search' | 'empty' | 'clear'): string {
    const el = this.field().language === 'EL';
    if (kind === 'search') return el ? 'Αναζήτηση εγγραφών…' : 'Search entries…';
    if (kind === 'empty') return el ? 'Δεν βρέθηκαν εγγραφές.' : 'No entries available.';
    return el ? 'Κενό' : 'Empty';
  }

  /** Native focus within the quick selector; disabled/excluded records are skipped. */
  protected navigate(event: KeyboardEvent): void {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End', 'Escape', 'Enter'].includes(event.key)) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.close(true);
      return;
    }
    const panel = event.currentTarget as HTMLElement;
    const choices = Array.from(
      panel.querySelectorAll<HTMLButtonElement>('[role="option"]:not([disabled])'),
    );
    if (!choices.length) return;
    if (event.key === 'Enter') {
      if (event.target instanceof HTMLInputElement) {
        event.preventDefault();
        choices[0]?.focus();
      }
      return;
    }
    event.preventDefault();
    const index = choices.indexOf(event.target as HTMLButtonElement);
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? choices.length - 1
          : event.key === 'ArrowDown'
            ? Math.min(index + 1, choices.length - 1)
            : index < 0
              ? choices.length - 1
              : Math.max(index - 1, 0);
    choices[next]?.focus();
  }

  protected clear(): void {
    if (!this.canSelect() || !this.hasValue() || this.selecting()) return;
    void this.entry.performFieldTool(this.field().field, 'clear');
    this.close(true);
  }

  protected opened(): boolean {
    return this.entry.openReferenceField() === this.field().field;
  }

  protected canSelect(): boolean {
    return !this.field().readOnly && !!this.field().relatedEntityKey;
  }

  protected hasValue(): boolean {
    const value = this.field().value;
    return typeof value === 'string' && value.length > 0;
  }

  private checkBrowsable(field: string, entityKey: string): void {
    const generation = ++this.browseGeneration;
    this.browseReady.set(false);
    this.browseChecking.set(true);
    void this.entry
      .hasBrowsableReferences(field, entityKey)
      .then((ready) => {
        if (generation === this.browseGeneration && this.opened() && this.canSelect())
          this.browseReady.set(ready);
      })
      .catch(() => {
        if (generation === this.browseGeneration) this.browseReady.set(false);
      })
      .finally(() => {
        if (generation === this.browseGeneration) this.browseChecking.set(false);
      });
  }

  protected historyVisible(): boolean {
    return !!this.entry.fieldHistory(this.field().field)?.changes.length;
  }
  protected undoReady(): boolean {
    return this.entry.canUndo(this.field().field);
  }
  protected redoReady(): boolean {
    return this.entry.canRedo(this.field().field);
  }
  protected undo(event: MouseEvent): void {
    event.stopPropagation();
    this.close();
    void this.entry.undoField(this.field().field);
  }
  protected redo(event: MouseEvent): void {
    event.stopPropagation();
    this.close();
    void this.entry.redoField(this.field().field);
  }
  protected relatedIcons(): readonly string[] {
    return this.field().relatedIcons ?? [];
  }

  protected open(): void {
    if (!this.canSelect()) return;
    if (this.opened()) {
      this.close();
      return;
    }
    this.search.set('');
    this.selectionError.set('');
    const field = this.field();
    this.entry.openReferenceSelector(field.field);
    if (field.relatedEntityKey) this.checkBrowsable(field.field, field.relatedEntityKey);
  }

  /** View only: do not open the selection dropdown or mutate the parent Field. */
  protected viewSelected(event: MouseEvent): void {
    event.stopPropagation();
    const value = this.field().value;
    const entityKey = this.field().relatedEntityKey;
    if (typeof value === 'string' && value && entityKey && this.field().canViewRelated === true) {
      this.entry.viewRelatedEntry(entityKey, value);
    }
  }

  protected browse(): void {
    if (this.selecting() || !this.browseReady()) return;
    const field = this.field();
    if (!this.canSelect() || !field.relatedEntityKey) return;
    this.close();
    this.entry.browseReferences(field.field, field.relatedEntityKey);
  }

  protected add(): void {
    if (this.selecting()) return;
    const field = this.field();
    if (!this.canSelect() || !field.relatedEntityKey) return;
    this.close();
    this.entry.createReference(field.field, field.relatedEntityKey);
  }

  protected close(restoreFocus = false): void {
    // Dismiss even during a pending API call; late completions cannot reopen this menu.
    ++this.selectionGeneration;
    ++this.browseGeneration;
    this.browseReady.set(false);
    this.browseChecking.set(false);
    this.selecting.set(false);
    this.entry.dismissReferenceSelector();
    if (restoreFocus) this.trigger()?.nativeElement.focus();
  }

  protected searchChanged(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement) this.search.set(target.value);
  }

  protected candidates() {
    const term = this.search().trim().toLocaleLowerCase();
    return (this.field().relatedCandidates ?? []).filter(
      (candidate) => !term || candidate.name.toLocaleLowerCase().includes(term),
    );
  }

  protected async choose(id: string): Promise<void> {
    if (!this.canSelect() || this.selecting()) return;
    const field = this.field();
    if (
      !field.relatedEntityKey ||
      !field.relatedCandidates?.some((candidate) => candidate.id === id && !candidate.unavailable)
    )
      return;
    const generation = ++this.selectionGeneration;
    this.selecting.set(true);
    this.selectionError.set('');
    try {
      const accepted = await this.entry.selectReference(
        field.field,
        field.relatedEntityKey,
        id,
        () => generation === this.selectionGeneration && this.opened(),
      );
      if (generation !== this.selectionGeneration || !this.opened()) return;
      if (accepted) this.close(true);
      else
        this.selectionError.set(
          field.language === 'EL'
            ? 'Η εγγραφή δεν είναι διαθέσιμη για επιλογή.'
            : 'This entry is not eligible for selection.',
        );
    } catch {
      if (generation !== this.selectionGeneration || !this.opened()) return;
      this.selectionError.set(
        field.language === 'EL'
          ? 'Η επιλογή απέτυχε. Δοκιμάστε ξανά.'
          : 'Selection failed. Please retry.',
      );
    } finally {
      if (generation === this.selectionGeneration) this.selecting.set(false);
    }
  }
}
