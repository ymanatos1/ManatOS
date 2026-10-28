import { multilingual } from '@manatos/shared-ui';
import { Component, input, computed } from '@angular/core';
import type { ApiTrafficEntry } from '@manatos/shared-ui';

@Component({
  selector: 'manatos-api-traffic-caption',
  standalone: true,
  templateUrl: './ApiTrafficViewerCaption.html',
  styleUrl: './ApiTrafficViewerCaption.css',
})
export class ApiTrafficViewerCaption {
  protected readonly multilingual = computed(() =>
    multilingual(this.language(), ['ApiTrafficTitle', 'SelectApiRequest'] as const),
  );

  readonly language = input<'EN' | 'EL'>('EN');
  readonly entry = input<ApiTrafficEntry | null>(null);
}
