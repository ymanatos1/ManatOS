import { Component, input, output } from '@angular/core';

@Component({
  selector: 'manatos-details-toggle',
  standalone: true,
  templateUrl: './DetailsToggle.html',
  styleUrl: './DetailsToggle.css',
})
export class DetailsToggle {
  readonly expanded = input(false);
  readonly controlsId = input('pageDetails');
  readonly label = input('Details');

  readonly toggleRequested = output<void>();
}
