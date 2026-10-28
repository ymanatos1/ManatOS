import { Component, forwardRef, input, output } from '@angular/core';

import type { UiNavigationItem } from '@manatos/shared-ui';

@Component({
  selector: 'manatos-primary-navigation-item',
  standalone: true,
  imports: [forwardRef(() => PrimaryNavigationItem)],
  templateUrl: './PrimaryNavigationItem.html',
  styleUrl: './PrimaryNavigationItem.css',
})
export class PrimaryNavigationItem {
  readonly item = input.required<UiNavigationItem>();
  readonly depth = input.required<number>();
  readonly open = input(false);

  readonly openRequested = output<UiNavigationItem>();
  readonly itemSelected = output<UiNavigationItem>();

  protected toggle(event: MouseEvent): void {
    event.stopPropagation();
    this.openRequested.emit(this.item());
  }

  protected select(event: MouseEvent): void {
    event.stopPropagation();
    this.itemSelected.emit(this.item());
  }

  protected selectChild(item: UiNavigationItem): void {
    this.itemSelected.emit(item);
  }
}
