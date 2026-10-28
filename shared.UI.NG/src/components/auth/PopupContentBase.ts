import { Directive, computed, input } from '@angular/core';
import {
  multilingual,
  type UiPageTemplateContext,
  type UiPopupContentDefinition,
} from '@manatos/shared-ui';
import type { MetadataLanguage } from '@manatos/shared';
import { PopupContext } from '../surfaces/PopupContext';

/**
 * Auth child input contract ONLY. A registered concrete popup-content owner
 * chooses its DOM, child composition and native actions in its TS/HTML pair;
 * this directive must never acquire kind switches, CTX or credential values.
 */
@Directive()
export abstract class ContentItemBase {
  readonly definition = input.required<UiPopupContentDefinition>();
  readonly popup = input.required<PopupContext>();
  readonly language = input.required<MetadataLanguage>();
  readonly tabId = input.required<string>();
  readonly contentContext = input<UiPageTemplateContext>({});
  readonly columnIndex = input(0);
  readonly requestEmail = input<(id: string) => void>(() => {});
  readonly requestProvider = input<(provider: string) => void>(() => {});
  readonly requestRecovery = input<(id: string) => void>(() => {});
  protected readonly multilingual = computed(() => multilingual(this.language(), []));
}
