import {
  UiBrowserAdministrationClient,
  configurationInputError,
  groupUiConfigurations,
  hasDirtyConfigurationDrafts,
  type UiConfigurationSetting,
} from '@manatos/shared-ui';
import { renderNativeComponent } from '../native-template.js';
import { e, t, type StorageView } from './storage/StorageParts.js';

/** Configuration page owns transient row edits; API remains authoritative for Apply. */
export function renderConfigurationPageHost(): string {
  return renderNativeComponent('ConfigurationPageHost');
}
export function mountConfigurationPageHost(
  scope: ParentNode,
  language: () => 'EN' | 'EL',
  readOnly: boolean,
): { destroy(): void; refreshLanguage(): void; hasUnsavedChanges(): boolean } {
  const root = scope.querySelector<HTMLElement>('[data-administration-configuration]');
  if (!root) throw new Error('Configuration page host not found.');
  const body = root.querySelector<HTMLElement>('[data-administration-configuration-content]');
  if (!body) throw new Error('Configuration page content not found.');
  const api = new UiBrowserAdministrationClient();
  const abort = new AbortController();
  const drafts = new Map<string, string>();
  const feedback = new Map<string, { ok: boolean; message: string }>();
  const saving = new Set<string>();
  let items: readonly UiConfigurationSetting[] = [];
  let loading = true;
  let disposed = false;
  let error = '';
  const view = { language } as StorageView;
  const local = (en: string, el: string) => e(t(view, en, el));
  const groupIcon = (group: string): string => {
    const icons: Record<string, string> = {
      UI: 'bi-window',
      API: 'bi-braces',
      Mail: 'bi-envelope-at',
      Logging: 'bi-journal-text',
      'Errors & diagnostics': 'bi-bug',
      Sessions: 'bi-clock-history',
    };
    return icons[group] ?? 'bi-gear';
  };
  const render = (): void => {
    if (disposed) return;
    const active = body.contains(body.ownerDocument.activeElement)
      ? body.ownerDocument.activeElement
      : null;
    const focusedId =
      active instanceof HTMLInputElement || active instanceof HTMLSelectElement
        ? active.dataset['configurationInput']
        : undefined;
    const caret =
      active instanceof HTMLInputElement && active.type !== 'number' ? active.selectionStart : null;
    const groups = groupUiConfigurations(items);
    body.innerHTML = `
      <div class="alert alert-info"><strong>${local('Secrets stay protected.', 'Τα μυστικά παραμένουν προστατευμένα.')}</strong> ${local('Enter a replacement only when necessary.', 'Εισαγάγετε νέα τιμή μόνο όταν χρειάζεται.')}</div>
      ${readOnly ? `<div class="alert alert-info">${local('Inspection mode. Only Administrators can change settings.', 'Λειτουργία επιθεώρησης. Μόνο διαχειριστές μπορούν να αλλάζουν ρυθμίσεις.')}</div>` : ''}
      ${error ? `<div class="alert alert-danger" role="alert">${e(error)} <button type="button" class="btn btn-sm btn-outline-danger" data-configuration-retry>${local('Retry', 'Επανάληψη')}</button></div>` : ''}
      ${
        loading
          ? `<p role="status">${local('Loading configuration…', 'Φόρτωση ρυθμίσεων…')}</p>`
          : `
      <div class="row g-4">${groups.map((group) => `<div class="col-12 col-xl-6"><section class="card shadow-sm h-100"><header class="card-header"><h2 class="h5 mb-0"><i class="bi ${groupIcon(group.name)} me-2" aria-hidden="true"></i>${e(group.name)}</h2></header><div class="card-body p-0">${group.items.map((item) => renderItem(item)).join('')}</div></section></div>`).join('')}</div>`
      }`;
    // Secret replacements remain private input values, never serialized into HTML attributes.
    const controls = Array.from(
      body.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-configuration-input]'),
    );
    const sensitive = new Set(items.filter((item) => item.sensitive).map((item) => item.id));
    for (const control of controls) {
      const id = control.dataset['configurationInput'];
      if (id && sensitive.has(id)) control.value = drafts.get(id) ?? '';
    }
    const restore = controls.find((control) => control.dataset['configurationInput'] === focusedId);
    if (restore && !restore.disabled) {
      restore.focus();
      if (caret !== null && restore instanceof HTMLInputElement && restore.type !== 'number')
        restore.setSelectionRange(caret, caret);
    }
  };
  const renderItem = (item: UiConfigurationSetting): string => {
    const value = drafts.get(item.id) ?? (item.sensitive ? '' : (item.value ?? ''));
    const locked = readOnly || !item.editable || !item.enabled || saving.has(item.id);
    const attrs = `data-configuration-input="${e(item.id)}" id="cfg-${e(item.id)}" ${locked ? 'disabled' : ''}`;
    let control: string;
    if (item.valueType === 'boolean') {
      control = `<select class="form-select" ${attrs}><option value="true" ${value === 'true' ? 'selected' : ''}>${local('Enabled / true', 'Ενεργό / true')}</option><option value="false" ${value === 'false' ? 'selected' : ''}>${local('Disabled / false', 'Ανενεργό / false')}</option></select>`;
    } else if (item.valueType === 'enum') {
      control = `<select class="form-select" ${attrs}>${(item.allowedValues ?? []).map((option) => `<option value="${e(option)}" ${value === option ? 'selected' : ''}>${e(option)}</option>`).join('')}</select>`;
    } else {
      const kind = item.sensitive ? 'password' : item.valueType === 'number' ? 'number' : 'text';
      control = `<input class="form-control" type="${kind}" ${attrs} autocomplete="${item.sensitive ? 'new-password' : 'off'}" value="${item.sensitive ? '' : e(value)}" placeholder="${item.sensitive && item.secretConfigured ? local('Leave blank to keep the stored secret', 'Αφήστε κενό για διατήρηση') : ''}">`;
    }
    const result = feedback.get(item.id);
    return `<form class="configuration-setting p-3 border-bottom" data-configuration-form="${e(item.id)}"><div class="d-flex justify-content-between gap-3 mb-1"><label class="fw-semibold" for="cfg-${e(item.id)}">${e(item.name)}</label><div class="d-flex gap-1">${item.restartRequired ? `<span class="badge text-bg-warning">${local('Restart required', 'Απαιτείται επανεκκίνηση')}</span>` : ''}${item.sensitive && item.secretConfigured ? `<span class="badge text-bg-success">${local('Secret configured', 'Το μυστικό έχει οριστεί')}</span>` : ''}</div></div><p class="small text-secondary">${e(item.description ?? '')}</p><div class="input-group">${control}${!locked ? `<button class="btn btn-outline-primary" type="submit" ${item.sensitive && !value ? 'disabled' : ''}>${local('Apply', 'Εφαρμογή')}</button>` : ''}</div><div class="form-text ${result ? (result.ok ? 'text-success' : 'text-danger') : ''}" aria-live="polite">${e(result?.message ?? '')}</div>${item.defaultValue && !item.sensitive ? `<div class="form-text">${local('Default:', 'Προεπιλογή:')} <code>${e(item.defaultValue)}</code></div>` : ''}</form>`;
  };
  const reload = async (): Promise<void> => {
    loading = true;
    error = '';
    render();
    try {
      const loaded = await api.configurations(abort.signal);
      if (disposed) return;
      items = loaded;
      drafts.clear();
      feedback.clear();
    } catch (cause) {
      if (!disposed) error = cause instanceof Error ? cause.message : String(cause);
    } finally {
      loading = false;
      render();
    }
  };
  const apply = async (id: string): Promise<void> => {
    const item = items.find((entry) => entry.id === id);
    if (!item || readOnly || !item.editable || !item.enabled || saving.has(id)) return;
    const value = drafts.get(id) ?? (item.sensitive ? '' : (item.value ?? ''));
    const issue = configurationInputError(item, value);
    if (issue) {
      feedback.set(id, { ok: false, message: issue });
      render();
      return;
    }
    if (item.sensitive && !value) return;
    saving.add(id);
    render();
    try {
      const next = await api.setConfigurationValue(id, value, abort.signal);
      if (disposed) return;
      items = items.map((existing) => (existing.id === id ? next : existing));
      drafts.delete(id);
      feedback.set(id, { ok: true, message: t(view, 'Applied.', 'Εφαρμόστηκε.') });
    } catch (cause) {
      if (!disposed)
        feedback.set(id, {
          ok: false,
          message: cause instanceof Error ? cause.message : String(cause),
        });
    } finally {
      saving.delete(id);
      render();
    }
  };
  const hasUnsavedChanges = (): boolean => !readOnly && hasDirtyConfigurationDrafts(items, drafts);
  const onInput = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
    const id = target.dataset['configurationInput'];
    if (!id || readOnly) return;
    drafts.set(id, target.value);
    feedback.delete(id);
    const submit = target
      .closest('form')
      ?.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (submit && target.type === 'password') submit.disabled = target.value.length === 0;
  };
  const onSubmit = (event: Event): void => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    event.preventDefault();
    const id = form.dataset['configurationForm'];
    if (id) void apply(id);
  };
  const onClick = (event: Event): void => {
    if (event.target instanceof Element && event.target.closest('[data-configuration-retry]'))
      void reload();
  };
  root.addEventListener('input', onInput);
  root.addEventListener('change', onInput);
  root.addEventListener('submit', onSubmit);
  root.addEventListener('click', onClick);
  void reload();
  return {
    hasUnsavedChanges,
    refreshLanguage: render,
    destroy(): void {
      disposed = true;
      abort.abort();
      drafts.clear();
      root.removeEventListener('input', onInput);
      root.removeEventListener('change', onInput);
      root.removeEventListener('submit', onSubmit);
      root.removeEventListener('click', onClick);
    },
  };
}
