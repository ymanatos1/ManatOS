import type { MetadataLanguage } from '@manatos/shared';
import { uiEmbeddedScopeId } from '../../../runtime/component.js';
import { popupComponentLayout, popupSelector } from '../../embedded/PopupComponents.js';
import { multilingual } from '../../../multilingual/ui-language.js';
import type {
  UiPublicExternalAuthProvider,
  UiPopupProviderPurpose,
} from '../../popup-definition.js';

import type {
  UiEmbeddedComponent,
  UiEmbeddedContextBinding,
  UiEmbeddedLayoutWriter,
  UiEmbeddedActionEvent,
  UiEmbeddedEffect,
  UiSemanticContentDefinition,
  UiSemanticLayoutNode,
} from '../../../runtime/component.js';

/** Shared provider presentation for NG and EJS; neither renderer owns availability policy.
 * UIS ownership: safe provider display metadata derived from policy, not OAuth initiation itself. */
export function externalProviderPresentation(
  language: MetadataLanguage,
  provider: UiPublicExternalAuthProvider,
  purpose: UiPopupProviderPurpose,
): {
  readonly available: boolean;
  readonly label: string;
  readonly title: string;
  readonly status: string | null;
} {
  const text = multilingual(language, []);
  const available =
    purpose === 'signin' &&
    provider.registered &&
    provider.enabled &&
    provider.configured &&
    provider.hostAvailable !== false;
  const reason = !provider.registered
    ? ['ExternalProviderNotConfigured', 'ExternalProviderNotConfiguredStatus']
    : !provider.enabled
      ? ['ExternalProviderDisabled', 'ExternalProviderDisabledStatus']
      : !provider.configured
        ? ['ExternalProviderIncomplete', 'ExternalProviderIncompleteStatus']
        : provider.hostAvailable === false
          ? ['ExternalProviderHostUnavailable', 'ExternalProviderUnavailableStatus']
          : purpose !== 'signin'
            ? ['ExternalProviderRegistrationPending', 'ExternalProviderRegistrationStatus']
            : null;
  return {
    available,
    label: text.format(
      purpose === 'signin' ? '@CM.ExternalProviderContinue' : '@CM.ExternalProviderRegister',
      { provider: provider.label },
    ),
    title: text.resolve(`@CM.${reason?.[0] ?? 'ExternalProviderContinueSecurely'}`),
    status: reason ? text.resolve(`@CM.${reason[1]}`) : null,
  };
}

type ProviderStatus = {
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
};

/**
 * ExternalProviders owns its semantic layout, not the API call.
 *
 * Its initial #layout contains providerList/loading.
 * Once the host publishes its resource and status, the
 * component replaces only providerList's children.
 *
 * The surrounding popup layout and CTX selection remain intact.
 * UIS ownership: the ordered available external sign-in methods and their individual provider children.
 */
export class ExternalProvidersEmbedded implements UiEmbeddedComponent {
  constructor(private readonly definition: UiSemanticContentDefinition) {}
  createLayoutNode(): UiSemanticLayoutNode {
    return popupComponentLayout('component', this.definition.id, popupSelector(this.definition.id));
  }
  private binding: UiEmbeddedContextBinding | null = null;
  private lastLayoutSignature: string | null = null;

  bindContext(binding: UiEmbeddedContextBinding): void {
    this.binding = binding;
  }

  populateLayout(target: UiSemanticLayoutNode, writer: UiEmbeddedLayoutWriter): void {
    const tabId = uiEmbeddedScopeId(this.requireBinding(), 'external-providers');

    const list = writer.add(target, 'providerList', 'region', `${tabId}-provider-list`);

    writer.add(list, 'loading', 'value', `${tabId}-provider-loading`);
  }

  onDataChanged(_changedPaths: readonly string[], writer: UiEmbeddedLayoutWriter): void {
    const binding = this.requireBinding();

    const status = binding.readStatus<ProviderStatus>()?.status ?? 'idle';

    const providers = binding.readData<readonly UiPublicExternalAuthProvider[]>() ?? [];

    const effective = status === 'idle' ? 'loading' : status;

    const names = effective === 'ready' ? providers.map((provider) => provider.provider) : [];

    // Avoid publishing an unchanged semantic subtree.
    const signature = JSON.stringify([effective, names]);

    if (signature === this.lastLayoutSignature) return;

    writer.replaceChildren(['providerList'], (list, nested) => {
      const tabId = uiEmbeddedScopeId(binding, 'external-providers');

      if (effective === 'loading') {
        nested.add(list, 'loading', 'value', `${tabId}-provider-loading`);
      } else if (effective === 'error') {
        nested.add(list, 'error', 'value', `${tabId}-provider-error`);
      } else if (names.length === 0) {
        nested.add(list, 'empty', 'value', `${tabId}-provider-empty`);
      } else {
        for (const provider of providers) {
          nested.mount(
            list,
            {
              id: provider.provider,
              kind: 'auth-provider-action',
              scopeId: tabId,
            } as ExternalProviderActionDefinition,
            ['providerList'],
          );
        }
      }
    });

    this.lastLayoutSignature = signature;
  }

  dispose(): void {
    this.binding = null;
    this.lastLayoutSignature = null;
  }

  private requireBinding(): UiEmbeddedContextBinding {
    if (!this.binding) throw new Error('ExternalProviders embedded component is not bound.');

    return this.binding;
  }
}

/** Provider controls are independently mounted owners, not anonymous action nodes. */
export interface ExternalProviderActionDefinition extends UiSemanticContentDefinition {
  readonly scopeId: string;
}

/** A host may route this intent through its already registered OAuth capability. */
export interface ExternalProviderActionEffect extends UiEmbeddedEffect {
  readonly type: 'external-provider';
  readonly provider: string;
}

/** UIS ownership: one provider action and its availability, never browser OAuth state or token values. */
export class ExternalProviderActionEmbedded implements UiEmbeddedComponent {
  constructor(private readonly definition: ExternalProviderActionDefinition) {}
  createLayoutNode(): UiSemanticLayoutNode {
    return popupComponentLayout(
      'action',
      this.definition.id,
      popupSelector(`${this.definition.scopeId}-provider-${this.definition.id}`),
    );
  }
  bindContext(): void {
    // Provider credentials and OAuth challenges are never stored in UIS CTX.
  }
  populateLayout(): void {
    // The registered semantic action is the complete child layout.
  }
  handleAction(event: UiEmbeddedActionEvent): ExternalProviderActionEffect | null {
    return event.action === this.definition.id
      ? { type: 'external-provider', provider: this.definition.id }
      : null;
  }
}
