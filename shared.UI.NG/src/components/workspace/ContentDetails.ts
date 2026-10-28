import { multilingual } from '@manatos/shared-ui';
import { Component, computed, input } from '@angular/core';

@Component({
  selector: 'manatos-content-details',
  standalone: true,
  templateUrl: './ContentDetails.html',
  styleUrl: './ContentDetails.css',
})
export class ContentDetails {
  protected readonly multilingual = computed(() =>
    multilingual(this.language(), ['ContentDetails'] as const),
  );

  readonly language = input<'EN' | 'EL'>('EN');
}
