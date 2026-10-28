import { EntryFieldRendererBase } from '../EntryFieldRendererBase';
import { FieldControlShell } from '../FieldControlShell';
import { Component, computed } from '@angular/core';
import { uiVersionParts } from '@manatos/shared-ui';

/**
 * Show major/minor/patch as three metadata-identified parts rather than flattening the
 * version to plain text. uiVersionParts projects the canonical version string; these inner
 * inputs currently have no scalar edit-decoding contract. Do not add cosmetic forwarding
 * methods or silently commit a partial version.
 * Debug: parts() -> three [data-version-part] inputs; no scalar input dispatch.
 */
@Component({
  selector: 'manatos-version-field',
  standalone: true,
  imports: [FieldControlShell],
  templateUrl: './VersionField.html',
})
export class VersionField extends EntryFieldRendererBase {
  protected readonly parts = computed(() => uiVersionParts(this.field().value));
}
