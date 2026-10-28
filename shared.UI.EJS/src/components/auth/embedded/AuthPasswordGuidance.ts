import { createNativeElement } from '../../native-template.js';
import { multilingual, type UiPopupRuntime } from '@manatos/shared-ui';

/**
 * Owns the password guidance child and each declarative rule row.
 * Reads password bytes transiently from sibling native inputs; publishes
 * NOTHING sensitive into CTX. Registration/Password rules come from the popup
 * definition, and language changes update text without replacing inputs.
 * Debug: append() and its update closure on input/language-change.
 */
export class AuthPasswordGuidance {
  constructor(private readonly language: () => 'EN' | 'EL') {}

  append(
    container: HTMLElement,
    tabId: string,
    inputs: Map<string, HTMLInputElement>,
    popup: UiPopupRuntime,
  ): void {
    const guidance = createNativeElement(
      'AuthPasswordGuidance',
      {
        Id: `${tabId}-password-guidance`,
        TitleId: `${tabId}-password-guidance-title`,
        RulesId: `${tabId}-password-rules`,
      },
      { Rules: '' },
    );
    const heading = guidance.querySelector<HTMLElement>('[data-auth-guidance-heading]');
    const rules = guidance.querySelector<HTMLElement>('.ejs-auth-password-rules-list');
    if (!heading || !rules) throw new Error('AuthPasswordGuidance template is incomplete.');
    const update = (): void => {
      const labels = multilingual(this.language(), []);
      heading.textContent = labels.resolve('@CM.AuthSecurePassword');
      const value = inputs.get('password')?.value ?? '';
      const confirmation = inputs.get('confirmPassword')?.value ?? '';
      const policy = popup.definition.fields.find((field) => field.id === 'password');
      const minimum = policy?.minLength ?? 1;
      const checks = [
        [
          'length',
          value.length >= minimum,
          labels.format('@CM.AuthPasswordMinimum', { minimum: minimum - 1 }),
        ],
        ['alpha', /[A-Za-z]/.test(value), labels.resolve('@CM.AuthPasswordAlpha')],
        ['number', /\d/.test(value), labels.resolve('@CM.AuthPasswordNumber')],
        ['symbol', /[^A-Za-z0-9]/.test(value), labels.resolve('@CM.AuthPasswordSymbol')],
        [
          'match',
          confirmation.length > 0 && confirmation === value,
          labels.resolve('@CM.AuthPasswordMatch'),
        ],
      ] as const;
      rules.replaceChildren();
      for (const [id, passed, caption] of checks) {
        const row = createNativeElement('AuthPasswordRule', {
          Id: `${tabId}-password-rule-${id}`,
          Class: passed ? 'rule-ok' : '',
          Icon: passed ? 'bi-check-circle-fill' : 'bi-circle',
          Caption: caption,
        });
        rules.append(row);
      }
    };
    inputs.get('password')?.addEventListener('input', update);
    inputs.get('confirmPassword')?.addEventListener('input', update);
    inputs.get('password')?.addEventListener('manatos-language-change', update);
    // NG1 uses a full-width checklist beneath both field columns.
    container.append(guidance);
    update();
  }
}
