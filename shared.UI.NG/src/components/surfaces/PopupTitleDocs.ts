import { Component } from '@angular/core';

import { Title } from './Title';

/**
 * Title used by detached documentation-style popups.
 *
 * Reuses the common Title markup and styling.
 * The owning popup supplies its documentation-specific tools.
 */
@Component({
  selector: 'manatos-popup-title-docs',
  standalone: true,
  templateUrl: './Title.html',
  styleUrls: ['./Title.css', './PopupTitleDocs.css'],
})
export class PopupTitleDocs extends Title {}
