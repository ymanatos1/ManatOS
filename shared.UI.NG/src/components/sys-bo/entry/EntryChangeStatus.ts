import { Component, input, output } from '@angular/core';
import { resolveMetadataText, type MetadataLanguage } from '@manatos/shared';

/** BO Entry change-status control; reads the existing aggregate dirty projection. */
@Component({
  selector: 'manatos-entry-change-status',
  standalone: true,
  templateUrl: './EntryChangeStatus.html',
})
export class EntryChangeStatus {
  readonly dirty = input(false);
  readonly language = input<MetadataLanguage>('EN');
  readonly reviewRequested = output<void>();
  protected text(): string {
    return resolveMetadataText(
      this.dirty() ? '@CM.UnsavedChanges' : '@CM.NoChanges',
      this.language(),
    );
  }
}
