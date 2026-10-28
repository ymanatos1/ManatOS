import { Component, computed, viewChild } from '@angular/core';
import { type UiPopupCredentialsDefinition } from '@manatos/shared-ui';
import { AuthCredentials } from './embedded/AuthCredentials';
import { ContentItemBase } from './PopupContentBase';

/**
 * Owns the AuthCredentials child mount and focus delegation, NOT its inputs.
 * Native sensitive values remain only in AuthCredentials; the parent popup
 * composes this slot without bypassing credential field/policy registration.
 * Breakpoint: focusFirst() for focus handoff.
 */
@Component({
  selector: 'manatos-popup-credentials-content',
  standalone: true,
  imports: [AuthCredentials],
  host: { style: 'display: contents' },
  templateUrl: './PopupCredentialsContent.html',
})
export class PopupCredentialsContent extends ContentItemBase {
  protected readonly item = computed(() => this.definition() as UiPopupCredentialsDefinition);
  private readonly credential = viewChild(AuthCredentials);
  get credentials(): AuthCredentials | undefined {
    return this.credential();
  }
  focusFirst(): boolean {
    const credential = this.credential();
    if (!credential) return false;
    credential.focusFirst();
    return true;
  }
}
