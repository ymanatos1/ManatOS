import { UiEmbeddedComponentRegistry } from '../../runtime/component.js';
import {
  PopupRootEmbedded,
  PopupTabsEmbedded,
  type UiPopupRootDefinition,
  type UiPopupTabsDefinition,
} from './PopupRoot.js';
import {
  AuthCredentialsEmbedded,
  AuthCredentialFieldEmbedded,
  AuthPasswordGuidanceEmbedded,
  type AuthCredentialFieldDefinition,
} from '../auth/embedded/auth-credentials-layout.js';
import {
  ExternalProvidersEmbedded,
  ExternalProviderActionEmbedded,
  type ExternalProviderActionDefinition,
} from '../auth/embedded/external-providers-layout.js';
import type {
  UiPopupCredentialsDefinition,
  UiPopupFeatureContentDefinition,
} from '../popup-definition.js';
import {
  PopupActionsEmbedded,
  PopupFeatureContentEmbedded,
  PopupVariantFeatureContentEmbedded,
  PopupIntroEmbedded,
  PopupTextEmbedded,
  PopupEmailMethodEmbedded,
  PopupSectionEmbedded,
  PopupTabEmbedded,
  PopupTitleEmbedded,
  PopupTitleToolEmbedded,
  type UiPopupEmbeddedDefinition,
} from './PopupComponents.js';

/**
 * Popup capability registration. The runtime has no knowledge of Auth or of
 * individual content kinds. New popup components register here (or in a caller's
 * registry); generic mounting, CTX ownership and disposal remain unchanged.
 * UIS ownership: the popup semantic component registrations; unmatched kinds must not be silently flattened.
 */
export function createPopupEmbeddedRegistry(): UiEmbeddedComponentRegistry {
  const registry: UiEmbeddedComponentRegistry = new UiEmbeddedComponentRegistry()
    .register('popup-root', {
      dataPath: 'data.content',
      create: (d) => new PopupRootEmbedded(d as UiPopupRootDefinition),
    })
    .register('popup-title', {
      dataPath: 'data.content',
      create: (item) => new PopupTitleEmbedded(item as UiPopupEmbeddedDefinition),
    })
    .register('popup-tabs', {
      dataPath: 'data.content',
      create: (d) => new PopupTabsEmbedded(d as UiPopupTabsDefinition),
    })
    .register('popup-title-tool', {
      dataPath: 'data.content',
      create: (d) => new PopupTitleToolEmbedded(d as UiPopupEmbeddedDefinition),
    })
    .register('popup-tab', {
      dataPath: 'data.content',
      create: (item) =>
        new PopupTabEmbedded(
          item as UiPopupEmbeddedDefinition,
          (kind) => registry.get(kind)?.inlineSection === true,
        ),
    })
    .register('popup-view', {
      dataPath: 'data.content',
      create: (item) =>
        new PopupTabEmbedded(
          item as UiPopupEmbeddedDefinition,
          (kind) => registry.get(kind)?.inlineSection === true,
        ),
    })
    .register('popup-actions', {
      dataPath: 'data.content',
      create: (item) => new PopupActionsEmbedded(item as UiPopupEmbeddedDefinition),
    })
    .register('section', {
      dataPath: 'data.content',
      create: (item) =>
        new PopupSectionEmbedded({
          ...item,
          section: item as UiPopupEmbeddedDefinition['section'],
        }),
    });
  registry.register('feature-content', {
    dataPath: (definition) =>
      (definition as UiPopupFeatureContentDefinition).variantField ? 'data.fields' : 'data.content',
    create: (definition) => {
      const feature = definition as UiPopupFeatureContentDefinition;
      return feature.variantField
        ? new PopupVariantFeatureContentEmbedded(feature)
        : new PopupFeatureContentEmbedded(feature);
    },
  });
  registry.register('intro', {
    dataPath: 'data.content',
    create: (d) => new PopupIntroEmbedded(d),
  });
  for (const kind of ['notice', 'note'])
    registry.register(kind, {
      dataPath: 'data.content',
      create: (d) => new PopupTextEmbedded(d),
    });
  registry.register('email-method', {
    dataPath: 'data.content',
    create: (d) => new PopupEmailMethodEmbedded(d),
  });
  registry.register('auth-credentials', {
    inlineSection: true,
    dataPath: 'data.fields',
    create: (item) => new AuthCredentialsEmbedded(item as UiPopupCredentialsDefinition),
  });
  registry.register('auth-credential-field', {
    dataPath: 'data.fields',
    create: (d) => new AuthCredentialFieldEmbedded(d as AuthCredentialFieldDefinition),
  });
  registry.register('auth-password-guidance', {
    dataPath: 'data.fields',
    create: (d) => new AuthPasswordGuidanceEmbedded(d as AuthCredentialFieldDefinition),
  });
  registry.register('auth-provider-action', {
    dataPath: 'data.resources.runtime.externalAuthProviders',
    create: (d) => new ExternalProviderActionEmbedded(d as ExternalProviderActionDefinition),
  });
  registry.register('external-providers', {
    inlineSection: true,
    dataPath: 'data.resources.runtime.externalAuthProviders',
    statusPath: 'state.externalAuthProviders',
    resource: {
      name: 'externalAuthProviders',
      initialValue: [],
      initialStatus: 'idle',
    },
    create: (d) => new ExternalProvidersEmbedded(d),
  });
  return registry;
}
