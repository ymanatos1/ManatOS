import type { ApiHandler } from '../../api/apiHandler.js';
import type { UiPopupLevel } from '../../popups/popup-runtime.js';
import type { UiSurfaceHandle, UiSurfaceManager } from '../../runtime/surface/uiSurfaceManager.js';
import type { FlowExecution, FlowStepDefinition } from '../flowRunner.js';

/** Executes the emailed link without publishing its token or passwords into inspectable CTX. */
export class ResetPasswordFlow {
  constructor(
    private readonly surfaces: UiSurfaceManager,
    private readonly api: ApiHandler,
    private readonly token: string,
  ) {}

  steps(): readonly FlowStepDefinition[] {
    return [
      {
        id: 'checkToken',
        run: async () => {
          if (this.token && (await this.api.inspectPasswordRecovery(this.token)).valid) return;
          await this.alert(
            'Password link invalid',
            'This password link is invalid or has expired.',
          );
          return { stop: true };
        },
      },
      {
        id: 'openResetPasswordPopup',
        children: ['resetPassword', 'popupDisposing'],
        run: (execution) => this.openPopup(execution),
      },
    ];
  }

  private openPopup(execution: FlowExecution): Promise<void> {
    const popup = this.surfaces.open('auth.resetPassword', {
      allowXClosure: true,
      allowBackdropClosure: false,
      flow: execution.surfaceFlow(execution.stepPath('openResetPasswordPopup'), {
        resetPassword: 'auth.resetPassword.submitted',
      }),
    });
    execution.wait('openResetPasswordPopup');
    return new Promise((resolve) => {
      const unsubscribe = execution.bindSurfaceEvents(popup, 'openResetPasswordPopup', {
        'auth.resetPassword.submitted': {
          step: 'resetPassword',
          run: (level) => this.reset(popup, level),
        },
        disposing: {
          step: 'popupDisposing',
          run: () => {
            unsubscribe();
            resolve();
          },
        },
      });
    });
  }

  private async reset(popup: UiSurfaceHandle, level: UiPopupLevel): Promise<void> {
    if (!popup.isOpen() || level.state.rules.canReset !== true) return;
    const credentials = popup.readResetPasswordCredentials();
    if (!credentials || credentials.password !== credentials.confirmation) return;
    popup.setBusy(true);
    try {
      await this.api.completePasswordRecovery(this.token, credentials.password);
      if (!popup.isOpen()) return;
      popup.setBusy(false);
      await this.alert(
        { EN: 'Password updated', EL: 'Ο κωδικός πρόσβασης ενημερώθηκε' },
        {
          EN: 'Your password was updated successfully. A confirmation email was sent to your registered address.',
          EL: 'Ο κωδικός πρόσβασής σας ενημερώθηκε επιτυχώς. Ένα email επιβεβαίωσης στάλθηκε στην καταχωρισμένη διεύθυνσή σας.',
        },
        '/_manatos/pages/messages/assets/password-updated.png',
      );
      if (popup.isOpen()) popup.close();
    } catch (error) {
      if (!popup.isOpen()) return;
      popup.setBusy(false);
      const text = error instanceof Error ? error.message : 'Password could not be changed.';
      await this.alert({ EN: 'Password reset failed', EL: 'Η επαναφορά κωδικού απέτυχε' }, text);
    }
  }

  private alert(
    caption: string | { EN: string; EL: string },
    text: string | { EN: string; EL: string },
    illustration?: string,
  ): Promise<void> {
    const child = this.surfaces.open('message.alert', {
      params: {
        caption,
        text,
        ...(illustration ? { illustration } : {}),
        buttons: [{ id: 'ok', label: { EN: 'OK', EL: 'Εντάξει' } }],
      },
      allowXClosure: true,
      allowBackdropClosure: false,
    });
    return new Promise((resolve) => {
      const unsubscribe = child.onEvent((name) => {
        if (name === 'disposing') {
          unsubscribe();
          resolve();
        }
      });
    });
  }
}
