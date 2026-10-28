import { Component, inject } from '@angular/core';
import { ListContext } from '../ListContext';
import { TransientMenuDirective } from '../../../../runtime/surfaces/TransientMenu';

/**
 * Angular Views declares its toggle and view buttons in ListViews.html. Native actions call
 * ListContext; canonical view-policy checks stay in ListViewsEmbedded. Debug: toggle() /
 * select().
 */
@Component({
  selector: 'manatos-list-views',
  standalone: true,
  imports: [TransientMenuDirective],
  templateUrl: './ListViews.html',
})
export class ListViews {
  protected readonly context = inject(ListContext);
  protected readonly dismissMenu = (): void => this.context.setViewsOpen(false);
  protected toggle(): void {
    this.context.dispatchAction('list-views', 'toggle');
  }
  protected select(key: string): void {
    this.context.dispatchAction('list-views', key);
  }
}
