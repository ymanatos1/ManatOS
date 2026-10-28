import type { UiPopupCredentialsDefinition } from '../../popup-definition.js';
import { popupComponentLayout, popupSelector } from '../../embedded/PopupComponents.js';
import { createUiSemanticLayoutNode } from '../../../runtime/layout/node.js';
import { uiEmbeddedScopeId } from '../../../runtime/component.js';

import type {
  UiEmbeddedComponent,
  UiEmbeddedContextBinding,
  UiEmbeddedLayoutWriter,
  UiSemanticLayoutNode,
  UiSemanticContentDefinition,
} from '../../../runtime/component.js';

/**
 * AuthCredentials supports Sign In, Register, and Recovery semantic modes.
 *
 * It receives a restricted CTX binding and directly populates
 * the existing #layout node supplied by its caller.
 *
 * It never creates its own #level or stores passwords.
 * UIS ownership: credential input controls and only safe validation facts; never send raw passwords to CTX.
 */
export class AuthCredentialsEmbedded implements UiEmbeddedComponent {
  private binding: UiEmbeddedContextBinding | null = null;

  constructor(private readonly definition: UiPopupCredentialsDefinition) {}

  createLayoutNode(): UiSemanticLayoutNode {
    return popupComponentLayout('component', this.definition.id, popupSelector(this.definition.id));
  }

  bindContext(binding: UiEmbeddedContextBinding): void {
    this.binding = binding;
  }

  populateLayout(target: UiSemanticLayoutNode, writer: UiEmbeddedLayoutWriter): void {
    const tabId = uiEmbeddedScopeId(this.requireBinding(), this.definition.id);

    const has = (id: string): boolean => this.definition.fieldIds.includes(id);

    const field = (
      parent: UiSemanticLayoutNode,
      id: string,
      path: readonly string[] = [],
    ): void => {
      if (!has(id)) return;
      writer.mount(
        parent,
        {
          id,
          kind: 'auth-credential-field',
          scopeId: tabId,
          validationFeedback: id === 'recoveryIdentity',
        } as AuthCredentialFieldDefinition,
        path,
      );
    };

    if (this.definition.mode === 'signin') {
      field(target, 'identity');
      field(target, 'password');

      writer.add(target, 'passwordRecovery', 'action', `${tabId}-password-recovery`);

      return;
    }

    if (this.definition.mode === 'recovery') {
      field(target, 'recoveryIdentity');
      return;
    }

    const identity = writer.add(
      target,
      'identityColumn',
      'column',
      `${tabId}-credentials-identity-column`,
    );

    field(identity, 'username', ['identityColumn']);
    field(identity, 'email', ['identityColumn']);

    const security = writer.add(
      target,
      'securityColumn',
      'column',
      `${tabId}-credentials-security-column`,
    );

    field(security, 'currentPassword', ['securityColumn']);
    field(security, 'password', ['securityColumn']);
    field(security, 'confirmPassword', ['securityColumn']);

    writer.mount(
      target,
      {
        id: 'passwordGuidance',
        kind: 'auth-password-guidance',
        scopeId: tabId,
      } as AuthCredentialFieldDefinition,
      [],
    );
  }

  dispose(): void {
    this.binding = null;
  }

  private requireBinding(): UiEmbeddedContextBinding {
    if (!this.binding) throw new Error('AuthCredentials embedded component is not bound.');

    return this.binding;
  }
}

/** A credential Field independently owns label, input, and optional feedback. */
export interface AuthCredentialFieldDefinition extends UiSemanticContentDefinition {
  readonly scopeId: string;
  readonly validationFeedback?: boolean;
}

/** UIS ownership: one credential input node and validation state, never secret contents in CTX. */
export class AuthCredentialFieldEmbedded implements UiEmbeddedComponent {
  constructor(private readonly definition: AuthCredentialFieldDefinition) {}
  createLayoutNode(): UiSemanticLayoutNode {
    return createUiSemanticLayoutNode(
      'field',
      this.definition.id,
      `popup:${this.definition.id}`,
      popupSelector(`${this.definition.scopeId}-field-${this.definition.id}`),
      {},
      this.definition.id,
    );
  }
  bindContext(): void {
    // Credentials are deliberately kept in protected host-native input state.
  }
  populateLayout(target: UiSemanticLayoutNode, writer: UiEmbeddedLayoutWriter): void {
    const { id, scopeId } = this.definition;
    writer.add(target, 'label', 'label', `${scopeId}-field-${id}-label`);
    writer.add(target, 'input', 'input', `${scopeId}-field-${id}-input`);
    if (this.definition.validationFeedback) {
      writer.add(target, 'validationFeedback', 'message', `${scopeId}-field-${id}-feedback`);
      writer.add(target, 'help', 'description', `${scopeId}-field-${id}-help`);
    }
  }
}

/** Shared password guidance is one independently mounted component.
 * UIS ownership: password policy guidance and nonsecret validation feedback. */
export class AuthPasswordGuidanceEmbedded implements UiEmbeddedComponent {
  constructor(private readonly definition: AuthCredentialFieldDefinition) {}
  createLayoutNode(): UiSemanticLayoutNode {
    return popupComponentLayout(
      'region',
      this.definition.id,
      popupSelector(`${this.definition.scopeId}-password-guidance`),
    );
  }
  bindContext(): void {
    // Static semantic guidance; native renderers resolve localized text.
  }
  populateLayout(target: UiSemanticLayoutNode, writer: UiEmbeddedLayoutWriter): void {
    const scopeId = this.definition.scopeId;
    writer.add(target, 'title', 'region', `${scopeId}-password-guidance-title`);
    const rules = writer.add(target, 'rules', 'region', `${scopeId}-password-rules`);
    for (const id of ['length', 'alpha', 'number', 'symbol', 'match'])
      writer.add(rules, id, 'value', `${scopeId}-password-rule-${id}`);
  }
}
