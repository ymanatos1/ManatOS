/**
 * Framework-independent semantic definitions for ManatOS functional popups.
 *
 * These describe WHAT a popup contains. Angular, EJS and other UI
 * adapters decide HOW to render the declared components.
 *
 * A popup owns exactly one #level. Multiple views may opt into tab selection;
 * single-view popups carry no mutable tab-selection state.
 * Component IDs are stable within that popup and are reused by #layout.
 */

import type { UiPageIdentity, MultilingualLiteral } from '@manatos/shared';

/** User-visible popup text, resolved only by presentation consumers. */
export type UiPopupText = string | MultilingualLiteral;

export type UiPopupId =
  | 'auth.signin'
  | 'auth.register'
  | 'auth.resetPassword'
  | 'auth.changePassword'
  | 'message.alert'
  | 'message.error'
  | 'semantic.changeReport'
  | 'semantic.unsavedChanges'
  | (string & {});

export type UiPopupCredentialMode = 'signin' | 'register' | 'recovery' | 'reset' | 'change';
export type UiPopupProviderPurpose = 'signin' | 'register';

/** Anonymous-safe provider data returned by the public API. */
export interface UiPublicExternalAuthProvider {
  readonly provider: string;
  readonly label: string;
  readonly icon: string;
  readonly registered: boolean;
  readonly enabled: boolean;
  readonly configured: boolean;
  readonly hostAvailable?: boolean;
}

export interface UiPopupTitleDefinition {
  readonly title: UiPopupText;
  readonly subtitle: UiPopupText;
  readonly icon: string;
}

export interface UiPopupFieldDefinition {
  readonly id: string;
  readonly label: UiPopupText;
  readonly type: 'text' | 'email' | 'password';
  readonly autocomplete: string;
  readonly required: boolean;
  readonly minLength?: number;

  /**
   * Password requirements are popup-definition policy, not
   * independently authored Angular validation rules.
   */
  readonly requiresAlpha?: boolean;
  readonly requiresNumber?: boolean;
  readonly requiresSymbol?: boolean;

  /**
   * Sensitive fields never expose their actual value through CTX.
   * Angular keeps the raw password only in its protected form input.
   */
  readonly sensitive?: boolean;
}

export interface UiPopupIntroDefinition {
  readonly id: string;
  readonly kind: 'intro';
  readonly page: UiPageIdentity;
}

export interface UiPopupSectionDefinition {
  readonly id: string;
  readonly kind: 'section';
  readonly icon: string;
  readonly heading: UiPopupText;
  readonly description?: UiPopupText;
  readonly children: readonly UiPopupContentDefinition[];
}

export interface UiPopupProvidersDefinition {
  readonly id: string;
  readonly kind: 'external-providers';
  readonly purpose: UiPopupProviderPurpose;
}

export interface UiPopupCredentialsDefinition {
  readonly id: string;
  readonly kind: 'auth-credentials';
  readonly mode: UiPopupCredentialMode;
  readonly fieldIds: readonly string[];
  /** Optional navigation action owned by the credential component. */
  readonly recoveryActionId?: string;
}

export interface UiPopupEmailMethodDefinition {
  readonly id: string;
  readonly kind: 'email-method';
  readonly label: UiPopupText;
  readonly description: UiPopupText;
  readonly actionId: string;
}

export interface UiPopupNoticeDefinition {
  readonly id: string;
  readonly kind: 'notice';
}

export interface UiPopupNoteDefinition {
  readonly id: string;
  readonly kind: 'note';
  readonly icon: string;
  readonly text: UiPopupText;
  readonly illustration?: string;
}

export type UiPopupContentDefinition =
  | UiPopupIntroDefinition
  | UiPopupSectionDefinition
  | UiPopupProvidersDefinition
  | UiPopupCredentialsDefinition
  | UiPopupEmailMethodDefinition
  | UiPopupNoticeDefinition
  | UiPopupNoteDefinition
  | UiPopupFeatureContentDefinition;

