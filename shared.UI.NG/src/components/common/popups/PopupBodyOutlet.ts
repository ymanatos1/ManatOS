/**
 * ANGULAR POPUP BODY CAPABILITY
 * Definition.presentation.content selects a registered adapter, never a host switch.
 * Each concrete body owns markup, events, credential access and its children.
 * PopupBase owns only the modal/CTX lifecycle and forwards capability requests.
 * To add a body: implement Angular inputs and register a presenter below.
 */
import {
  Component,
  ViewContainerRef,
  effect,
  type ComponentRef,
  type Type,
  input,
  output,
  viewChild,
} from '@angular/core';
import type { MetadataLanguage } from '@manatos/shared';
import type {
  UiPageTemplateContext,
  UiPopupPresentation,
  UiPopupTabDefinition,
} from '@manatos/shared-ui';
import { AuthPopupContent } from '../../auth/AuthPopupContent';
import { PopupContext } from '../../surfaces/PopupContext';
import { MessagePopupContent } from './MessagePopupContent';

/** Native-sensitive state stays inside the concrete body, never in CTX. */
export interface PopupCredentialsCapability {
  focusFirst(): void;
  resetCredentials(): void;
  signInValues(): { identity: string; password: string } | null;
  registerValues(): { name: string; email: string; password: string; confirmation: string } | null;
  resetPasswordValues(): { password: string; confirmation: string } | null;
  changePasswordValues(): {
    currentPassword: string;
    password: string;
    confirmation: string;
  } | null;
}
type BodyKind = NonNullable<UiPopupPresentation['content']>;
type BodyInput = 'popup' | 'tab' | 'language' | 'contentContext' | 'featureContext';
interface BodyRegistration {
  readonly component: Type<unknown>;
  readonly inputs: readonly BodyInput[];
  readonly connect?: (instance: unknown, host: PopupBodyOutlet) => void;
  readonly credentials?: (instance: unknown) => PopupCredentialsCapability;
  readonly focus?: (instance: unknown) => void;
}

/** Registry is owned by the adapter: shared.UI knows no Angular component types. */
export class AngularPopupBodyRegistry {
  private readonly entries = new Map<BodyKind, BodyRegistration>();
  private readonly tabs = new Map<BodyKind, Map<string, BodyRegistration>>();
  register(kind: BodyKind, entry: BodyRegistration): this {
    if (this.entries.has(kind)) throw new Error(`Duplicate Angular popup body: ${kind}`);
    this.entries.set(kind, entry);
    return this;
  }

  /**
   * Optional tab-specific body composition. Adapters register concrete tabs;
   * a popup retains the same CTX #level when its active tab changes.
   * Without a tab registration the original body remains mounted, preserving
   * Auth hidden-tab behavior and existing Storage behavior.
   */
  registerTab(kind: BodyKind, tabId: string, entry: BodyRegistration): this {
    if (!tabId) throw new Error('Popup tab registration needs a tab identifier.');
    const variants = this.tabs.get(kind) ?? new Map<string, BodyRegistration>();
    if (variants.has(tabId)) throw new Error(`Duplicate popup tab body: ${kind}/${tabId}`);
    variants.set(tabId, entry);
    this.tabs.set(kind, variants);
    return this;
  }

  resolve(kind: BodyKind, tabId?: string): BodyRegistration {
    const entry = (tabId ? this.tabs.get(kind)?.get(tabId) : undefined) ?? this.entries.get(kind);
    if (!entry) throw new Error(`Unregistered Angular popup body: ${kind}`);
    return entry;
  }
}

export const popupBodyRegistry = new AngularPopupBodyRegistry()
  .register('standard', {
    component: AuthPopupContent,
    inputs: ['popup', 'tab', 'language', 'contentContext'],
    credentials: (instance) => instance as AuthPopupContent,
    connect(instance, host) {
      const content = instance as AuthPopupContent;
      content.emailMethodRequested.subscribe((value) => host.emailMethodRequested.emit(value));
      content.externalProviderRequested.subscribe((value) =>
        host.externalProviderRequested.emit(value),
      );
      content.passwordRecoveryRequested.subscribe((value) =>
        host.passwordRecoveryRequested.emit(value),
      );
    },
  })
  .register('message', {
    component: MessagePopupContent,
    inputs: ['popup', 'contentContext'],
  });

/** Runtime outlet: change of content capability disposes the previous Angular body. */
@Component({
  selector: 'manatos-popup-body-outlet',
  standalone: true,
  template: '<ng-container #bodyHost></ng-container>',
  styles: [':host { display: contents; }'],
})
export class PopupBodyOutlet {
  readonly kind = input.required<BodyKind>();
  readonly popup = input.required<PopupContext>();
  readonly tab = input.required<UiPopupTabDefinition>();
  readonly language = input.required<MetadataLanguage>();
  readonly contentContext = input.required<UiPageTemplateContext>();
  readonly featureContext = input<unknown>(null);
  readonly emailMethodRequested = output<string>();
  readonly externalProviderRequested = output<string>();
  readonly passwordRecoveryRequested = output<string>();

  private readonly bodyHost = viewChild('bodyHost', { read: ViewContainerRef });
  private active: ComponentRef<unknown> | null = null;
  private registration: BodyRegistration | null = null;

  constructor() {
    effect(() => {
      const host = this.bodyHost();
      if (!host) return;
      const kind = this.kind();
      const values = {
        popup: this.popup(),
        tab: this.tab(),
        language: this.language(),
        contentContext: this.contentContext(),
        featureContext: this.featureContext(),
      };
      const registration = popupBodyRegistry.resolve(kind, values.tab.id);
      if (registration !== this.registration) {
        host.clear(); // Destroys only the previous registered native body.
        this.registration = registration;
        this.active = host.createComponent(registration.component);
        registration.connect?.(this.active.instance, this);
      }
      if (this.active && this.registration)
        for (const key of this.registration.inputs) this.active.setInput(key, values[key]);
    });
  }

  credentials(): PopupCredentialsCapability | null {
    return this.active && this.registration?.credentials
      ? this.registration.credentials(this.active.instance)
      : null;
  }
  focusFirst(): void {
    if (this.active && this.registration?.focus) {
      this.registration.focus(this.active.instance);
    } else {
      this.credentials()?.focusFirst();
    }
  }
  resetCredentials(): void {
    this.credentials()?.resetCredentials();
  }
}
