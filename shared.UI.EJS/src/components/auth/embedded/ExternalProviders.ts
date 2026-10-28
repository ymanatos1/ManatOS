import { createNativeElement } from '../../native-template.js';
import {
  externalProviderPresentation,
  multilingual,
  UiPopupRuntime,
  type UiPublicExternalAuthProvider,
} from '@manatos/shared-ui';

type ProviderStatus = {
  readonly status: 'idle' | 'loading' | 'ready' | 'error';
  readonly error: string | null;
};

/** CTX-bound provider catalogue presenter. Availability is authoritative on the host.
 * UIS ownership: the ordered available external sign-in methods and their individual provider children. */
export class ExternalProviders {
  // A new CTX fact must not recreate unrelated provider buttons while the
  // user is typing credentials in the same tab. Preserve their native focus
  // and semantic #layout DOM bindings until provider data actually changes.
  private readonly rendered = new WeakMap<HTMLElement, string>();

  constructor(private readonly language: () => 'EN' | 'EL') {}

  update(root: HTMLElement, popup: UiPopupRuntime): void {
    const providers = (popup.level.data.resources.runtime['externalAuthProviders'] ??
      []) as readonly UiPublicExternalAuthProvider[];
    const status = (popup.level.state['externalAuthProviders'] ?? {
      status: 'idle',
      error: null,
    }) as ProviderStatus;
    const uiText = multilingual(this.language(), []);
    for (const container of root.querySelectorAll<HTMLElement>('[data-ejs-providers]')) {
      const tabId = container.dataset['ejsProvidersTab'] ?? popup.activeTab.id;
      const purpose = container.dataset['ejsProviders'];
      const signature = JSON.stringify({
        purpose,
        tabId,
        providers,
        status,
        language: this.language(),
        busy: popup.level.state.busy,
      });
      if (this.rendered.get(container) === signature) continue;
      this.rendered.set(container, signature);
      // Keep the list and its provider buttons mounted across busy-state and
      // availability updates. Only an actual catalogue/mode change may remove a
      // provider control; NG1 similarly retains each embedded component host.
      const list = container.querySelector<HTMLElement>(':scope > .auth-provider-list');
      if (!list) throw new Error('AuthProviders template is missing its provider-list child.');
      const placeholder = (suffix: string, content: string, alert = false): void => {
        list.replaceChildren();
        list.append(
          createNativeElement('AuthProviderNotice', {
            Id: tabId + '-provider-' + suffix,
            Role: alert ? 'alert' : 'status',
            Message: content,
          }),
        );
      };
      if (status.status === 'idle' || status.status === 'loading') {
        placeholder('loading', uiText.resolve('@CM.ExternalProvidersLoading'));
        continue;
      }
      if (status.status === 'error') {
        placeholder(
          'error',
          status.error ?? uiText.resolve('@CM.ExternalProvidersUnavailable'),
          true,
        );
        continue;
      }
      if (!providers.length) {
        placeholder('empty', uiText.resolve('@CM.ExternalProvidersEmpty'));
        continue;
      }
      // A previous loading/error placeholder is replaced when the actual
      // catalogue is available; existing keyed provider buttons are retained.
      for (const child of Array.from(list.children)) {
        if (!(child instanceof HTMLButtonElement)) child.remove();
        else if (!providers.some((provider) => provider.provider === child.dataset.ejsProviderKey))
          child.remove();
      }
      for (const [index, provider] of providers.entries()) {
        const presentation = externalProviderPresentation(
          this.language(),
          provider,
          purpose === 'register' ? 'register' : 'signin',
        );
        const available = presentation.available;
        let button = Array.from(list.children).find(
          (child): child is HTMLButtonElement =>
            child instanceof HTMLButtonElement &&
            child.dataset.ejsProviderKey === provider.provider,
        );
        if (!button) {
          button = createNativeElement(
            'AuthProviderButton',
            {},
            { Status: '' },
          ) as HTMLButtonElement;
          button.dataset.ejsProviderKey = provider.provider;
          button.dataset.popupLayoutId = tabId + '-provider-' + provider.provider;
          const providerId = provider.provider;
          button.addEventListener('click', () => {
            if (!button?.disabled && !popup.level.state.busy && popup.activeTab.id === tabId)
              popup.requestSurfaceAction('externalProvider', providerId);
          });
        }
        button.classList.toggle('is-unavailable', !available);
        const icon = button.querySelector<HTMLElement>('.auth-provider-icon');
        const label = button.querySelector<HTMLElement>('.auth-provider-label');
        if (!icon || !label) throw new Error('AuthProviderButton template is missing icon/label.');
        icon.className = 'bi ' + provider.icon + ' auth-provider-icon';
        label.textContent = presentation.label;
        button.querySelector('.auth-provider-status, .auth-provider-chevron')?.remove();
        button.disabled = popup.level.state.busy || !available;
        button.removeAttribute('title');
        button.title = presentation.title;
        const statusLabel = presentation.status;
        button.append(
          statusLabel
            ? createNativeElement('AuthProviderStatus', { Label: statusLabel })
            : createNativeElement('AuthProviderChevron'),
        );
        if (list.children[index] !== button)
          list.insertBefore(button, list.children[index] ?? null);
      }
    }
  }
}
