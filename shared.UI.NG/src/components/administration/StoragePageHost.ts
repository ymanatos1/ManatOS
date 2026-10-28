import {
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { type ContextTreeRuntime, type ManatOSRuntimeRootContext } from '@manatos/shared';
import {
  UiBrowserAdministrationClient,
  UiDirtyCloseCoordinator,
  type UiStorageAdapter,
  type UiStorageConfiguration,
  type UiStorageSnapshot,
  type UiLanguageDefinition,
  type UiSurfaceHandle,
} from '@manatos/shared-ui';

import { localizeStorage } from './storage/StorageLocale';
import { StorageWizardPopup } from './StorageWizardPopup';
import { NgUiSurfaceManager } from '../../runtime/surfaces/uiSurfaceManager';

/**
 * Administration Storage page: listing, ordering, selection and diagnostics.
 * The editor is a separate child popup; each mutation is authorized by the API.
 */
@Component({
  selector: 'manatos-storage-page-host',
  standalone: true,
  imports: [StorageWizardPopup],
  templateUrl: './StoragePageHost.html',
  styleUrl: './StoragePageHost.css',
})
export class StoragePageHost implements OnInit, OnDestroy {
  readonly contextTree = input.required<ContextTreeRuntime<ManatOSRuntimeRootContext>>();
  readonly language = input<'EN' | 'EL'>('EN');
  readonly readOnly = input(false);
  readonly languages = input<readonly UiLanguageDefinition[]>([]);
  readonly currentLanguage = input<UiLanguageDefinition | null>(null);
  readonly languageSelected = output<string>();
  readonly debuggerRequested = output<string>();
  readonly flowDebuggerRequested = output<string>();
  readonly fontScaleChanged = output<number>();
  readonly debuggerAllowed = input(false);
  readonly debuggerForeground = input(false);
  readonly debuggerDocked = input(true);
  readonly debuggerDockWidth = input<number | null>(null);
  readonly initialFontScalePercent = input(100);

  private readonly surfaces = inject(NgUiSurfaceManager);
  private readonly dirtyClose = new UiDirtyCloseCoordinator();
  private readonly wizard = viewChild(StorageWizardPopup);
  private removalPopup: UiSurfaceHandle | null = null;

  /** All close routes delegate to the existing shared Unsaved Changes popup. */
  protected requestWizardDismissal(): void {
    const wizard = this.wizard();
    if (!wizard) {
      return;
    }

    this.dirtyClose.requestExit(
      () => wizard.hasUnsavedChanges(),
      () => wizard.close(true),
      this.surfaces,
      { ownerLabel: this.t('Storage configuration', 'Ρύθμιση αποθήκευσης') },
    );
  }

  private readonly api = new UiBrowserAdministrationClient();
  private readonly controller = new AbortController();
  private disposed = false;

  protected readonly snapshot = signal<UiStorageSnapshot | null>(null);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly message = signal('');
  protected readonly editing = signal<UiStorageConfiguration | 'new' | null>(null);
  protected readonly selected = signal('');
  protected readonly debugEnabled = signal(false);
  protected readonly debugDirectory = signal('');
  protected readonly adapters = computed(() => this.snapshot()?.adapters ?? []);

  ngOnInit(): void {
    void this.reload();
  }

  ngOnDestroy(): void {
    this.disposed = true;
    this.controller.abort();
    this.removalPopup?.close('host');
    this.removalPopup = null;
    this.editing.set(null);
  }

  /** Translate presentation-only adapter metadata while preserving API identities. */
  protected translate(value: string): string {
    return localizeStorage(value, this.language());
  }

  protected t(en: string, el: string): string {
    return this.language() === 'EL' ? el : en;
  }

  protected adapter(id: string): UiStorageAdapter | undefined {
    return this.adapters().find((item) => item.id === id);
  }

  /** Only ready or already active targets with a runtime adapter can be selected. */
  protected canSelect(item: UiStorageConfiguration): boolean {
    const snapshot = this.snapshot();
    if (!snapshot || this.adapter(item.adapterId)?.runtimeAvailable !== true) {
      return false;
    }

    const currentOrSelected =
      item.id === snapshot.runningConfigurationId || item.id === snapshot.selectedConfigurationId;

    return item.status === 'ready' || currentOrSelected;
  }

  /** Superusers may inspect a saved configuration but never start creation. */
  protected open(item: UiStorageConfiguration | 'new'): void {
    if (this.readOnly() && item === 'new') {
      return;
    }

    this.message.set('');
    this.error.set('');
    this.editing.set(item);
  }

  /** Refresh server state after every mutation; never infer running storage locally. */
  protected async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set('');

    try {
      const snapshot = await this.api.storage(this.controller.signal);
      if (this.disposed) {
        return;
      }

      this.snapshot.set(snapshot);
      this.selected.set(snapshot.selectedConfigurationId);
      this.debugEnabled.set(snapshot.debugging.apiStorageContextEnabled);
      this.debugDirectory.set(snapshot.debugging.outputDirectory);
    } catch (error) {
      if (!this.disposed) {
        this.error.set(this.reason(error));
      }
    } finally {
      if (!this.disposed) {
        this.loading.set(false);
      }
    }
  }

  /** Centralized mutation feedback and refresh, shared by all page commands. */
  protected async execute(operation: () => Promise<void>, success: string): Promise<void> {
    if (this.readOnly() || this.busy()) {
      return;
    }

    this.busy.set(true);
    this.error.set('');
    this.message.set('');

    try {
      await operation();
      if (this.disposed) {
        return;
      }

      this.message.set(success);
      await this.reload();
    } catch (error) {
      if (!this.disposed) {
        this.error.set(this.reason(error));
      }
    } finally {
      if (!this.disposed) {
        this.busy.set(false);
      }
    }
  }

  /** Selection is stored for the next restart, not activated in the running API. */
  protected select(): void {
    const id = this.selected();
    const configuration = this.snapshot()?.configurations.find((item) => item.id === id);
    if (!configuration || !this.canSelect(configuration)) {
      return;
    }

    void this.execute(
      () => this.api.selectStorageConfiguration(id, this.controller.signal),
      this.t(
        'Selection saved for next API restart.',
        'Η επιλογή αποθηκεύτηκε για την επόμενη επανεκκίνηση.',
      ),
    );
  }

  /** Keep the EJS0 picker eligible-only while allowing a draft choice before Apply. */
  protected chooseNext(id: string, menu: HTMLDetailsElement): void {
    const item = this.snapshot()?.configurations.find((entry) => entry.id === id);
    if (item && !this.readOnly() && !this.busy() && this.canSelect(item)) {
      this.selected.set(id);
      menu.open = false;
    }
  }

  protected selectedConfiguration(): UiStorageConfiguration | undefined {
    return this.snapshot()?.configurations.find((item) => item.id === this.selected());
  }

  protected statusClass(item: UiStorageConfiguration): string {
    const model = this.snapshot();
    if (item.id === model?.runningConfigurationId) return 'text-bg-primary';
    if (item.id === model?.selectedConfigurationId) return 'text-bg-info';
    if (item.status === 'ready') return 'text-bg-success';
    if (item.status === 'error') return 'text-bg-danger';
    if (item.status === 'incomplete') return 'text-bg-warning';
    return 'text-bg-light border text-secondary';
  }

  protected statusLabel(item: UiStorageConfiguration): string {
    const model = this.snapshot();
    if (item.id === model?.runningConfigurationId) return this.t('Current', 'Τρέχον');
    if (item.id === model?.selectedConfigurationId) return this.t('Selected', 'Επιλεγμένο');
    return this.translate(item.status);
  }

  protected logo(item: UiStorageAdapter | undefined): string {
    // This is API-owned metadata; fall back only to the known bundled icon.
    const url = item?.logoUrl;
    return url?.startsWith('/images/storage-adapters/') ? url : '/images/storage-adapters/json.svg';
  }

  private draggingConfigurationId = '';

  /** Mirror EJS0 row reordering, but persist through the existing bulk-order endpoint. */
  protected dragStart(event: DragEvent, id: string): void {
    if (this.disposed || this.readOnly() || this.busy() || !this.snapshot()) {
      event.preventDefault();
      return;
    }
    const row = event.currentTarget;
    if (!(row instanceof HTMLTableRowElement)) return;
    this.draggingConfigurationId = id;
    row.classList.add('opacity-50');
    event.dataTransfer?.setData('text/plain', id);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }

  protected dragOver(event: DragEvent): void {
    if (!this.draggingConfigurationId || this.disposed || this.readOnly() || this.busy()) return;
    const target = event.currentTarget;
    if (!(target instanceof HTMLTableRowElement)) return;
    const body = target.parentElement;
    const dragged = Array.from(
      body?.querySelectorAll<HTMLTableRowElement>('tr[data-storage-configuration-id]') ?? [],
    ).find((row) => row.dataset['storageConfigurationId'] === this.draggingConfigurationId);
    if (!dragged) return;
    event.preventDefault();
    if (dragged === target) return;
    const bounds = target.getBoundingClientRect();
    body?.insertBefore(
      dragged,
      event.clientY < bounds.top + bounds.height / 2 ? target : target.nextSibling,
    );
  }

  protected dragDrop(event: DragEvent): void {
    if (!this.draggingConfigurationId || this.disposed || this.readOnly() || this.busy()) return;
    event.preventDefault();
    const row = event.currentTarget;
    if (!(row instanceof HTMLTableRowElement)) return;
    const body = row.parentElement;
    const ids = Array.from(
      body?.querySelectorAll<HTMLTableRowElement>('tr[data-storage-configuration-id]') ?? [],
    ).map((entry) => entry.dataset['storageConfigurationId'] ?? '');
    this.draggingConfigurationId = '';
    const configurations = this.snapshot()?.configurations ?? [];
    if (
      ids.length !== configurations.length ||
      new Set(ids).size !== ids.length ||
      ids.some((id) => !configurations.some((item) => item.id === id))
    ) {
      this.restoreTableOrder(body);
      return;
    }
    if (ids.every((id, index) => id === configurations[index]?.id)) {
      this.restoreTableOrder(body);
      return;
    }
    void this.execute(
      async () => {
        try {
          await this.api.reorderStorageConfigurations(ids, this.controller.signal);
        } finally {
          // Angular owns the row collection: restore it before its next reconciliation.
          this.restoreTableOrder(body);
        }
      },
      this.t('Order updated.', 'Η σειρά ενημερώθηκε.'),
    );
  }

  protected dragEnd(event: DragEvent): void {
    if (!this.draggingConfigurationId) return;
    this.draggingConfigurationId = '';
    const row = event.currentTarget;
    if (row instanceof HTMLTableRowElement) this.restoreTableOrder(row.parentElement);
  }

  private restoreTableOrder(body: Element | null | undefined): void {
    if (!body) return;
    const rows = Array.from(
      body.querySelectorAll<HTMLTableRowElement>('tr[data-storage-configuration-id]'),
    );
    const byId = new Map(rows.map((row) => [row.dataset['storageConfigurationId'], row]));
    for (const item of this.snapshot()?.configurations ?? []) {
      const row = byId.get(item.id);
      if (row) {
        row.classList.remove('opacity-50');
        body.appendChild(row);
      }
    }
  }

  /** Use the standard UIS AlertPopup; only its affirmative action may delete. */
  protected remove(item: UiStorageConfiguration): void {
    if (this.disposed || this.readOnly() || this.busy() || this.removalPopup?.isOpen()) return;
    const snapshot = this.snapshot();
    if (
      !snapshot?.configurations.some((configuration) => configuration.id === item.id) ||
      item.id === snapshot.selectedConfigurationId ||
      item.id === snapshot.runningConfigurationId
    )
      return;

    const popup = this.surfaces.open('message.alert', {
      params: {
        caption: { EN: 'Delete storage configuration', EL: 'Διαγραφή ρύθμισης αποθήκευσης' },
        text: {
          EN: `Delete storage configuration "${item.name}"? This removes only the saved configuration, not the target database, files, schema or data.`,
          EL: `Διαγραφή ρύθμισης «${item.name}»; Διαγράφεται μόνο η αποθηκευμένη ρύθμιση, όχι η βάση, τα αρχεία, το σχήμα ή τα δεδομένα.`,
        },
        buttons: [
          { id: 'dismiss', label: { EN: 'Cancel', EL: 'Άκυρον' } },
          { id: 'delete', label: { EN: 'Delete', EL: 'Διαγραφή' }, tone: 'danger' },
        ],
      },
      events: { delete: 'storage-delete-confirmed' },
      allowXClosure: true,
      allowBackdropClosure: false,
    });
    this.removalPopup = popup;
    const unsubscribe = popup.onEvent((event) => {
      if (event === 'disposing') {
        if (this.removalPopup === popup) this.removalPopup = null;
        unsubscribe();
        return;
      }
      if (event !== 'storage-delete-confirmed' || !popup.isOpen()) return;
      popup.close('button');
      const latest = this.snapshot();
      if (
        this.disposed ||
        this.readOnly() ||
        this.busy() ||
        !latest?.configurations.some((configuration) => configuration.id === item.id) ||
        item.id === latest.selectedConfigurationId ||
        item.id === latest.runningConfigurationId
      )
        return;
      void this.execute(
        () => this.api.deleteStorageConfiguration(item.id, this.controller.signal),
        this.t('Configuration deleted.', 'Η ρύθμιση διαγράφηκε.'),
      );
    });
  }

  protected saveDebugging(): void {
    const settings = {
      apiStorageContextEnabled: this.debugEnabled(),
      outputDirectory: this.debugDirectory(),
    };

    void this.execute(
      () => this.api.updateStorageDebugging(settings, this.controller.signal),
      this.t('Diagnostics settings saved.', 'Οι διαγνωστικές ρυθμίσεις αποθηκεύτηκαν.'),
    );
  }

  /** Save refreshes the authoritative list while the editor remains open. */
  protected saved(): void {
    this.message.set(this.t('Storage configuration saved.', 'Η ρύθμιση αποθηκεύτηκε.'));
    void this.reload();
  }

  protected reason(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
