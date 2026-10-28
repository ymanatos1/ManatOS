import { multilingual } from '@manatos/shared-ui';
import { Component, input, computed } from '@angular/core';
import type { CtxPropertyRow } from '@manatos/shared-ui';

@Component({
  selector: 'manatos-ctx-properties-attrs',
  standalone: true,
  templateUrl: './CtxPropertiesAttrs.html',
  styleUrl: './CtxPropertiesAttrs.css',
})
export class CtxPropertiesAttrs {
  protected readonly multilingual = computed(() =>
    multilingual(this.language(), ['NoSemanticAttributes'] as const),
  );

  readonly language = input<'EN' | 'EL'>('EN');
  readonly rows = input.required<readonly CtxPropertyRow[]>();
}
