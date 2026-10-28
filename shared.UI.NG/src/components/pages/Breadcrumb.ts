import { multilingual } from '@manatos/shared-ui';
import { Component, input, computed } from '@angular/core';

import type { UiBreadcrumbItem } from '@manatos/shared-ui';

@Component({
  selector: 'manatos-breadcrumb',
  standalone: true,
  templateUrl: './Breadcrumb.html',
  styleUrl: './Breadcrumb.css',
})
export class Breadcrumb {
  protected readonly multilingual = computed(() =>
    multilingual(this.language(), ['Breadcrumb'] as const),
  );

  readonly language = input<'EN' | 'EL'>('EN');
  readonly items = input.required<readonly UiBreadcrumbItem[]>();
}
