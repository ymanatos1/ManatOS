import { Component, input, computed } from '@angular/core';
import { formatCtxPath, multilingual } from '@manatos/shared-ui';

@Component({
  selector: 'manatos-ctx-caption',
  standalone: true,
  templateUrl: './CtxCaption.html',
  styleUrl: './CtxCaption.css',
})
export class CtxCaption {
  protected readonly multilingual = computed(() =>
    multilingual(this.language(), ['CtxRevisionDescription'] as const),
  );

  readonly language = input<'EN' | 'EL'>('EN');
  readonly rootPath = input.required<string>();
  readonly selectedPath = input.required<string>();
  readonly revision = input.required<number>();

  protected display(path: string): string {
    return formatCtxPath(path);
  }
}
