import { multilingual } from '@manatos/shared-ui';
import { Component, input, output, computed } from '@angular/core';
import type { CtxSearchMode, CtxSearchSyntax } from '@manatos/shared-ui';

@Component({
  selector: 'manatos-ctx-find',
  standalone: true,
  templateUrl: './CtxFind.html',
  styleUrl: './CtxFind.css',
})
export class CtxFind {
  protected readonly multilingual = computed(() =>
    multilingual(this.language(), [
      'FindInCtx',
      'FindInCtxPlaceholder',
      'CtxFindPattern',
      'RecentSearches',
      'RecentCtxSearches',
      'FindPrevious',
      'FindNext',
      'CtxFindTarget',
      'FindByKeyValueOrBoth',
      'CtxFindSyntax',
      'WildcardOrRegex',
      'CloseFind',
      'FindByKey',
      'FindByValue',
      'FindByKeyAndValue',
      'Wildcard',
      'RegExpr',
    ] as const),
  );

  readonly language = input<'EN' | 'EL'>('EN');
  readonly searchText = input('');
  readonly mode = input<CtxSearchMode>('key');
  readonly syntax = input<CtxSearchSyntax>('wildcard');
  readonly history = input<readonly string[]>([]);
  readonly matchCount = input(0);

  readonly searchChanged = output<string>();
  readonly modeChanged = output<CtxSearchMode>();
  readonly syntaxChanged = output<CtxSearchSyntax>();
  readonly previous = output<void>();
  readonly next = output<void>();
  readonly historySelected = output<string>();
  readonly closeRequested = output<void>();

  protected changeSearch(event: Event): void {
    this.searchChanged.emit((event.target as HTMLInputElement).value);
  }

  protected changeMode(event: Event): void {
    this.modeChanged.emit((event.target as HTMLSelectElement).value as CtxSearchMode);
  }

  protected changeSyntax(event: Event): void {
    this.syntaxChanged.emit((event.target as HTMLSelectElement).value as CtxSearchSyntax);
  }

  protected handleKey(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (event.shiftKey) this.previous.emit();
      else this.next.emit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.closeRequested.emit();
    }
  }
}
