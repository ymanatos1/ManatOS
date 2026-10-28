import type { ApiHandler } from '../../api/apiHandler.js';
import type { UiPopupLevel } from '../../popups/popup-runtime.js';
import type { UiSurfaceHandle, UiSurfaceManager } from '../../runtime/surface/uiSurfaceManager.js';
import type { FlowExecution, FlowStepDefinition } from '../flowRunner.js';

/** Authenticated credential change. The Flow holds no password beyond the API call. */
export class ChangePasswordFlow {
  constructor(
    private readonly surfaces: UiSurfaceManager,
    private readonly api: ApiHandler,
  ) {}

  steps(): readonly FlowStepDefinition[] {
    return [
      {
        id: 'openChangePasswordPopup',
        children: ['changePassword', 'popupDisposing'],
        run: (execution) => this.openPopup(execution),
      },
    ];
  }

  private openPopup(execution: FlowExecution): Promise<void> {
    const popup = this.surfaces.open('auth.changePassword', {
      allowXClosure: true,
      allowBackdropClosure: false,
      flow: execution.surfaceFlow(execution.stepPath('openChangePasswordPopup'), {
        changePassword: 'auth.changePassword.submitted',
      }),
    });
    execution.wait('openChangePasswordPopup');
    return new Promise((resolve) => {
      const unsubscribe = execution.bindSurfaceEvents(popup, 'openChangePasswordPopup', {
        'auth.changePassword.submitted': {
          step: 'changePassword',
          run: (level) => this.change(popup, level),
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

  private async change(popup: UiSurfaceHandle, level: UiPopupLevel): Promise<void> {
    if (!popup.isOpen() || level.state.rules.canChange !== true) return;
    const credentials = popup.readChangePasswordCredentials();
    if (!credentials || credentials.password !== credentials.confirmation) return;
    popup.setBusy(true);
    try {
      await this.api.changePassword(credentials.currentPassword || undefined, credentials.password);
      if (!popup.isOpen()) return;
      popup.setBusy(false);
      await this.alert(
        { EN: 'Password updated', EL: 'Ο κωδικός ενημερώθηκε' },
        {
          EN: 'Your password was changed successfully.',
          EL: 'Ο κωδικός πρόσβασής σας άλλαξε επιτυχώς.',
        },
      );
      if (popup.isOpen()) popup.close();
    } catch (error) {
      if (!popup.isOpen()) return;
      popup.setBusy(false);
      await this.alert(
        { EN: 'Password change failed', EL: 'Αποτυχία αλλαγής κωδικού' },
        error instanceof Error ? error.message : 'Could not change the password.',
      );
    }
  }

  private alert(
    caption: { EN: string; EL: string },
    text: string | { EN: string; EL: string },
  ): Promise<void> {
    const child = this.surfaces.open('message.alert', {
      params: {
        caption,
        text,
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
