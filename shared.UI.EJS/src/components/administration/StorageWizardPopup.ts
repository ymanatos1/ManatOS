import {
  UiBrowserAdministrationClient,
  UiDirtyCloseCoordinator,
  UiStorageWorkflowController,
  type UiStorageConfiguration,
  type UiPopupTabDefinition,
  type UiStorageSnapshot,
  type UiSurfaceCloseReason,
  type UiSurfaceManager,
  type UiSurfaceOpenOptions,
  type UiSurfaceHandle,
} from '@manatos/shared-ui';
import { PopupBase, type EjsPopupHost } from '../common/popups/PopupBase.js';
import {
  type StorageView,
  StorageMetadataFields,
  StorageTabStatus,
} from './storage/StorageParts.js';
import { storageTabComponents } from './storage/StorageTabComponents.js';
import { defineStoragePopup } from './storage/StoragePopupDefinition.js';
import { localizeStorage } from './storage/StorageLocale.js';

/** One standard UIS popup/#level; EJS tabs own their native templates and embedded children. */
export class StorageWizardPopup extends PopupBase {
  private readonly workflow: UiStorageWorkflowController;
  private readonly view: StorageView;
  private readonly dirtyClose = new UiDirtyCloseCoordinator();
  private readonly unsubscribers: Array<() => void> = [];
  private saved: (() => void) | null = null;
  private confirmedClose = false;
  private closed = false;
  private projectedAdapterId: string | null = null;
  private readonly revealedSecrets = new Set<string>();

  constructor(
    invocation: UiSurfaceOpenOptions,
    private readonly owner: EjsPopupHost,
    private readonly manager: UiSurfaceManager,
  ) {
    super(
      'administration.storage',
      defineStoragePopup(
        invocation.params?.['snapshot'] as UiStorageSnapshot,
        invocation.params?.['readOnly'] === true,
      ),
      {
        ...invocation,
        events: { ...invocation.events, save: 'storage-save' },
        allowXClosure: true,
        allowBackdropClosure: true,
      },
      owner,
    );
    const snapshot = invocation.params?.['snapshot'] as UiStorageSnapshot;
    const configuration =
      (invocation.params?.['configuration'] as UiStorageConfiguration | null) ?? null;
    const readOnly = invocation.params?.['readOnly'] === true;
    this.workflow = new UiStorageWorkflowController(
      snapshot,
      configuration,
      readOnly,
      new UiBrowserAdministrationClient(),
      (tabId) => this.popupRuntime?.acknowledgeTab(tabId),
      () => {
        this.popupRuntime?.setNotice(this.t('Configuration saved.', 'Η ρύθμιση αποθηκεύτηκε.'));
        this.popupRuntime?.commitBaseline();
        this.saved?.();
      },
    );
    this.view = {
      workflow: this.workflow,
      language: owner.language,
      revealedSecrets: this.revealedSecrets,
    };
    this.registerBodyRenderer('storage', {
      mount: ({ root, tab }) => {
        this.mountEvents(root);
        this.updateTab(root, tab.id);
      },
      update: (panel) => {
        const root = panel.querySelector<HTMLElement>('[data-popup-tab]');
        const id = root?.dataset['popupTab'];
        if (root && id) this.updateTab(root, id);
      },
      refreshLanguage: (root) => {
        for (const panel of root.querySelectorAll<HTMLElement>('[data-popup-tab]')) {
          if (panel.dataset['popupTab']) this.updateTab(panel, panel.dataset['popupTab']);
        }
      },
    });
  }

  protected override displayTitle(tab: UiPopupTabDefinition): UiPopupTabDefinition['title'] {
    const label =
      this.workflow?.stepById(tab.id)?.label ??
      (tab.id === 'configuration' ? 'Configuration' : tab.title.title);
    return {
      ...tab.title,
      title: typeof label === 'string' ? localizeStorage(label, this.owner.language()) : label,
    };
  }

  protected override tabStatusIcon(tabId: string): string {
    if (tabId === 'configuration' || tabId === 'capabilities') return '';
    const step = this.workflow?.stepById(tabId);
    if (!step) return '';
    if (tabId === 'connection' && this.workflow.connectionState === 'verified')
      return 'bi-check-circle-fill text-success';
    if (tabId === 'database' && this.workflow.databaseState === 'ready')
      return 'bi-check-circle-fill text-success';
    if (tabId === 'schema' && this.workflow.schemaState === 'ready')
      return 'bi-check-circle-fill text-success';
    if (!this.workflow.stepAccessible(step)) return 'bi-lock-fill text-secondary';
    if (this.workflow.stepNeedsCurrentVerification(step))
      return 'bi-exclamation-triangle-fill text-warning';
    return '';
  }

  private t(en: string, el: string): string {
    return this.owner.language() === 'EL' ? el : en;
  }

  onSaved(callback: () => void): void {
    this.saved = callback;
  }

