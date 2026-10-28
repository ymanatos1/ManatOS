import { NgComponentOutlet } from '@angular/common';
import { Component, computed, viewChildren } from '@angular/core';
import { type UiPopupContentDefinition, type UiPopupSectionDefinition } from '@manatos/shared-ui';
import { AuthCredentials } from './embedded/AuthCredentials';
import { ContentItemBase } from './PopupContentBase';
import { popupContentRenderers } from './PopupContentRenderers';
import { PopupCredentialsContent } from './PopupCredentialsContent';
import { PopupEmailMethodContent } from './PopupEmailMethodContent';

/**
 * Owns the section caption/card and recursively registered child outlets.
 * Its TS declares the child component and input mapping; its HTML declares
 * actual ngComponentOutlet placement. Never flatten grandchildren in the host.
 * Breakpoints: childInputs() and focusFirst() through the rendered outlets.
 */
@Component({
  selector: 'manatos-popup-section-content',
  standalone: true,
  imports: [NgComponentOutlet],
  host: { style: 'display: contents' },
  templateUrl: './PopupSectionContent.html',
})
export class PopupSectionContent extends ContentItemBase {
  protected readonly item = computed(() => this.definition() as UiPopupSectionDefinition);
  protected readonly methods = computed(
    () => this.tabId() === 'signin' || this.tabId() === 'methods',
  );
  protected readonly renderer = (kind: UiPopupContentDefinition['kind']) =>
    popupContentRenderers.resolve(kind);
  protected readonly childInputs = (
    definition: UiPopupContentDefinition,
  ): Record<string, unknown> => ({
    definition,
    popup: this.popup(),
    language: this.language(),
    tabId: this.tabId(),
    contentContext: this.contentContext(),
    requestEmail: this.requestEmail(),
    requestProvider: this.requestProvider(),
    requestRecovery: this.requestRecovery(),
  });
  private readonly outlets = viewChildren(NgComponentOutlet);
  get credentials(): AuthCredentials | undefined {
    for (const outlet of this.outlets()) {
      const instance = outlet.componentInstance;
      if (instance instanceof PopupCredentialsContent) return instance.credentials;
    }
    return undefined;
  }
  focusFirst(): boolean {
    for (const outlet of this.outlets()) {
      const instance = outlet.componentInstance;
      if (
        instance instanceof PopupCredentialsContent ||
        instance instanceof PopupEmailMethodContent
      ) {
        if (instance.focusFirst()) return true;
      }
    }
    return false;
  }
}
