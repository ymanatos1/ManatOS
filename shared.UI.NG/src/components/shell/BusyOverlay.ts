import { multilingual } from '@manatos/shared-ui';
import { Component, ElementRef, effect, input, signal, viewChild, computed } from '@angular/core';

import { type UiBusySnapshot, UiBusyRuntime } from '@manatos/shared-ui';
import { type MetadataLanguage } from '@manatos/shared';

/** Presents shared foreground-operation state without owning any requests. */
@Component({
  selector: 'manatos-busy-overlay',
  standalone: true,
  templateUrl: './BusyOverlay.html',
  styleUrl: './BusyOverlay.css',
})
export class BusyOverlay {
  protected readonly multilingual = computed(() => multilingual(this.language(), []));

  readonly language = input<MetadataLanguage>('EN');
  readonly runtime = input.required<UiBusyRuntime>();

  protected readonly state = signal<UiBusySnapshot>({
    visible: false,
    activeCount: 0,
    presentation: {},
  });

  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    effect((onCleanup) => {
      const unsubscribe = this.runtime().subscribe((state) => this.state.set(state));
      onCleanup(unsubscribe);
    });

    // Native modal behavior blocks background input and restores focus.
    effect(() => {
      const dialog = this.dialog()?.nativeElement;
      const visible = this.state().visible;

      if (!dialog) return;

      if (visible && !dialog.open) dialog.showModal();
      if (!visible && dialog.open) dialog.close();
    });
  }

  protected runAction(): void {
    this.state().presentation.onAction?.();
  }
}
