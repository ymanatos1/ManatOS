import { Component, input, output } from '@angular/core';

@Component({
  selector: 'manatos-surface-action',
  standalone: true,
  templateUrl: './SurfaceAction.html',
  styleUrl: './SurfaceAction.css',
})
export class SurfaceAction {
  readonly label = input.required<string>();
  readonly icon = input.required<string>();
  readonly disabled = input(false);
  readonly pressed = input<boolean | null>(null);
  readonly requested = output<void>();
}
