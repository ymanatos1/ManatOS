import { EntryFieldComponent } from '../EntryFieldComponent.js';
import { uiVersionParts, type UiEntryFieldPresentation } from '@manatos/shared-ui';

/** One independently mounted version control; HTML resides in VersionField.html.
 * UIS ownership: this Version Field selects its own HTML and refreshes version segments from the prepared version value; the field registry only mounts and refreshes it. Do not move this markup to FormField. */
export class VersionField extends EntryFieldComponent {
  static readonly type = 'version' as const;
  readonly templateName = 'VersionField';

  constructor(root: HTMLElement) {
    super(root);
  }

  override update(field: UiEntryFieldPresentation): void {
    const root = this.root;
    const parts = uiVersionParts(field.value);
    const major = root.querySelector<HTMLInputElement>('[data-version-part="major"]');
    if (major) major.value = parts.major;
    const minor = root.querySelector<HTMLInputElement>('[data-version-part="minor"]');
    if (minor) minor.value = parts.minor;
    const patch = root.querySelector<HTMLInputElement>('[data-version-part="patch"]');
    if (patch) patch.value = parts.patch;
  }
}
