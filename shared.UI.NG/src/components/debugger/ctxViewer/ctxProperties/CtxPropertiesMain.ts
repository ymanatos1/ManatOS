import { Component, input } from '@angular/core';
import type { CtxPropertyRow } from '@manatos/shared-ui';

@Component({
  selector: 'manatos-ctx-properties-main',
  standalone: true,
  templateUrl: './CtxPropertiesMain.html',
  styleUrl: './CtxPropertiesMain.css',
})
export class CtxPropertiesMain {
  readonly rows = input.required<readonly CtxPropertyRow[]>();
}
