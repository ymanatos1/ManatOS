/**
 * Auth content REGISTRY ONLY: each semantic kind resolves to an independent
 * concrete TS/HTML owner. No popup-kind branches, DOM construction or actions
 * are permitted in this mapping layer.
 */
import { type Type } from '@angular/core';
import { type UiPopupContentDefinition } from '@manatos/shared-ui';
import { PopupIntroContent } from './PopupIntroContent';
import { PopupProvidersContent } from './PopupProvidersContent';
import { PopupCredentialsContent } from './PopupCredentialsContent';
import { PopupEmailMethodContent } from './PopupEmailMethodContent';
import { PopupNoteContent } from './PopupNoteContent';
import { PopupNoticeContent } from './PopupNoticeContent';
import { PopupSectionContent } from './PopupSectionContent';

export {
  PopupIntroContent,
  PopupProvidersContent,
  PopupCredentialsContent,
  PopupEmailMethodContent,
  PopupNoteContent,
  PopupNoticeContent,
  PopupSectionContent,
};
export type PopupContentSlot = 'intro' | 'sections' | 'tail';

/** Explicit render contracts; independent of popup IDs and Auth tab names.
 * UIS ownership: content-kind to component mapping, so auth hosts never grow hidden kind switches. */
export class PopupContentRendererRegistry {
  private readonly renderers = new Map<
    UiPopupContentDefinition['kind'],
    { component: Type<unknown>; slot: PopupContentSlot }
  >();
  register(
    kind: UiPopupContentDefinition['kind'],
    slot: PopupContentSlot,
    component: Type<unknown>,
  ): this {
    if (this.renderers.has(kind)) throw new Error(`Duplicate popup content renderer: ${kind}`);
    this.renderers.set(kind, { component, slot });
    return this;
  }
  resolve(kind: UiPopupContentDefinition['kind']): Type<unknown> {
    const adapter = this.renderers.get(kind);
    if (!adapter) throw new Error(`Unregistered popup content renderer: ${kind}`);
    return adapter.component;
  }
  slot(kind: UiPopupContentDefinition['kind']): PopupContentSlot {
    const adapter = this.renderers.get(kind);
    if (!adapter) throw new Error(`Unregistered popup content renderer: ${kind}`);
    return adapter.slot;
  }
}
export const popupContentRenderers = new PopupContentRendererRegistry()
  .register('intro', 'intro', PopupIntroContent)
  .register('section', 'sections', PopupSectionContent)
  .register('external-providers', 'tail', PopupProvidersContent)
  .register('auth-credentials', 'tail', PopupCredentialsContent)
  .register('email-method', 'tail', PopupEmailMethodContent)
  .register('note', 'tail', PopupNoteContent)
  .register('notice', 'tail', PopupNoticeContent);
