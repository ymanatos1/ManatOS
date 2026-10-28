import type { UiEntryFieldPresentation } from '@manatos/shared-ui';
/** EJS read-only selection/reference presentation; metadata icon is validated upstream.
 * UIS ownership: native option markup shared by metadata-backed option choices without duplicating option policy. */
export function renderSelectField(field: UiEntryFieldPresentation): string {
  const icon = field.icon || (field.type === 'reference' ? 'link-45deg' : 'list-ul');
  return `<span class="manatos-form-value"><i class="bi bi-${icon}" aria-hidden="true"></i> <span data-entry-control></span></span>`;
}
