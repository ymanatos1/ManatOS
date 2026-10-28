import {
  UiBrowserAdministrationClient,
  type UiStorageAdapter,
  type UiStorageConfiguration,
  type UiStorageSnapshot,
  type UiSurfaceHandle,
} from '@manatos/shared-ui';
import { EjsUiSurfaceManager } from '../surfaces/EjsUiSurfaceManager.js';
import { renderNativeComponent } from '../native-template.js';
import { e, t, tr, type StorageView } from './storage/StorageParts.js';

export function renderStoragePageHost(): string {
  return renderNativeComponent('StoragePageHost');
}
/** EJS Storage page: all changes re-read authoritative API state. */
export function mountStoragePageHost(
  scope: ParentNode,
  language: () => 'EN' | 'EL',
  readOnly: boolean,
  surfaces: EjsUiSurfaceManager,
): { destroy(): void; refreshLanguage(): void } {
  const root = scope.querySelector<HTMLElement>('[data-administration-storage]');
  const body = root?.querySelector<HTMLElement>('[data-administration-storage-content]');
  if (!root || !body) throw new Error('Storage page host not found.');
  const api = new UiBrowserAdministrationClient();
  const controller = new AbortController();
  let disposed = false;
  let snapshot: UiStorageSnapshot | null = null;
  let loading = true;
  let busy = false;
  let error = '';
  let notice = '';
  let selected = '';
  let debugEnabled = false;
  let debugDirectory = '';
  let wizard: UiSurfaceHandle | null = null;
  let confirmation: UiSurfaceHandle | null = null;
  let draggingConfigurationId = '';
  const view = { language } as StorageView;
  const local = (en: string, el: string): string => e(t(view, en, el));
  const translate = (value: string): string => tr(view, value);
  const adapter = (id: string): UiStorageAdapter | undefined =>
    snapshot?.adapters.find((item) => item.id === id);
  const canSelect = (item: UiStorageConfiguration): boolean =>
    Boolean(
      snapshot &&
      adapter(item.adapterId)?.runtimeAvailable &&
      (item.status === 'ready' ||
        item.id === snapshot.runningConfigurationId ||
        item.id === snapshot.selectedConfigurationId),
    );
  const logo = (item: UiStorageAdapter | undefined): string => {
    const url = item?.logoUrl;
    return url?.startsWith('/images/storage-adapters/') ? url : '/images/storage-adapters/json.svg';
  };
  const statusLabel = (item: UiStorageConfiguration): string => {
    if (item.id === snapshot?.runningConfigurationId) return t(view, 'Current', 'Τρέχον');
    if (item.id === snapshot?.selectedConfigurationId) return t(view, 'Selected', 'Επιλεγμένο');
    return tr(view, item.status);
  };
  const statusClass = (item: UiStorageConfiguration): string => {
    if (item.id === snapshot?.runningConfigurationId) return 'text-bg-primary';
    if (item.id === snapshot?.selectedConfigurationId) return 'text-bg-info';
    return item.status === 'ready'
      ? 'text-bg-success'
      : item.status === 'error'
        ? 'text-bg-danger'
        : item.status === 'incomplete'
          ? 'text-bg-warning'
          : 'text-bg-light border text-secondary';
  };
  const render = (): void => {
    if (disposed) return;
    body.innerHTML = `
      <section class="card shadow-sm mb-3"><header class="card-header d-flex justify-content-between align-items-center gap-2">
      <div><h2 class="h5 mb-1"><i class="bi bi-database-gear me-2"></i>${local('Storage', 'Αποθήκευση')}</h2><small class="text-secondary">${local('Configure the datastore selected for the next API startup.', 'Ρυθμίστε την αποθήκευση για την επόμενη εκκίνηση του API.')}</small></div>
      ${readOnly ? '' : `<button type="button" class="btn btn-primary btn-sm" data-storage-page-action="add" ${busy ? 'disabled' : ''}>${local('Add configuration', 'Νέα ρύθμιση')}</button>`}</header>
      <div class="card-body">${readOnly ? `<div class="alert alert-info">${local('Inspection only. Only Administrators can change storage settings.', 'Μόνο οι διαχειριστές μπορούν να αλλάξουν ρυθμίσεις.')}</div>` : ''}
      <div class="alert alert-warning">${local('Selection takes effect only after API restart. The running datastore is not switched.', 'Η αλλαγή ενεργοποιείται μόνο μετά την επανεκκίνηση του API.')}</div>
      ${error ? `<div class="alert alert-danger" role="alert">${e(error)}</div>` : ''}
      ${notice ? `<div class="alert alert-success" role="status">${e(notice)}</div>` : ''}
      ${
        loading
          ? `<p role="status">${local('Loading storage settings…', 'Φόρτωση ρυθμίσεων…')}</p>`
          : snapshot
            ? `
        <div class="row g-2 mb-3 align-items-end"><div class="col-md-8"><div class="form-label">${local('Storage configuration for next API start', 'Αποθήκευση στην επόμενη εκκίνηση')}</div>
        <details class="storage-rich-picker" data-storage-next-picker>
          <summary class="btn btn-outline-secondary w-100 text-start d-flex align-items-center justify-content-between gap-2" aria-label="${local('Storage configuration for next API start', 'Αποθήκευση στην επόμενη εκκίνηση')}" ${readOnly || busy ? 'aria-disabled="true" tabindex="-1"' : ''}>
          ${(() => {
            const active = snapshot.configurations.find((entry) => entry.id === selected);
            return active
              ? `<span class="d-flex align-items-center gap-2 min-w-0"><strong class="text-truncate">${e(active.name)}</strong><span>—</span><img src="${e(logo(adapter(active.adapterId)))}" alt="" width="20" height="20"><span class="text-truncate">${translate(adapter(active.adapterId)?.name ?? active.adapterId)}</span><span class="small text-secondary text-nowrap">${translate(active.status)} (${translate(active.stage)})</span></span>`
              : `<span>${local('Choose storage configuration', 'Επιλέξτε ρύθμιση αποθήκευσης')}</span>`;
          })()}
          <i class="bi bi-chevron-down ms-auto" aria-hidden="true"></i></summary>
          <div class="storage-rich-picker-menu">${snapshot.configurations.map((item) => `<button type="button" class="storage-rich-option d-flex align-items-center gap-2 ${item.id === selected ? 'active' : ''}" data-storage-next-option="${e(item.id)}" ${canSelect(item) && !readOnly && !busy ? '' : 'disabled'}><strong class="text-truncate">${e(item.name)}</strong><span>—</span><img src="${e(logo(adapter(item.adapterId)))}" alt="" width="20" height="20"><span class="text-truncate">${translate(adapter(item.adapterId)?.name ?? item.adapterId)}</span><span class="small ms-auto text-nowrap">${translate(item.status)} (${translate(item.stage)})</span></button>`).join('')}</div>
        </details></div>
        ${readOnly ? '' : `<div class="col-md-auto"><button type="button" class="btn btn-outline-primary" data-storage-page-action="select" ${busy || selected === snapshot.selectedConfigurationId ? 'disabled' : ''}>${local('Apply selection', 'Εφαρμογή επιλογής')}</button></div>`}</div>
        ${snapshot.selectedConfigurationId !== snapshot.runningConfigurationId ? `<p class="text-warning-emphasis small">${local('Restart pending: selected and running configurations differ.', 'Εκκρεμεί επανεκκίνηση.')}</p>` : ''}
        <div class="table-responsive"><table class="table table-sm align-middle"><thead><tr><th></th><th>${local('Name', 'Όνομα')}</th><th>${local('Adapter', 'Προσαρμογέας')}</th><th>${local('Status', 'Κατάσταση')}</th><th>${local('Stage', 'Στάδιο')}</th><th class="text-end">${local('Actions', 'Ενέργειες')}</th></tr></thead><tbody data-storage-configurations>
        ${snapshot.configurations
          .map(
            (
              item,
            ) => `<tr data-storage-configuration-id="${e(item.id)}" draggable="${!readOnly && !busy}"><td class="text-secondary text-center storage-configuration-drag-handle" title="${local('Drag to reorder', 'Σύρετε για αλλαγή σειράς')}">${readOnly ? '' : '<i class="bi bi-grip-vertical" aria-hidden="true"></i>'}</td>
          <td class="fw-semibold">${e(item.name)}</td>
          <td><span class="d-inline-flex align-items-center gap-2"><img src="${e(logo(adapter(item.adapterId)))}" alt="" width="22" height="22" class="rounded">${translate(adapter(item.adapterId)?.name ?? item.adapterId)}</span></td><td><span class="badge ${statusClass(item)}">${e(statusLabel(item))}</span></td><td>${translate(item.stage)}</td>
          <td class="text-end text-nowrap"><button type="button" class="btn btn-sm btn-outline-secondary" data-storage-page-action="open" ${busy ? 'disabled' : ''}><i class="bi ${readOnly ? 'bi-eye' : 'bi-sliders'} me-1" aria-hidden="true"></i>${readOnly ? local('Inspect', 'Προβολή') : local('Configure', 'Ρύθμιση')}</button>
          ${readOnly ? '' : `<button type="button" class="btn btn-sm btn-outline-danger ms-1" data-storage-page-action="delete" ${busy || item.id === snapshot!.runningConfigurationId || item.id === snapshot!.selectedConfigurationId ? 'disabled' : ''}><i class="bi bi-trash3 me-1" aria-hidden="true"></i>${local('Delete', 'Διαγραφή')}</button>`}</td></tr>`,
          )
          .join('')}</tbody></table></div>`
            : ''
      }</div></section>
      ${snapshot ? `<section class="card shadow-sm"><header class="card-header"><h3 class="h6 mb-1"><i class="bi bi-bug me-2"></i>${local('API storage CTX debugging', 'Διαγνωστικά CTX αποθήκευσης API')}</h3><p class="small text-secondary mb-0">${local('Persist post-operation API/storage CTX snapshots for later inspection.', 'Αποθήκευση στιγμιοτύπων CTX μετά από λειτουργίες API για μεταγενέστερο έλεγχο.')}</p></header><div class="card-body"><label class="form-check mb-2"><input class="form-check-input" type="checkbox" role="switch" data-storage-debug-enabled ${debugEnabled ? 'checked' : ''} ${readOnly || busy ? 'disabled' : ''}><span class="form-check-label">${local('Capture API / storage context snapshots', 'Καταγραφή στιγμιοτύπων API / αποθήκευσης')}</span></label><label class="form-label" for="storage-debug-path">${local('Output directory', 'Φάκελος εξόδου')}</label><input class="form-control font-monospace mb-2" id="storage-debug-path" data-storage-debug-path value="${e(debugDirectory)}" ${readOnly || busy ? 'disabled' : ''}><div class="form-text mb-2">${local('Default: ../data/logs/api/. Relative paths are resolved by the API process.', 'Προεπιλογή: ../data/logs/api/. Οι σχετικές διαδρομές υπολογίζονται από το API.')}</div>${readOnly ? '' : `<button class="btn btn-outline-primary btn-sm" type="button" data-storage-page-action="debug" ${busy ? 'disabled' : ''}>${local('Save diagnostics', 'Αποθήκευση διαγνωστικών')}</button>`}</div></section>` : ''}`;
  };
  const reload = async (): Promise<void> => {
    loading = true;
    error = '';
    render();
    try {
      const model = await api.storage(controller.signal);
      if (disposed) return;
      snapshot = model;
      selected = model.selectedConfigurationId;
      debugEnabled = model.debugging.apiStorageContextEnabled;
      debugDirectory = model.debugging.outputDirectory;
    } catch (cause) {
      if (!disposed) error = cause instanceof Error ? cause.message : String(cause);
    } finally {
      loading = false;
      render();
    }
  };
  const execute = async (operation: () => Promise<void>, message: string): Promise<void> => {
    if (disposed || busy || readOnly) return;
    busy = true;
    error = '';
    notice = '';
    render();
    try {
      await operation();
      if (!disposed) {
        notice = message;
        await reload();
      }
    } catch (cause) {
      if (!disposed) error = cause instanceof Error ? cause.message : String(cause);
    } finally {
      busy = false;
      render();
    }
  };
  const open = (config: UiStorageConfiguration | null): void => {
    if (!snapshot || disposed || wizard?.isOpen() || (readOnly && !config)) return;
    wizard = surfaces.openStorageWizard(snapshot, config, readOnly, () => {
      notice = t(view, 'Storage configuration saved.', 'Η ρύθμιση αποθηκεύτηκε.');
      void reload();
    });
    const opened = wizard;
    const unsubscribe = opened.onEvent((event) => {
      if (event === 'disposing') {
        if (wizard === opened) wizard = null;
        unsubscribe();
      }
    });
  };
  const remove = (item: UiStorageConfiguration): void => {
    if (disposed || busy || readOnly || confirmation?.isOpen() || !snapshot) return;
    if (item.id === snapshot.selectedConfigurationId || item.id === snapshot.runningConfigurationId)
      return;
    const popup = surfaces.open('message.alert', {
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
    confirmation = popup;
    const unsubscribe = popup.onEvent((event) => {
      if (event === 'disposing') {
        if (confirmation === popup) confirmation = null;
        unsubscribe();
        return;
      }
      if (event !== 'storage-delete-confirmed' || !popup.isOpen()) return;
      popup.close('button');
      if (
        disposed ||
        readOnly ||
        busy ||
        !snapshot?.configurations.some((record) => record.id === item.id) ||
        item.id === snapshot.selectedConfigurationId ||
        item.id === snapshot.runningConfigurationId
      )
        return;
      void execute(
        () => api.deleteStorageConfiguration(item.id, controller.signal),
        t(view, 'Configuration deleted.', 'Η ρύθμιση διαγράφηκε.'),
      );
    });
  };
  const onClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const picker = target.closest<HTMLElement>('[data-storage-next-picker]');
    if (picker) {
      if ((readOnly || busy) && target.closest('summary')) {
        event.preventDefault();
        return;
      }
      const option = target.closest<HTMLButtonElement>('[data-storage-next-option]');
      if (option && !option.disabled && snapshot && !readOnly && !busy) {
        const record = snapshot.configurations.find(
          (item) => item.id === option.dataset['storageNextOption'],
        );
        if (record && canSelect(record)) {
          selected = record.id;
          render();
        }
        return;
      }
    }
    const actionButton = target.closest<HTMLButtonElement>('[data-storage-page-action]');
    if (!actionButton || actionButton.disabled) return;
    const action = actionButton.dataset['storagePageAction'];
    const id = actionButton.closest<HTMLElement>('[data-storage-configuration-id]')?.dataset[
      'storageConfigurationId'
    ];
    const item = snapshot?.configurations.find((record) => record.id === id);
    if (action === 'add') open(null);
    else if (action === 'open' && item) open(item);
    else if (action === 'delete' && item) remove(item);
    else if (action === 'select' && snapshot) {
      const targetConfig = snapshot.configurations.find((record) => record.id === selected);
      if (targetConfig && canSelect(targetConfig))
        void execute(
          () => api.selectStorageConfiguration(targetConfig.id, controller.signal),
          t(
            view,
            'Selection saved for next API restart.',
            'Η επιλογή αποθηκεύτηκε για την επόμενη επανεκκίνηση.',
          ),
        );
    } else if (action === 'debug')
      void execute(
        () =>
          api.updateStorageDebugging(
            { apiStorageContextEnabled: debugEnabled, outputDirectory: debugDirectory },
            controller.signal,
          ),
        t(view, 'Diagnostics settings saved.', 'Οι διαγνωστικές ρυθμίσεις αποθηκεύτηκαν.'),
      );
  };
  const onInput = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
    if (readOnly || busy) return;
    if (target.matches('[data-storage-debug-enabled]') && target instanceof HTMLInputElement)
      debugEnabled = target.checked;
    else if (target.matches('[data-storage-debug-path]')) debugDirectory = target.value;
  };
  const rowFromEvent = (event: DragEvent): HTMLTableRowElement | null => {
    const target = event.target;
    return target instanceof Element
      ? target.closest<HTMLTableRowElement>('tr[data-storage-configuration-id]')
      : null;
  };
  const onDragStart = (event: DragEvent): void => {
    if (disposed || busy || readOnly || !snapshot) {
      event.preventDefault();
      return;
    }
    const row = rowFromEvent(event);
    if (!row) return;
    draggingConfigurationId = row.dataset['storageConfigurationId'] ?? '';
    row.classList.add('opacity-50');
    event.dataTransfer?.setData('text/plain', draggingConfigurationId);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  };
  const onDragOver = (event: DragEvent): void => {
    if (!draggingConfigurationId || disposed || busy || readOnly) return;
    const target = rowFromEvent(event);
    const body = root.querySelector<HTMLElement>('[data-storage-configurations]');
    const dragged = Array.from(
      body?.querySelectorAll<HTMLTableRowElement>('tr[data-storage-configuration-id]') ?? [],
    ).find((row) => row.dataset['storageConfigurationId'] === draggingConfigurationId);
    if (!target || !dragged || target.parentElement !== body) return;
    event.preventDefault();
    if (dragged === target) return;
    const bounds = target.getBoundingClientRect();
    body?.insertBefore(
      dragged,
      event.clientY < bounds.top + bounds.height / 2 ? target : target.nextSibling,
    );
  };
  const onDrop = (event: DragEvent): void => {
    if (!draggingConfigurationId || !snapshot || disposed || busy || readOnly) return;
    const row = rowFromEvent(event);
    const body = root.querySelector<HTMLElement>('[data-storage-configurations]');
    if (!row || !body || row.parentElement !== body) return;
    event.preventDefault();
    draggingConfigurationId = '';
    const ids = Array.from(
      body.querySelectorAll<HTMLTableRowElement>('tr[data-storage-configuration-id]'),
    ).map((entry) => entry.dataset['storageConfigurationId'] ?? '');
    if (
      ids.length !== snapshot.configurations.length ||
      new Set(ids).size !== ids.length ||
      ids.some((id) => !snapshot?.configurations.some((entry) => entry.id === id)) ||
      ids.every((id, index) => id === snapshot?.configurations[index]?.id)
    ) {
      render();
      return;
    }
    void execute(
      () => api.reorderStorageConfigurations(ids, controller.signal),
      t(view, 'Order updated.', 'Η σειρά ενημερώθηκε.'),
    );
  };
  const onDragEnd = (): void => {
    if (!draggingConfigurationId) return;
    draggingConfigurationId = '';
    render();
  };
  root.addEventListener('click', onClick);
  root.addEventListener('input', onInput);
  root.addEventListener('change', onInput);
  root.addEventListener('dragstart', onDragStart);
  root.addEventListener('dragover', onDragOver);
  root.addEventListener('drop', onDrop);
  root.addEventListener('dragend', onDragEnd);
  void reload();
  return {
    refreshLanguage: render,
    destroy(): void {
      disposed = true;
      controller.abort();
      if (wizard?.isOpen()) wizard.close('host');
      if (confirmation?.isOpen()) confirmation.close('host');
      wizard = null;
      confirmation = null;
      root.removeEventListener('click', onClick);
      root.removeEventListener('input', onInput);
      root.removeEventListener('change', onInput);
      root.removeEventListener('dragstart', onDragStart);
      root.removeEventListener('dragover', onDragOver);
      root.removeEventListener('drop', onDrop);
      root.removeEventListener('dragend', onDragEnd);
    },
  };
}
