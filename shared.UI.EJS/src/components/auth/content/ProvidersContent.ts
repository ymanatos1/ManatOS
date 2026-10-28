import { createNativeElement } from '../../native-template.js';
import {
  type UiPopupProvidersDefinition,
  type UiPopupRuntime,
  type UiPopupTabDefinition,
} from '@manatos/shared-ui';
import { ExternalProviders } from '../embedded/ExternalProviders.js';

/**
 * The providers slot belongs to a concrete child, not AuthPopupContent's registry.
 * ExternalProviders exclusively owns provider order, status and button actions;
 * this component owns the declared placeholder and supplies the live popup data.
 * Breakpoints: append() and refresh(); do not clone provider state into CTX.
 */
export class ProvidersContent {
  private readonly providers: ExternalProviders;
  constructor(language: () => 'EN' | 'EL') {
    this.providers = new ExternalProviders(language);
  }
  append(item: UiPopupProvidersDefinition, parent: HTMLElement, tab: UiPopupTabDefinition): void {
    parent.append(
      createNativeElement('AuthProviders', {
        Purpose: item.purpose,
        Tab: tab.id,
        Id: item.id,
      }),
    );
  }
  refresh(element: HTMLElement, runtime: UiPopupRuntime): void {
    this.providers.update(element, runtime);
  }
}
