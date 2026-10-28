import { Component } from '@angular/core';

/**
 * Common action area at the bottom of a popup.
 *
 * Owns only the popup-action layout and presentation.
 * The popup supplies its actions through content projection,
 * retaining responsibility for button behavior and form submission.
 *
 * Popups without footer actions do not instantiate this component.
 */
@Component({
  selector: 'manatos-popup-actions',
  standalone: true,
  templateUrl: './PopupActions.html',
  styleUrl: './PopupActions.css',
})
export class PopupActions {}
