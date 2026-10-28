import { Component, input, output } from '@angular/core';
import { uiSurfaceActions } from '@manatos/shared-ui';
import { PopupActions } from './PopupActions';

/** Page/Popup actions reuse Auth's footer; the Surface owns action availability. */
@Component({
  selector: 'manatos-surface-actions',
  standalone: true,
  imports: [PopupActions],
  templateUrl: './SurfaceActions.html',
})
export class SurfaceActions {
  readonly kind = input.required<'list' | 'entry'>();
  readonly hostKind = input.required<'page' | 'popup'>();
  readonly entityKey = input<string>('');
  readonly language = input<'EN' | 'EL'>('EN');
  readonly saveReady = input(false);
  readonly dirty = input(false);
  readonly selectReady = input(false);
  readonly selectionBusy = input(false);
  readonly actionRequested = output<string>();
  readonly actions = () => uiSurfaceActions(this.kind(), this.hostKind());
}
