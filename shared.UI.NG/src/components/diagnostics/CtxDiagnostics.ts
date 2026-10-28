import { multilingual } from '@manatos/shared-ui';
import { Component, OnDestroy, OnInit, computed, input, signal } from '@angular/core';
import type { UiDiagnosticEntry, UiDiagnosticsRuntime } from '@manatos/shared-ui';

@Component({
  selector: 'manatos-ctx-diagnostics',
  standalone: true,
  templateUrl: './CtxDiagnostics.html',
  styleUrl: './CtxDiagnostics.css',
})
export class CtxDiagnostics implements OnInit, OnDestroy {
  protected readonly multilingual = computed(() =>
    multilingual(this.language(), ['CtxDiagnostics', 'CloseDiagnostics', 'Details'] as const),
  );

  readonly language = input<'EN' | 'EL'>('EN');
  readonly runtime = input.required<UiDiagnosticsRuntime>();

  private readonly revision = signal(0);
  private unsubscribeRuntime: (() => void) | null = null;

  protected readonly entries = computed(() => {
    this.revision();
    return this.runtime().entries;
  });

  protected readonly totalCount = computed(() => {
    this.revision();
    return this.runtime().totalCount;
  });

  ngOnInit(): void {
    this.unsubscribeRuntime = this.runtime().subscribe(() => {
      this.revision.update((value) => value + 1);
    });
  }

  ngOnDestroy(): void {
    this.unsubscribeRuntime?.();
    this.unsubscribeRuntime = null;
  }

  protected clear(): void {
    this.runtime().clear();
  }

  protected title(entry: UiDiagnosticEntry): string {
    return entry.diagnostic.phase === 'parse'
      ? 'CTX expression parse error'
      : 'CTX expression evaluation error';
  }

  protected details(entry: UiDiagnosticEntry): string {
    return JSON.stringify(entry.diagnostic, null, 2);
  }
}
