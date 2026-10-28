import { UiEmbeddedComponentRegistry } from '../../../runtime/component.js';

import { AuthCredentialsEmbedded } from './auth-credentials-layout.js';
import { ExternalProvidersEmbedded } from './external-providers-layout.js';

import type { UiPopupCredentialsDefinition } from '../../popup-definition.js';

/**
 * Explicit registration of the two current Auth components.
 *
 * This is composition configuration, not special-case behavior
 * in the popup runtime.
 *
 * Later surfaces may register additional implementations.
 * UIS ownership: auth-specific semantic components, separate from popup generic mechanics.
 */
export function createAuthEmbeddedRegistry(): UiEmbeddedComponentRegistry {
  return new UiEmbeddedComponentRegistry()
    .register('auth-credentials', {
      dataPath: 'data.fields',

      create: (definition) =>
        new AuthCredentialsEmbedded(definition as UiPopupCredentialsDefinition),
    })
    .register('external-providers', {
      dataPath: 'data.resources.runtime.externalAuthProviders',
      statusPath: 'state.externalAuthProviders',

      resource: {
        name: 'externalAuthProviders',
        initialValue: [],
        initialStatus: 'idle',
      },

      create: (d) => new ExternalProvidersEmbedded(d),
    });
}
