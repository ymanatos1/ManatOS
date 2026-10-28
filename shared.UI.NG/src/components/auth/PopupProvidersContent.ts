import { Component, computed } from '@angular/core';
import { type UiPopupProvidersDefinition } from '@manatos/shared-ui';
import { ExternalProviders } from './embedded/ExternalProviders';
import { ContentItemBase } from './PopupContentBase';

/**
 * Owns the external-providers content slot and delegates the ordered provider
 * controls to ExternalProviders; it never initiates OAuth or keeps secrets.
 * Inspect its HTML child mount, then ExternalProviders provider actions.
 */
@Component({
  selector: 'manatos-popup-providers-content',
  standalone: true,
  imports: [ExternalProviders],
  host: { style: 'display: contents' },
  templateUrl: './PopupProvidersContent.html',
})
export class PopupProvidersContent extends ContentItemBase {
  protected readonly item = computed(() => this.definition() as UiPopupProvidersDefinition);
}
