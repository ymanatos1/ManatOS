import { multilingual } from '@manatos/shared-ui';
import { Component, input, output, computed } from '@angular/core';

import type { UiNavigationItem, UiPlatformIdentity } from '@manatos/shared-ui';
import { type MetadataLanguage } from '@manatos/shared';

@Component({
  selector: 'manatos-platform-selector',
  standalone: true,
  templateUrl: './PlatformSelector.html',
  styleUrl: './PlatformSelector.css',
})
export class PlatformSelector {
  protected readonly multilingual = computed(() => multilingual(this.language(), []));

  readonly current = input<UiPlatformIdentity | null>(null);
  readonly language = input<MetadataLanguage>('EN');
  readonly platforms = input.required<readonly UiPlatformIdentity[]>();
  readonly navigation = input<UiNavigationItem | null>(null);
  readonly open = input.required<boolean>();

  readonly openRequested = output<void>();
  readonly platformSelected = output<string | null>();

  protected toggle(event: MouseEvent): void {
    event.stopPropagation();
    this.openRequested.emit();
  }

  protected select(platformId: string | null, event: MouseEvent): void {
    event.stopPropagation();
    this.platformSelected.emit(platformId);
  }
}
