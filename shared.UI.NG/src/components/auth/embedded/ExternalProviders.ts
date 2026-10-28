import { externalProviderPresentation, multilingual } from '@manatos/shared-ui';
import { Component, computed, input, output } from '@angular/core';

import type { UiPopupProviderPurpose, UiPublicExternalAuthProvider } from '@manatos/shared-ui';

import { type MetadataLanguage } from '@manatos/shared';
import { PopupContext } from '../../surfaces/PopupContext';

/**
 * CTX-aware embedded external-provider presenter.
 *
 * The hosting popup supplies its shared PopupContext and the
 * resource path. This component owns no HTTP transport.
 *
 * It reads the public provider catalogue from #data.resources.
 * Its semantic layout is populated by shared.UI.
 *
 * Configured providers emit semantic user intent to the owning popup.
 * Registration providers stay disabled until the registration migration.
 */
/** UIS ownership: the ordered available external sign-in methods and their individual provider children. */
@Component({
  selector: 'manatos-external-providers',
  standalone: true,
  templateUrl: './ExternalProviders.html',
  styleUrl: './ExternalProviders.css',
})
export class ExternalProviders {
  protected readonly multilingual = computed(() => multilingual(this.language(), []));

  protected readonly presentation = (provider: UiPublicExternalAuthProvider) =>
    externalProviderPresentation(this.language(), provider, this.purpose());

  readonly purpose = input.required<UiPopupProviderPurpose>();
  readonly tabId = input.required<string>();

  readonly popup = input.required<PopupContext>();
  readonly language = input<MetadataLanguage>('EN');
  readonly dataPath = input.required<string>();
  readonly providerRequested = output<string>();

  protected readonly providers = computed(
    () => this.popup().readResource<readonly UiPublicExternalAuthProvider[]>(this.dataPath()) ?? [],
  );

  protected readonly status = computed(
    () =>
      this.popup().readResourceStatus<{
        status: 'idle' | 'loading' | 'ready' | 'error';
        error: string | null;
      }>('state.externalAuthProviders') ?? {
        status: 'idle' as const,
        error: null,
      },
  );
}
