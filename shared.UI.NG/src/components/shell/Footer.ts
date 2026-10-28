import { Component, input } from '@angular/core';

import type { ApplicationState } from '@manatos/shared-ui';

@Component({
  selector: 'manatos-footer',
  standalone: true,
  templateUrl: './Footer.html',
  styleUrl: './Footer.css',
})
export class Footer {
  readonly state = input.required<ApplicationState>();
  readonly interactive = input(true);
  readonly language = input<'EN' | 'EL'>('EN');

  protected readonly currentYear = new Date().getFullYear();
}
