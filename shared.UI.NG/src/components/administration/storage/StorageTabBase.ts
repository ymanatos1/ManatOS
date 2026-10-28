import { Directive, ElementRef, computed, inject, input } from '@angular/core';
import type { MetadataLanguage } from '@manatos/shared';
import type { UiPopupTabDefinition } from '@manatos/shared-ui';
import type { PopupContext } from '../../surfaces/PopupContext';
import { StorageWizardState } from './StorageWizardState';

/** Common native inputs/focus only; a concrete tab owns its template and child layout. */
@Directive()
export abstract class StorageTabBase {
  readonly popup = input.required<PopupContext>();
  readonly tab = input.required<UiPopupTabDefinition>();
  readonly language = input<MetadataLanguage>('EN');
  readonly featureContext = input<unknown>(null);
  readonly wizard = computed(() => this.featureContext() as StorageWizardState);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);

  focusFirst(): void {
    this.element.nativeElement
      .querySelector<HTMLElement>(
        'input:not([disabled]):not([readonly]), select:not([disabled]), button:not([disabled])',
      )
      ?.focus();
  }
}
