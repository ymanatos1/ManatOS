import { computed, signal } from '@angular/core';
import {
  UiBrowserAdministrationClient,
  UiStorageWorkflowController,
  type UiStorageConfiguration,
  type UiStorageDraft,
  type UiStorageField,
  type UiStorageSnapshot,
  type UiStorageTab,
} from '@manatos/shared-ui';
import type { PopupContext } from '../../surfaces/PopupContext';
import { localizeStorage } from './StorageLocale';

/**
 * Native reactive bridge; UiStorageWorkflowController owns ALL editable values,
 * secrets, busy state, verification, save and operation lifecycle in shared.UI.
 * This component owns only Angular signals, localization, and safe popup CTX.
 */
export class StorageWizardState {
  private readonly controller: UiStorageWorkflowController;
  private readonly revision = signal(0);
  readonly language = signal<'EN' | 'EL'>('EN');
  readonly snapshot = computed(() => this.observe().snapshot);
  readonly configuration = computed(() => this.observe().configuration);
  readonly readOnly = computed(() => this.observe().readOnly);
  readonly draft = computed<UiStorageDraft>(() => this.observe().draft);
  readonly busy = computed(() => this.observe().busy);
  readonly error = computed(() => this.observe().error);
  readonly notice = computed(() =>
    this.observe().notice ? this.translate(this.observe().notice) : '',
  );
  readonly connectionState = computed(() => this.observe().connectionState);
  readonly databaseState = computed(() => this.observe().databaseState);
  readonly schemaState = computed(() => this.observe().schemaState);
  readonly databases = computed(() => this.observe().databases);
  readonly databaseMode = computed(() => this.observe().databaseMode);
  readonly databaseField = computed(() => this.observe().databaseField);
  readonly schemaChanges = computed(() => this.observe().schemaChanges);
  readonly adapter = computed(() => this.observe().adapter);
  readonly capabilityGroups = computed(() => this.observe().capabilityGroups);
  readonly activeCapabilityCategory = computed(() => this.observe().activeCapabilityCategory);
  readonly selectedCapabilities = computed(() => this.observe().selectedCapabilities);
  readonly steps = computed<readonly UiStorageTab[]>(() => this.observe().steps);
  readonly canCheckSchema = computed(() => this.observe().canCheckSchema);
  readonly workflow = computed(() => this.observe().workflow);

  private popup: PopupContext | null = null;
  private readonly unsubscribe: () => void;
  private disposed = false;

  constructor(
    snapshot: UiStorageSnapshot,
    configuration: UiStorageConfiguration | null,
    readOnly: boolean,
    language: 'EN' | 'EL',
    onCommitted: () => void,
  ) {
    this.language.set(language);
    this.controller = new UiStorageWorkflowController(
      snapshot,
      configuration,
      readOnly,
      new UiBrowserAdministrationClient(),
      (tabId) => this.popup?.acknowledgeTab(tabId),
      () => {
        this.popup?.setNotice(this.t('Configuration saved.', 'Η ρύθμιση αποθηκεύτηκε.'));
        this.popup?.commitBaseline();
        onCommitted();
      },
    );
    this.unsubscribe = this.controller.subscribe(() => {
      this.revision.update((value) => value + 1);
      this.syncContext();
    });
  }

  private observe(): UiStorageWorkflowController {
    this.revision();
    return this.controller;
  }

  attach(popup: PopupContext): void {
    this.popup = popup;
    this.syncContext();
    popup.commitBaseline();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribe();
    this.controller.dispose();
    this.popup = null;
  }

  translate(value: string): string {
    return localizeStorage(value, this.language());
  }

  adapterGroups(): readonly {
    family: string;
    adapters: readonly UiStorageSnapshot['adapters'][number][];
  }[] {
    const groups = new Map<string, UiStorageSnapshot['adapters'][number][]>();
    for (const adapter of this.snapshot().adapters) {
      const family =
        adapter.familyPath.map((name) => this.translate(name)).join(' › ') ||
        this.t('Other', 'Άλλο');
      const members = groups.get(family) ?? [];
      members.push(adapter);
      groups.set(family, members);
    }
    return [...groups].map(([family, adapters]) => ({ family, adapters }));
  }

  adapterLogo(): string {
    const url = this.adapter()?.logoUrl;
    return url?.startsWith('/images/storage-adapters/') ? url : '/images/storage-adapters/json.svg';
  }

