import { Component, input } from '@angular/core';
import { NgComponentOutlet } from '@angular/common';
import type { UiEntryLayoutItem } from '@manatos/shared-ui';
import { entryLayoutRenderers, type EntryLayoutKind } from './EntryLayoutRendererRegistry';

/**
 * Generic renderer of canonical Entry layout metadata.
 * Component lookup belongs to the registry; no kind-specific construction,
 * validation or behavior is permitted in this host.
 */
/** UIS ownership: recursive layout-item composition through registered Angular children rather than a host switch. */
@Component({
  selector: 'manatos-entry-layout',
  standalone: true,
  imports: [NgComponentOutlet],
  templateUrl: './EntryLayout.html',
})
export class EntryLayout {
  readonly items = input.required<readonly UiEntryLayoutItem[]>();
  protected readonly renderer = (kind: EntryLayoutKind) => entryLayoutRenderers.resolve(kind);
}
