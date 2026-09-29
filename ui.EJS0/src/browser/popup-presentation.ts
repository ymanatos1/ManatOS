import { popupContent } from '../presentation/popup/popup-content.js';
import type { UiPresentationDefinition } from '../runtime/v2/presentation.js';

export interface BrowserPopupPresentationDescriptor {
  readonly title: string;
  readonly layout: string;
  readonly recoverable?: boolean;
  readonly definition?: UiPresentationDefinition;
}

const messagePopupDefinition = (actions: readonly string[]): UiPresentationDefinition => ({
  regions: Object.freeze([
    Object.freeze({
      id: 'content',
      role: 'content',
      composition: Object.freeze([
        Object.freeze({ key: 'message', kind: 'component', component: 'popup-message' }),
      ]),
    }),
  ]),
  chrome: Object.freeze({
    actionsRendererRef: 'actions:surface',
    actions: Object.freeze(
      actions.map((key) =>
        Object.freeze({ key, kind: 'action' as const, rendererRef: `layout-action:${key}` }),
      ),
    ),
  }),
});

const reportPopupDefinition: UiPresentationDefinition = Object.freeze({
  regions: Object.freeze([
    Object.freeze({
      id: 'content',
      role: 'content',
      composition: Object.freeze([
        Object.freeze({ key: 'report', kind: 'component', component: 'semantic-change-report' }),
      ]),
    }),
  ]),
  chrome: Object.freeze({
    actionsRendererRef: 'actions:surface',
    actions: Object.freeze([
      Object.freeze({ key: 'close', kind: 'action' as const, rendererRef: 'layout-action:close' }),
    ]),
  }),
});

const hierarchyCommitPopupDefinition: UiPresentationDefinition = Object.freeze({
  regions: Object.freeze([
    Object.freeze({
      id: 'content',
      role: 'content',
      composition: Object.freeze([
        Object.freeze({ key: 'report', kind: 'component', component: 'commit-plan-report' }),
      ]),
    }),
  ]),
  chrome: Object.freeze({
    actionsRendererRef: 'actions:surface',
    actions: Object.freeze([
      Object.freeze({
        key: 'cancel',
        kind: 'action' as const,
        rendererRef: 'layout-action:cancel',
      }),
      Object.freeze({
        key: 'commit',
        kind: 'action' as const,
        rendererRef: 'layout-action:commit',
      }),
    ]),
  }),
});

const descriptors: Readonly<Record<string, BrowserPopupPresentationDescriptor>> = Object.freeze({
  alert: Object.freeze({
    title: 'Notice',
    layout: 'standard',
    recoverable: false,
    definition: messagePopupDefinition(['ok']),
  }),
  'unsaved-changes': Object.freeze({
    title: 'Unsaved changes',
    layout: 'standard',
    recoverable: false,
    definition: messagePopupDefinition(['cancel', 'discard', 'save']),
  }),
  'semantic-change-report': Object.freeze({
    title: 'Unsaved changes',
    layout: 'report',
    recoverable: false,
    definition: reportPopupDefinition,
  }),
  'hierarchy-commit': Object.freeze({
    title: 'Commit changes',
    layout: 'report',
    recoverable: false,
    definition: hierarchyCommitPopupDefinition,
  }),
  'workspace-recovery': Object.freeze({
    title: 'Recover previous workspace?',
    layout: 'report',
    recoverable: false,
    definition: Object.freeze({
      regions: Object.freeze([
        Object.freeze({
          id: 'content',
          role: 'content',
          composition: Object.freeze([
            Object.freeze({ key: 'summary', kind: 'component', component: 'recovery-summary' }),
            Object.freeze({ key: 'report', kind: 'component', component: 'recovery-plan-report' }),
          ]),
        }),
      ]),
      chrome: Object.freeze({
        actionsRendererRef: 'actions:surface',
        actions: Object.freeze([
          Object.freeze({
            key: 'forget',
            kind: 'action' as const,
            rendererRef: 'layout-action:forget',
          }),
          Object.freeze({
            key: 'recover',
            kind: 'action' as const,
            rendererRef: 'layout-action:recover',
          }),
        ]),
      }),
    }),
  }),
  'workspace-recovery-success': Object.freeze({
    title: 'Workspace restored',
    layout: 'report',
    recoverable: false,
    definition: Object.freeze({
      regions: Object.freeze([
        Object.freeze({
          id: 'content',
          role: 'content',
          composition: Object.freeze([
            Object.freeze({
              key: 'summary',
              kind: 'component',
              component: 'recovery-result-summary',
            }),
            Object.freeze({
              key: 'report',
              kind: 'component',
              component: 'recovery-result-report',
            }),
          ]),
        }),
      ]),
      chrome: Object.freeze({
        actionsRendererRef: 'actions:surface',
        actions: Object.freeze([
          Object.freeze({
            key: 'close',
            kind: 'action' as const,
            rendererRef: 'layout-action:close',
          }),
        ]),
      }),
    }),
  }),
  'auth-sign-in': Object.freeze({
    title: popupContent.auth.signIn.modalTitle,
    layout: 'rich',
    definition: Object.freeze({
      regions: Object.freeze([
        Object.freeze({
          id: 'content',
          role: 'content',
          composition: Object.freeze([
            Object.freeze({ key: 'hero', kind: 'component', component: 'auth-hero' }),
            Object.freeze({
              key: 'methods',
              kind: 'inline',
              children: Object.freeze([
                Object.freeze({
                  key: 'external-provider',
                  kind: 'component',
                  component: 'auth-external-provider',
                }),
                Object.freeze({
                  key: 'credentials',
                  kind: 'component',
                  component: 'auth-credentials',
                }),
              ]),
            }),
          ]),
        }),
        Object.freeze({
          id: 'actions',
          role: 'actions',
          composition: Object.freeze([
            Object.freeze({ key: 'cancel', kind: 'action', action: 'cancel' }),
            Object.freeze({ key: 'sign-in', kind: 'action', action: 'sign-in' }),
          ]),
        }),
      ]),
    }),
  }),
});

export const popupPresentationDescriptor = (
  purpose: string,
): BrowserPopupPresentationDescriptor | undefined => descriptors[purpose];

export const installPopupPresentationDescriptors = (): void => {
  window.ManatOS ||= {};
  const manatos = window.ManatOS as typeof window.ManatOS & {
    popupPresentationV2?: {
      resolve(purpose: string): BrowserPopupPresentationDescriptor | undefined;
    };
  };
  manatos.popupPresentationV2 = Object.freeze({ resolve: popupPresentationDescriptor });
};
