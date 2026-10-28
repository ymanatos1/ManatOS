import { Component } from '@angular/core';

import { Title } from '../surfaces/Title';

@Component({
  selector: 'manatos-page-title',
  standalone: true,
  templateUrl: '../surfaces/Title.html',
  styleUrls: ['../surfaces/Title.css', './PageTitle.css'],
  host: { class: 'page-title' },
})
export class PageTitle extends Title {}
