import {
  UiPopupRuntime,
  type UiPopupText,
  type UiPopupTabDefinition,
  type UiSurfaceCloseReason,
  multilingual,
} from '@manatos/shared-ui';

function text(value: UiPopupText | undefined, language: 'EN' | 'EL'): string {
  if (value === undefined) return '';
  return multilingual(language, []).resolve(value);
}

/** NG1-equivalent semantic actions; enabled/visible state remains authoritative in CTX. */
export class PopupActions {
  constructor(private readonly language: () => 'EN' | 'EL') {}

  render(
    dialog: HTMLElement,
    runtime: UiPopupRuntime,
    close: (reason?: UiSurfaceCloseReason, actionId?: string | null) => void,
    tab: UiPopupTabDefinition = runtime.activeTab,
  ): void {
    const actions = runtime.definition.actions ?? tab.actions;
    if (!actions.length) return;
    const footer = document.createElement('footer');
    footer.className = 'ejs-semantic-popup-footer';
    footer.dataset.popupLayoutId = `${tab.id}-actions`;
    for (const action of actions) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.ejsPopupAction = action.id;
      button.dataset.popupLayoutId = `${tab.id}-action-${action.id}`;
      button.classList.toggle('ejs-semantic-popup-action-start', action.alignment === 'start');
      button.classList.toggle('popup-action-danger', action.tone === 'danger');
      button.classList.toggle(
        'ejs-semantic-popup-action-submit',
        action.type === 'submit' || action.primary === true,
      );
      const icon = document.createElement('i');
      icon.className = `bi ${action.icon ?? ''}`;
      icon.setAttribute('aria-hidden', 'true');
      icon.hidden = !action.icon;
      icon.dataset.ejsPopupActionIcon = '';
      const spinner = document.createElement('span');
      spinner.className = 'auth-action-spinner';
      spinner.setAttribute('aria-hidden', 'true');
      spinner.hidden = true;
      spinner.dataset.ejsPopupActionSpinner = '';
      const label = document.createElement('span');
      label.dataset.ejsPopupActionLabel = '';
      button.append(icon, spinner, label);
      button.addEventListener('click', () => {
        if (
          runtime.activeTab.id !== tab.id ||
          runtime.level.state.busy ||
          runtime.level.state.visibleActions[action.id] === false ||
          runtime.level.state.actions[action.id] !== true
        )
          return;
        // All semantic actions pass through the shared runtime. Only a local
        // dismissal closes without a Flow/caller callback, as in NG1.
        // Preserve the exact button identifier in #control.result before disposal.
        if (action.id === 'cancel') {
          runtime.requestAction(action.id);
          close('button', action.id);
          return;
        }
        const mapped =
          runtime.level.control.flow?.events[action.id] ??
          runtime.level.control.invocation.events[action.id];
        runtime.requestAction(action.id);
        if (!mapped && action.dismissIfUnmapped) {
          close('button', action.id);
        }
      });
      footer.append(button);
    }
    dialog.append(footer);
    this.update(dialog, runtime, tab);
  }

  update(
    dialog: HTMLElement,
    runtime: UiPopupRuntime,
    tab: UiPopupTabDefinition = runtime.activeTab,
  ): void {
    for (const button of dialog.querySelectorAll<HTMLButtonElement>('[data-ejs-popup-action]')) {
      const action = (runtime.definition.actions ?? tab.actions).find(
        (candidate) => candidate.id === button.dataset['ejsPopupAction'],
      );
      if (!action) continue;
      button.hidden = runtime.level.state.visibleActions[action.id] === false;
      button.disabled = runtime.level.state.busy || runtime.level.state.actions[action.id] !== true;
      const signingIn = action.id === 'signin' && runtime.level.state.busy;
      const icon = button.querySelector<HTMLElement>('[data-ejs-popup-action-icon]');
      const spinner = button.querySelector<HTMLElement>('[data-ejs-popup-action-spinner]');
      if (icon) icon.hidden = !action.icon || signingIn;
      if (spinner) spinner.hidden = !signingIn;
      const label = button.querySelector<HTMLElement>('[data-ejs-popup-action-label]');
      if (label)
        label.textContent = signingIn
          ? multilingual(this.language(), []).resolve('@CM.SigningInProgress')
          : text(action.label, this.language());
    }
  }
}