/** A feature-owned embedded body; the popup framework does not know its domain. */
export interface UiPopupFeatureContentDefinition {
  readonly id: string;
  readonly kind: 'feature-content';
  /** An embedded feature owns its semantic child declarations explicitly. */
  readonly children?: readonly UiPopupFeatureContentDefinition[];
  /** Optional conditional child composition, driven by a declared ordinary CTX field. */
  readonly variantField?: string;
  readonly variants?: Readonly<Record<string, readonly UiPopupFeatureContentDefinition[]>>;
}

export interface UiPopupActionDefinition {
  readonly id: string;
  readonly label: UiPopupText;
  readonly icon?: string;
  readonly type: 'button' | 'submit';
  readonly alignment?: 'start' | 'end';
  /** Presentation only: non-submit actions may be visually primary. */
  readonly primary?: boolean;
  /** Generic semantic intent. Adapters may style danger actions accordingly. */
  readonly tone?: 'danger' | 'normal';
  /** Dismiss locally after a valid action only if no Flow/caller event owns it. */
  readonly dismissIfUnmapped?: boolean;
  /** Switch the active hidden tab without creating another popup or CTX level. */
  readonly targetTab?: string;

  /**
   * Existing ManatOS expression syntax.
   * Evaluated relative to this popup's own #level.
   *
   * No expression means the action is enabled.
   */
  readonly enabledWhen?: string;
  readonly visibleWhen?: string;
}

export interface UiPopupTabDefinition {
  readonly id: string;
  readonly title: UiPopupTitleDefinition;
  readonly content: readonly UiPopupContentDefinition[];
  readonly actions: readonly UiPopupActionDefinition[];
  /** Optional reactive tab conditions. Absent conditions preserve existing Auth behavior. */
  readonly visibleWhen?: string;
  readonly enabledWhen?: string;
  /** Step completion policy, independent from visibility and navigation. */
  readonly requiredWhen?: string;
  /** Ordinary popup field IDs whose changes invalidate this tab's completion evidence. */
  readonly invalidateOn?: readonly string[];
}

export interface UiPopupRuleDefinition {
  readonly id: string;
  readonly expression: string;
}

/** Optional control navigation, including controls embedded in content (not just footer). */
export interface UiPopupNavigationDefinition {
  readonly from: string;
  readonly to: string;
  readonly actionId: string;
}

/** Optional renderer capability, not an Auth/Message check in generic hosts. */
export interface UiPopupPresentation {
  readonly content?: 'standard' | 'message' | 'change-report' | (string & {});
  /** Expose an accessible tab strip; Auth's hidden tabs stay hidden by default. */
  readonly tabNavigation?: 'visible';
  /** CSS-only appearance; never used for action/CTX workflow policy. */
  readonly variant?:
    'register' | 'reset' | 'change' | 'message' | 'error' | 'report' | 'unsaved' | 'storage';
}

export interface UiPopupDefinition {
  readonly id: UiPopupId;
  readonly presentation?: UiPopupPresentation;
  /** PopupTabs is an opt-in capability. A standalone popup declares only view. */
  readonly initialTab?: string;
  readonly view?: UiPopupTabDefinition;
  /** Absent means no cross-tab navigation capability is required. */
  readonly navigation?: readonly UiPopupNavigationDefinition[];
  /** Optional single popup-wide footer; absent preserves Auth per-tab actions. */
  readonly actions?: readonly UiPopupActionDefinition[];

  readonly showLanguageSelection: boolean;
  readonly allowFontScale: boolean;
  readonly allowDebugger: boolean;

  readonly fields: readonly UiPopupFieldDefinition[];
  readonly rules: readonly UiPopupRuleDefinition[];
  readonly tabs?: readonly UiPopupTabDefinition[];
}

/** Normalize presentation views without introducing a mandatory Tabs capability.
 * Exactly one of `view` or `tabs` must be declared.
 * Tab navigation is available only when `tabs` has two or more entries.
 */
export function popupViews(definition: UiPopupDefinition): readonly UiPopupTabDefinition[] {
  if (definition.view && definition.tabs)
    throw new Error('Popup cannot declare both view and tabs.');
  const views = definition.view ? [definition.view] : (definition.tabs ?? []);
  if (!views.length) throw new Error('Popup must declare a view or tabs.');
  if (definition.tabs && definition.tabs.length < 2)
    throw new Error('PopupTabs requires at least two views; use view instead.');
  return views;
}
