import { Component, input } from '@angular/core';

import type { UiTitleModel } from '@manatos/shared-ui';

@Component({
  selector: 'manatos-title',
  standalone: true,
  templateUrl: './Title.html',
  styleUrl: './Title.css',
})
export class Title {
  readonly model = input.required<UiTitleModel>();
}
