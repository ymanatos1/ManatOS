import { Component, input, output } from '@angular/core';

@Component({
  selector: 'manatos-detach-toggle',
  standalone: true,
  templateUrl: './DetachToggle.html',
  styleUrl: './DetachToggle.css',
})
export class DetachToggle {
  readonly detached = input(false);
  readonly subject = input('surface');
  readonly toggleRequested = output<void>();
}
