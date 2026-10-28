import { multilingual } from '@manatos/shared-ui';
import { Component, input, output, computed } from '@angular/core';
import { type MetadataLanguage } from '@manatos/shared';

@Component({
  selector: 'manatos-page-details',
  standalone: true,
  templateUrl: './PageDetails.html',
  styleUrl: './PageDetails.css',
})
export class PageDetails {
  protected readonly multilingual = computed(() => multilingual(this.language(), []));

  readonly panelId = input('pageDetails');
  readonly language = input<MetadataLanguage>('EN');
  readonly eyebrow = input('Context');
  readonly title = input('Details');
  readonly message = input<string | undefined>(undefined);

  readonly closeRequested = output<void>();
}