  adapterFamilyLabel(): string {
    return (this.adapter()?.familyPath ?? []).map((value) => this.translate(value)).join(' / ');
  }

  t(en: string, el: string): string {
    return this.language() === 'EL' ? el : en;
  }

  hasUnsavedChanges(): boolean {
    this.revision();
    return this.controller.hasUnsavedChanges();
  }

  /** Clear the old adapter's CTX projection before the shared model changes. */
  switchAdapter(id: string): void {
    if (this.readOnly() || this.configuration() || this.busy()) return;
    const previous = this.adapter();
    if (!this.snapshot().adapters.some((item) => item.id === id) || previous?.id === id) return;
    if (this.popup && previous) {
      for (const step of previous.tabs)
        for (const field of step.fields) {
          if (field.secret) {
            this.popup.setSensitiveFacts(`setting_${previous.id}_${field.key}`, {
              valid: true,
              present: false,
            });
          } else {
            this.popup.setFieldValue(`setting_${previous.id}_${field.key}`, '', true);
          }
        }
    }
    this.controller.switchAdapter(id);
    this.popup?.selectTab('configuration');
  }

  rename(value: string): void {
    this.controller.rename(value);
  }

  value(field: UiStorageField): string {
    this.revision();
    return this.controller.value(field);
  }

  configured(field: UiStorageField): boolean {
    this.revision();
    return this.controller.configured(field);
  }

  visible(field: UiStorageField): boolean {
    this.revision();
    return this.controller.visible(field);
  }

  required(field: UiStorageField): boolean {
    this.revision();
    return this.controller.required(field);
  }

  edit(field: UiStorageField, value: string): void {
    this.controller.edit(field, value);
  }

  selectTab(id: string): void {
    if (!this.stepById(id)) return;
    this.popup?.selectTab(id);
    this.syncContext();
  }

  stepById(id: string): UiStorageTab | undefined {
    this.revision();
    return this.controller.stepById(id);
  }

  selectCapabilityCategory(value: string): void {
    this.controller.selectCapabilityCategory(value);
  }

  stepAccessible(step: UiStorageTab): boolean {
    this.revision();
    return this.controller.stepAccessible(step);
  }

  stepNeedsCurrentVerification(step: UiStorageTab): boolean {
    this.revision();
    return this.controller.stepNeedsCurrentVerification(step);
  }

  selectDatabaseMode(mode: 'existing' | 'new'): void {
    this.controller.selectDatabaseMode(mode);
  }

  selectDiscoveredDatabase(value: string): void {
    this.controller.selectDiscoveredDatabase(value);
  }

  canOperate(name: string): boolean {
    this.revision();
    return this.controller.canOperate(name);
  }

  async operation(name: string): Promise<void> {
    await this.controller.operation(name);
  }

  async save(): Promise<void> {
    await this.controller.save();
  }

  /** Project only safe values; secret replacements never enter the popup CTX. */
  private syncContext(): void {
    const popup = this.popup;
    if (!popup || this.disposed) return;
    const draft = this.controller.draft;
    popup.setBusy(this.controller.busy);
    popup.setFieldValue('name', draft.name, draft.name.trim().length > 0);
    popup.setFieldValue('adapterId', draft.adapterId, true);
    const workflow = this.controller.workflow;
    popup.setFieldValue('stage', workflow.stage, true);
    popup.setFieldValue('status', workflow.status, true);
    popup.setFieldValue('connectionStatus', this.controller.connectionState, true);
    popup.setFieldValue('databaseStatus', this.controller.databaseState, true);
    popup.setFieldValue('schemaStatus', this.controller.schemaState, true);
    for (const step of this.controller.steps) {
      if (step.id === 'configuration') continue;
      popup.setFieldValue(`access_${step.id}`, String(this.controller.stepAccessible(step)), true);
      for (const field of step.fields) {
        if (field.secret) {
          popup.setSensitiveFacts(`setting_${draft.adapterId}_${field.key}`, {
            valid: true,
            present: this.controller.secretPresent(field),
          });
        } else {
          popup.setFieldValue(
            `setting_${draft.adapterId}_${field.key}`,
            draft.settings[field.key] ?? '',
            true,
          );
        }
      }
    }
  }
}
