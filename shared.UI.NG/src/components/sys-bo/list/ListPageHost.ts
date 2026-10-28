import {
  Component,
  ElementRef,
  OnDestroy,
  computed,
  effect,
  inject,
  input,
  output,
} from '@angular/core';
import {
  ContextTreeRuntime,
  type ManatOSRuntimeRootContext,
  type MetadataLanguage,
} from '@manatos/shared';
import { ListContext } from './ListContext';
import { List } from './List';
import { SurfaceActions } from '../../surfaces/SurfaceActions';

/** Existing Page supplies breadcrumb/title; this Host attaches one canonical UI surface.
 * UIS ownership: the List Surface mounting boundary and host-owned lifecycle; the List child owns toolbar/row composition. Do not move row/cell/toolbar markup into this host; it only mounts and dispatches. */
@Component({
  selector: 'manatos-list-page-host',
  standalone: true,
  imports: [List, SurfaceActions],
  providers: [ListContext],
  templateUrl: './ListPageHost.html',
})
export class ListPageHost implements OnDestroy {
  readonly contextTree = input.required<ContextTreeRuntime<ManatOSRuntimeRootContext>>();
  readonly entityKey = input.required<string>();
  readonly language = input<MetadataLanguage>('EN');
  readonly hostKind = input<'page' | 'popup'>('page');
  readonly parentLevelPath = input<string | null>(null);
  readonly selectionMode = input<'none' | 'single' | 'multiple'>('none');
  /** Rows only modify the List's pending selection; the Select action alone commits it. */
  readonly rowSelected = output<string>();
  readonly pendingSelectionChanged = output<void>();
  readonly actionRequested = output<'cancel' | 'select'>();
  readonly selectionBusy = input(false);
  protected readonly listContext = inject(ListContext);
  private readonly hostElement = inject(ElementRef<HTMLElement>);
  protected readonly selectReady = computed(() => {
    const level = this.listContext.level();
    if (!level || level.state.list.loading || level.state.list.error) return false;
    const id = level.data.listModel.selectedIds[0];
    return typeof id === 'string' && level.data.list.some((row) => row['id'] === id);
  });
  private lastFocusedInstance = '';
  private focusOnOpen(instanceId: string): void {
    queueMicrotask(() => {
      if (this.lastFocusedInstance !== instanceId) return;
      const root: HTMLElement = this.hostElement.nativeElement;
      const input = root.querySelector<HTMLInputElement>(
        'input:not([type="hidden"]):not([disabled]):not([readonly]), textarea:not([disabled])',
      );
      if (
        input &&
        !input.closest('[hidden], [inert], [aria-hidden="true"]') &&
        input.getClientRects().length > 0
      )
        input.focus({ preventScroll: true });
    });
  }

  constructor() {
    effect(() => {
      const level = this.listContext.level();
      if (
        level &&
        !level.state.list.loading &&
        this.lastFocusedInstance !== level.control.instanceId
      ) {
        this.lastFocusedInstance = level.control.instanceId;
        this.focusOnOpen(level.control.instanceId);
      }
    });
    effect(() =>
      this.listContext.open(this.contextTree(), this.entityKey(), this.language(), {
        host: this.hostKind(),
        parentLevelPath: this.parentLevelPath(),
        selectionMode: this.selectionMode(),
      }),
    );
  }
  protected action(event: Event): void {
    const button =
      event.target instanceof Element
        ? event.target.closest<HTMLButtonElement>('[data-surface-action]')
        : null;
    const id = button && !button.disabled ? button.dataset['surfaceAction'] : undefined;
    if (id === 'cancel') this.actionRequested.emit('cancel');
    if (id === 'select' && !this.selectionBusy() && this.selectReady()) {
      const selected = this.listContext.level()?.data.listModel.selectedIds[0];
      if (selected) this.rowSelected.emit(selected);
    }
  }
  protected selectRow(id: string): void {
    if (this.selectionBusy()) return;
    if (this.listContext.selectRow(id)) this.pendingSelectionChanged.emit();
  }
  protected confirmRow(id: string): void {
    if (this.hostKind() !== 'popup' || this.selectionBusy()) return;
    const level = this.listContext.level();
    if (!level || level.state.list.loading || level.state.list.error) return;
    if (!level.data.list.some((row) => row['id'] === id)) return;
    this.selectRow(id);
    const current = this.listContext.level();
    if (current?.data.listModel.selectedIds[0] === id) this.rowSelected.emit(id);
  }
  ngOnDestroy(): void {
    this.listContext.dispose();
  }
}
