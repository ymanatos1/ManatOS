import { multilingual } from '@manatos/shared-ui';
import { Component, input, output, computed } from '@angular/core';
import type { CtxPropertyRow } from '@manatos/shared-ui';

@Component({
  selector: 'manatos-ctx-properties-props',
  standalone: true,
  templateUrl: './CtxPropertiesProps.html',
  styleUrl: './CtxPropertiesProps.css',
})
export class CtxPropertiesProps {
  protected readonly multilingual = computed(() =>
    multilingual(this.language(), ['NoProperties'] as const),
  );

  readonly language = input<'EN' | 'EL'>('EN');
  readonly rows = input.required<readonly CtxPropertyRow[]>();
  readonly navigate = output<string>();
}
