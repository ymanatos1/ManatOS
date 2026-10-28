import { Component, computed, input, model } from '@angular/core';
import { resolveMetadataText, type MetadataLanguage } from '@manatos/shared';

import type { UiPagePresentation } from '@manatos/shared-ui';

import { Breadcrumb } from './Breadcrumb';
import { DetailsToggle } from './DetailsToggle';
import { PageContent } from './PageContent';
import { PageDetails } from './PageDetails';
import { PageTitle } from './PageTitle';

@Component({
  selector: 'manatos-page',
  standalone: true,
  imports: [Breadcrumb, DetailsToggle, PageTitle, PageContent, PageDetails],
  templateUrl: './Page.html',
  styleUrl: './Page.css',
})
export class Page {
  readonly presentation = input.required<UiPagePresentation>();
  readonly language = input<MetadataLanguage>('EN');
  protected readonly detailsLabel = computed(() =>
    resolveMetadataText('@CM.Details', this.language()),
  );

  /*
   * Transient for now. A future canonical endurance/UI-state owner can bind
   * this model without Page acquiring its own persistence mechanism.
   */
  readonly detailsVisible = model(false);

  readonly detailsId = input('pageDetails');

  protected readonly detailsExpanded = computed(
    () => this.presentation().details.available && this.detailsVisible(),
  );

  protected toggleDetails(): void {
    if (!this.presentation().details.available) return;

    this.detailsVisible.set(!this.detailsVisible());
  }

  protected closeDetails(): void {
    this.detailsVisible.set(false);
  }
}
