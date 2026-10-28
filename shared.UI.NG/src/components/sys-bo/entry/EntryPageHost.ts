import {
  Component,
  ElementRef,
  ErrorHandler,
  Injectable,
  afterEveryRender,
  afterNextRender,
  OnDestroy,
  ViewEncapsulation,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import {
  ContextTreeRuntime,
  resolveMetadataText,
  type ManatOSRuntimeRootContext,
  type MetadataLanguage,
} from '@manatos/shared';
import { EntryContext } from './EntryContext';
import { entryChangeReportLocalized, type UiChangeReport } from '@manatos/shared-ui';
import { EntryTabs } from './EntryTabs';
import type { UiEntryLayoutItem } from '@manatos/shared-ui';
import { EntryLayout } from './EntryLayout';
import { EntryChangeStatus } from './EntryChangeStatus';
import { PictureEditorPopup } from './picture/PictureEditorPopup';
import { SurfaceActions } from '../../surfaces/SurfaceActions';

/** Scoped Angular error boundary for view-owned components.
 * Normal Angular error reporting is retained; only active Entry view switches
 * additionally receive the error for recovery by the shared coordinator.
 */
@Injectable()
class EntryViewRenderErrorHandler implements ErrorHandler {
  private readonly entry = inject(EntryContext);
  private readonly parent = inject(ErrorHandler, { optional: true, skipSelf: true });
  handleError(error: unknown): void {
    const pending = this.entry.pendingUIViewTransition();
    if (pending)
      queueMicrotask(() => {
        const active = this.entry.pendingUIViewTransition();
        if (active?.generation === pending.generation && active.viewKey === pending.viewKey)
          this.entry.reportUIViewRenderError(error);
      });
    this.parent?.handleError(error);
  }
}

/** One Surface Host; Entry content and tabs belong to a shared semantic runtime.
 * UIS ownership: Entry Surface lifecycle, dirty-close decisions and action dispatch; embedded children own tabs and field markup. Do not move Field markup or CTX ownership into this host; it only mounts and dispatches. */
@Component({
  selector: 'manatos-entry-page-host',
  standalone: true,
  providers: [EntryContext, { provide: ErrorHandler, useClass: EntryViewRenderErrorHandler }],
  encapsulation: ViewEncapsulation.None,
  imports: [EntryTabs, EntryLayout, EntryChangeStatus, SurfaceActions, PictureEditorPopup],
  styleUrls: ['./Entry.css', '../fields/FieldDisplay.css', '../fields/FormField.css'],
  templateUrl: './EntryPageHost.html',
})
export class EntryPageHost implements OnDestroy {
  readonly contextTree = input.required<ContextTreeRuntime<ManatOSRuntimeRootContext>>();
  readonly entityKey = input.required<string>();
  readonly recordId = input.required<string>();
  readonly language = input<MetadataLanguage>('EN');
  readonly hostKind = input<'page' | 'popup'>('page');
  readonly entryMode = input<'view' | 'edit' | 'create' | null>(null);
  readonly parentLevelPath = input<string | null>(null);
  readonly permissions = input<Readonly<Record<string, boolean>>>({});
  readonly inspectorAllowed = input(false);
  readonly captionChanged = output<string>();
  readonly saved = output<Readonly<Record<string, unknown>>>();
  readonly dismissed = output<void>();
  /** Explicit Page-title integration for an Entry hosted in a dynamic template outlet. */
  readonly titleViewHostReady = output<EntryPageHost>();
  readonly titleViewHostDestroyed = output<EntryPageHost>();
  protected async surfaceAction(action: string): Promise<void> {
    if (action === 'cancel') this.dismissed.emit();
    if (action === 'save' && !this.entry.level()?.state.entry.recoveryFailed) {
      const record = await this.entry.create();
      if (record) this.saved.emit(record);
    }
  }
  protected readonly entry = inject(EntryContext);
  private readonly element = inject(ElementRef<HTMLElement>);
  readonly uiViewKey = () => this.entry.level()?.state.entry.uiViewKey ?? 'main';
  readonly uiViews = () => this.entry.viewOptions();
  readonly uiViewBusy = () => {
    const state = this.entry.level()?.state.entry;
    return (
      !state || state.loading || state.saving || state.switching || state.recoveryFailed === true
    );
  };
  readonly uiViewError = signal('');
  async selectUIView(viewKey: string): Promise<void> {
    try {
      await this.entry.selectUIView(viewKey);
      this.uiViewError.set('');
    } catch (error) {
      this.uiViewError.set(error instanceof Error ? error.message : String(error));
    }
  }
  private lastFocusedInstance = '';
  private focusFirstEditable(instanceId: string): void {
    queueMicrotask(() => {
      if (this.lastFocusedInstance !== instanceId) return;
      const root: HTMLElement = this.element.nativeElement;
      const visible = root.querySelector<HTMLElement>('[data-entry-tab-index]:not([hidden])');
      const input = visible?.querySelectorAll<HTMLElement>(
        'input:not([disabled]):not([readonly]):not([type=hidden]):not([tabindex="-1"]), ' +
          'textarea:not([disabled]):not([readonly]), select:not([disabled]):not([tabindex="-1"])',
      );
      for (const element of input ?? []) {
        if (
          element.closest('[hidden], [aria-hidden="true"], [inert]') ||
          element.getClientRects().length === 0
        )
          continue;
        element.focus({ preventScroll: true });
        break;
      }
    });
  }
  readonly changeReportRequested = output<UiChangeReport>();
  protected changeIndicator(): string {
    return resolveMetadataText(
      this.entry.level()?.state.entry.dirty ? '@CM.UnsavedChanges' : '@CM.NoChanges',
      this.language(),
    );
  }
  protected reviewChanges(): void {
    const level = this.entry.level();
    if (
      !level?.data.original ||
      !level.data.current ||
      !level.state.entry.dirty ||
      level.state.entry.recoveryFailed
    )
      return;
    const report = entryChangeReportLocalized({
      entityKey: this.entityKey(),
      original: level.data.original,
      current: level.data.current,
      language: this.language(),
      caption: this.entry.caption(),
      references: level.data.references,
    });
    if (report.count) this.changeReportRequested.emit(report);
  }

  constructor() {
    afterNextRender(() => this.titleViewHostReady.emit(this));
    // Angular renders after CTX subscriptions return. Acknowledge the *actual*
    // mounted view only after a complete Angular render, not inside selectUIView.
    // A failure that prevents rendering is handled by the shared timeout/rollback.
    afterEveryRender(() => {
      const pending = this.entry.pendingUIViewTransition();
      if (!pending) return;
      try {
        const level = this.entry.level();
        if (!level || level.state.entry.uiViewKey !== pending.viewKey) return;
        if (!this.mountedViewReady()) return;
        this.entry.acknowledgeUIViewRendered(pending.generation, pending.viewKey);
      } catch (error) {
        this.entry.reportUIViewRenderError(error);
      }
    });
    effect(() => {
      this.entry.open(this.contextTree(), this.entityKey(), this.recordId(), this.language(), {
        host: this.hostKind(),
        parentLevelPath: this.parentLevelPath(),
        permissions: this.permissions(),
        ...(this.entryMode() ? { mode: this.entryMode()! } : {}),
      });
      // Opening an Entry retires the previous runtime and resets eligibility.
      // Reapply the current host's permission after opening, including nested popups.
      this.entry.inspectorAllowed.set(this.inspectorAllowed());
    });
    effect(() => {
      const level = this.entry.level();
      if (level?.data.current && !level.state.entry.loading && !level.state.entry.error) {
        this.captionChanged.emit(this.entry.caption());
        if (this.lastFocusedInstance !== level.control.instanceId) {
          this.lastFocusedInstance = level.control.instanceId;
          this.focusFirstEditable(level.control.instanceId);
        }
      }
    });
  }
  /** A rendered tab panel alone is not a mounted view. Verify every declared
   * layout slot and each visible Field's actual typed control/representation.
   * Angular owns the child instances; this only acknowledges their DOM readiness.
   */
  private mountedViewReady(): boolean {
    const tabs = this.entry.tabs();
    const root: HTMLElement = this.element.nativeElement;
    const panels = root.querySelectorAll<HTMLElement>('[data-entry-tab-index]');
    if (panels.length !== tabs.length) return false;
    const mounted = (panel: HTMLElement, items: readonly UiEntryLayoutItem[]): boolean => {
      for (const item of items) {
        const slot = Array.from(panel.querySelectorAll<HTMLElement>('[data-entry-layout-id]')).find(
          (node) => node.dataset['entryLayoutId'] === item.layoutId,
        );
        if (item.kind === 'field' && !this.entry.field(item.field, item.label)?.visible) {
          if (slot) return false;
          continue;
        }
        if (!slot) return false;
        if (item.kind === 'field') {
          if (slot.hasAttribute('data-entry-representation')) continue;
          const typed = slot.querySelector<HTMLElement>('[data-entry-typed-field]');
          if (!typed?.firstElementChild) return false;
        } else if ('content' in item && !mounted(panel, item.content)) return false;
      }
      return true;
    };
    return tabs.every((tab, index) => {
      const panel = Array.from(panels).find(
        (node) => node.dataset['entryTabIndex'] === String(index),
      );
      return !!panel && mounted(panel, tab.layout);
    });
  }

  ngOnDestroy(): void {
    this.titleViewHostDestroyed.emit(this);
    this.entry.dispose();
  }
}