  override open(): UiSurfaceHandle {
    const handle = super.open();
    this.unsubscribers.push(
      handle.onEvent((event) => {
        if (event === 'storage-save' && !this.workflow.busy) void this.workflow.save();
      }),
      this.workflow.subscribe(() => this.syncContext()),
    );
    this.syncContext();
    return handle;
  }

  private mountEvents(root: HTMLElement): void {
    root.addEventListener('input', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
      if (target.matches('[data-storage-name]')) this.workflow.rename(target.value);
      const fieldKey = target.dataset['storageField'];
      if (fieldKey) {
        const field = this.workflow.steps
          .flatMap((step) => step.fields)
          .find((candidate) => candidate.key === fieldKey);
        if (field)
          this.workflow.edit(
            field,
            target instanceof HTMLInputElement && target.type === 'checkbox'
              ? String(target.checked)
              : target.value,
          );
      }
    });
    root.addEventListener('change', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
      if (target.matches('[data-storage-adapter]')) this.workflow.switchAdapter(target.value);
      else if (target.matches('[data-storage-database-mode]'))
        this.workflow.selectDatabaseMode(
          target.dataset['storageDatabaseMode'] as 'existing' | 'new',
        );
      else if (target.matches('[data-storage-existing-database]'))
        this.workflow.selectDiscoveredDatabase(target.value);
      else if (target.matches('select[data-storage-field]')) {
        const field = this.workflow.steps
          .flatMap((step) => step.fields)
          .find((candidate) => candidate.key === target.dataset['storageField']);
        if (field) this.workflow.edit(field, target.value);
      }
    });
    root.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const picker = target.closest<HTMLElement>('[data-storage-adapter-picker]');
      if (picker) {
        if (
          (this.workflow.readOnly || this.workflow.configuration || this.workflow.busy) &&
          target.closest('summary')
        ) {
          event.preventDefault();
          return;
        }
        const chosen = target.closest<HTMLButtonElement>('[data-storage-adapter-choice]');
        if (
          chosen &&
          !this.workflow.readOnly &&
          !this.workflow.configuration &&
          !this.workflow.busy
        ) {
          const id = chosen.dataset['storageAdapterChoice'];
          if (id && this.workflow.snapshot.adapters.some((item) => item.id === id))
            this.workflow.switchAdapter(id);
          return;
        }
      }
      const toggle = target.closest<HTMLButtonElement>('[data-storage-secret-toggle]');
      if (toggle && !this.workflow.busy) {
        const key = toggle.dataset['storageSecretToggle'];
        if (key) {
          if (this.revealedSecrets.has(key)) this.revealedSecrets.delete(key);
          else this.revealedSecrets.add(key);
          const input = root.querySelector<HTMLInputElement>(
            `input[data-storage-secret][data-storage-field="${CSS.escape(key)}"]`,
          );
          if (input) input.type = this.revealedSecrets.has(key) ? 'text' : 'password';
          toggle.setAttribute(
            'aria-label',
            this.t(
              this.revealedSecrets.has(key) ? 'Hide password' : 'Show password',
              this.revealedSecrets.has(key) ? 'Απόκρυψη κωδικού' : 'Εμφάνιση κωδικού',
            ),
          );
          const icon = toggle.querySelector('i');
          if (icon)
            icon.className = this.revealedSecrets.has(key) ? 'bi bi-eye-slash' : 'bi bi-eye';
        }
        return;
      }
      const operation = target.closest<HTMLElement>('[data-storage-operation]')?.dataset[
        'storageOperation'
      ];
      if (operation && this.workflow.canOperate(operation)) void this.workflow.operation(operation);
      const category = target.closest<HTMLElement>('[data-storage-capability-category]')?.dataset[
        'storageCapabilityCategory'
      ];
      if (category) this.workflow.selectCapabilityCategory(category);
    });
  }

  /** Reconcile one tab without discarding unrelated native tab controls. */
  private updateTab(root: HTMLElement, id: string): void {
    if (this.closed || (!root.isConnected && root.dataset['popupTab'] === undefined)) return;
    const component = storageTabComponents.get(id)?.component;
    const step = this.workflow.stepById(id);
    const markup = component
      ? component.render(this.view)
      : step
        ? `<section class="storage-tab-body" data-storage-tab="${id}">${StorageTabStatus.render(this.view)}${StorageMetadataFields.render(this.view, step)}${StorageTabStatus.render(this.view, true)}</section>`
        : '';
    if (root.innerHTML === markup) return;
    // Preserve the caret and unsubmitted native secret field while a tab refreshes.
    const sameAdapter = root.dataset['storageRenderedAdapter'] === this.workflow.draft.adapterId;
    const secrets = new Map(
      (sameAdapter
        ? [
            ...root.querySelectorAll<HTMLInputElement>(
              'input[data-storage-secret][data-storage-field]',
            ),
          ]
        : []
      ).map((input) => [input.dataset['storageField'], input.value] as const),
    );
    const focused = root.ownerDocument.activeElement;
    const selector =
      sameAdapter && focused instanceof HTMLElement && root.contains(focused)
        ? focused.matches('[data-storage-name]')
          ? '[data-storage-name]'
          : focused.matches('[data-storage-adapter]')
            ? '[data-storage-adapter]'
            : focused.matches('[data-storage-existing-database]')
              ? '[data-storage-existing-database]'
              : focused.getAttribute('data-storage-field')
                ? `[data-storage-field="${CSS.escape(focused.getAttribute('data-storage-field') ?? '')}"]`
                : null
        : null;
    const previous = selector
      ? root.querySelector<HTMLInputElement | HTMLSelectElement>(selector)
      : null;
    const retained = previous?.value;
    const caret =
      previous instanceof HTMLInputElement && previous.type !== 'number'
        ? previous.selectionStart
        : null;
    root.innerHTML = markup;
    root.dataset['storageRenderedAdapter'] = this.workflow.draft.adapterId;
    for (const input of root.querySelectorAll<HTMLInputElement>(
      'input[data-storage-secret][data-storage-field]',
    )) {
      input.value = secrets.get(input.dataset['storageField']) ?? '';
    }
    const restored = selector
      ? root.querySelector<HTMLInputElement | HTMLSelectElement>(selector)
      : null;
    if (
      restored &&
      retained !== undefined &&
      !(restored instanceof HTMLInputElement && restored.type === 'checkbox')
    ) {
      restored.value = retained;
      restored.focus();
      if (caret !== null && restored instanceof HTMLInputElement && restored.type !== 'number')
        restored.setSelectionRange(caret, caret);
    }
  }

  /** Only safe values and secret-present facts are projected into the popup CTX. */
  private syncContext(): void {
    const runtime = this.popupRuntime;
    if (!runtime || this.closed) return;
    const flow = this.workflow;
    // The popup level survives adapter changes. Retire old adapter fields before
    // projecting the new adapter; neither secret presence nor old values may linger.
    if (this.projectedAdapterId && this.projectedAdapterId !== flow.draft.adapterId) {
      const previous = flow.snapshot.adapters.find(
        (adapter) => adapter.id === this.projectedAdapterId,
      );
      for (const tab of previous?.tabs ?? []) {
        for (const field of tab.fields) {
          const key = `setting_${this.projectedAdapterId}_${field.key}`;
          if (field.secret) runtime.setSensitiveFacts(key, { valid: true, present: false });
          else runtime.setFieldValue(key, '', true);
        }
      }
      for (const tab of previous?.tabs ?? []) {
        if (tab.id !== 'configuration') runtime.setFieldValue(`access_${tab.id}`, 'false', true);
      }
    }
    if (this.projectedAdapterId && this.projectedAdapterId !== flow.draft.adapterId)
      this.revealedSecrets.clear();
    this.projectedAdapterId = flow.draft.adapterId;
    runtime.setBusy(flow.busy);
    runtime.setFieldValue('name', flow.draft.name, flow.draft.name.trim().length > 0);
    runtime.setFieldValue('adapterId', flow.draft.adapterId, true);
    for (const [key, value] of Object.entries({
      stage: flow.workflow.stage,
      status: flow.workflow.status,
      connectionStatus: flow.connectionState,
      databaseStatus: flow.databaseState,
      schemaStatus: flow.schemaState,
    }))
      runtime.setFieldValue(key, value, true);
    for (const step of flow.steps) {
      if (step.id !== 'configuration')
        runtime.setFieldValue(`access_${step.id}`, String(flow.stepAccessible(step)), true);
      for (const field of step.fields) {
        const key = `setting_${flow.draft.adapterId}_${field.key}`;
        if (field.secret)
          runtime.setSensitiveFacts(key, { valid: true, present: flow.secretPresent(field) });
        else runtime.setFieldValue(key, flow.value(field), true);
      }
    }
    if (flow.error) runtime.setNotice(flow.error);
  }

  override dispose(reason: UiSurfaceCloseReason = 'host', actionId: string | null = null): void {
    if (this.closed) return;
    if (
      reason !== 'host' &&
      reason !== 'flow' &&
      !this.confirmedClose &&
      this.workflow.hasUnsavedChanges()
    ) {
      this.dirtyClose.requestExit(
        () => this.workflow.hasUnsavedChanges(),
        () => {
          this.confirmedClose = true;
          this.owner.requestClose('flow', null);
        },
        this.manager,
        { ownerLabel: this.t('Storage configuration', 'Ρύθμιση αποθήκευσης') },
      );
      return;
    }
    super.dispose(reason, actionId);
  }

  protected override onDisposed(): void {
    this.closed = true;
    for (const unsubscribe of this.unsubscribers.splice(0)) unsubscribe();
    this.workflow.dispose();
    this.saved = null;
  }
}
