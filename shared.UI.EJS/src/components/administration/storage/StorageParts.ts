import type {
  UiPopupFeatureContentDefinition,
  UiStorageField,
  UiStorageSnapshot,
  UiStorageTab,
  UiStorageWorkflowController,
} from '@manatos/shared-ui';
import { escapeHtml } from '../../../rendering/html.js';
import { renderNativeComponent } from '../../native-template.js';
import { localizeStorage } from './StorageLocale.js';

export interface StorageView {
  readonly workflow: UiStorageWorkflowController;
  readonly language: () => 'EN' | 'EL';
  readonly revealedSecrets?: ReadonlySet<string>;
}
export function t(view: StorageView, en: string, el: string): string {
  return view.language() === 'EL' ? el : en;
}
export function tr(view: StorageView, text: string): string {
  return escapeHtml(localizeStorage(text, view.language()));
}
export function e(value: unknown): string {
  return escapeHtml(value);
}
export function button(view: StorageView, action: string, en: string, el: string): string {
  const enabled = view.workflow.canOperate(action);
  return `<button type="button" class="btn btn-sm btn-outline-primary" data-storage-operation="${e(action)}" ${enabled ? '' : 'disabled'}>${e(t(view, en, el))}</button>`;
}

/** Embedded field renderer: API metadata owns field semantics, not the popup host. */
export class StorageMetadataFields {
  static layout(snapshot: UiStorageSnapshot, id: string): UiPopupFeatureContentDefinition {
    return {
      id: `storage-${id}-fields`,
      kind: 'feature-content',
      children: snapshot.adapters.flatMap((adapter) =>
        (adapter.tabs.find((tab) => tab.id === id)?.fields ?? []).map((field) => ({
          id: `storage-setting-${adapter.id}-${field.key}`,
          kind: 'feature-content' as const,
        })),
      ),
    };
  }
  static render(view: StorageView, step: UiStorageTab, except: readonly string[] = []): string {
    const adapter = view.workflow.adapter;
    if (!adapter) return '';
    const contents = step.fields
      .filter((field) => !except.includes(field.key) && view.workflow.visible(field))
      .map((field) => this.field(view, field))
      .join('');
    return renderNativeComponent(
      'StorageMetadataFields',
      { LayoutId: `storage-${step.id}-fields` },
      { Fields: contents },
    );
  }
  private static field(view: StorageView, field: UiStorageField): string {
    const flow = view.workflow;
    const value = flow.value(field);
    const disabled = flow.readOnly || flow.busy ? 'disabled' : '';
    const required = flow.required(field) ? 'required' : '';
    const fieldId = `storage-setting-${flow.draft.adapterId}-${field.key}`;
    const label = `<label class="form-label fw-semibold" for="storage-field-${e(field.key)}">${tr(view, field.label)}${flow.required(field) ? ' *' : ''}</label>`;
    const meta = `data-storage-field="${e(field.key)}" id="storage-field-${e(field.key)}" ${disabled} ${required}`;
    let control = '';
    if (field.type === 'select') {
      control = `<select class="form-select" ${meta}><option value="" ${value ? '' : 'selected'}>—</option>${(field.options ?? []).map((option) => `<option value="${e(option.value)}" ${value === option.value ? 'selected' : ''}>${tr(view, option.label)}</option>`).join('')}</select>`;
    } else if (field.type === 'boolean' && field.presentation === 'checkbox') {
      control = `<input type="checkbox" class="form-check-input" ${meta} ${value === 'true' ? 'checked' : ''}>`;
    } else if (field.type === 'boolean') {
      control = `<select class="form-select" ${meta}><option value="" ${value ? '' : 'selected'}>—</option><option value="true" ${value === 'true' ? 'selected' : ''}>${e(t(view, 'Yes', 'Ναι'))}</option><option value="false" ${value === 'false' ? 'selected' : ''}>${e(t(view, 'No', 'Όχι'))}</option></select>`;
    } else {
      const type =
        field.secret && !view.revealedSecrets?.has(field.key)
          ? 'password'
          : field.type === 'number'
            ? 'number'
            : 'text';
      // Secret replacements are never inserted in HTML attributes or CTX.
      const stored = field.secret ? '' : value;
      control = `<input class="form-control" type="${type}" ${meta} ${field.secret ? 'data-storage-secret' : ''} value="${e(stored)}" autocomplete="${field.secret ? 'new-password' : 'off'}" placeholder="${e(field.secret && flow.configured(field) ? t(view, 'Secret configured — leave blank to retain', 'Ορισμένο μυστικό — αφήστε κενό για διατήρηση') : (field.suggestedValue ?? ''))}">`;
    }
    if (field.secret) {
      const revealed = view.revealedSecrets?.has(field.key) ?? false;
      control = `<div class="input-group">${control}<button type="button" class="btn btn-outline-secondary" data-storage-secret-toggle="${e(field.key)}" aria-label="${e(revealed ? t(view, 'Hide password', 'Απόκρυψη κωδικού') : t(view, 'Show password', 'Εμφάνιση κωδικού'))}"><i class="bi ${revealed ? 'bi-eye-slash' : 'bi-eye'}" aria-hidden="true"></i></button></div>`;
    }
    const secretConfigured = flow.configured(field)
      ? `<div class="small text-success"><i class="bi bi-lock-fill me-1" aria-hidden="true"></i>${e(t(view, 'Secret configured', 'Το μυστικό έχει οριστεί'))}</div>`
      : '';
    return `<div class="${e(field.columnClass ?? 'col-md-6')}" data-popup-layout-id="${e(fieldId)}">${label}${control}${secretConfigured}<div class="form-text">${tr(view, field.description)}</div></div>`;
  }
}

/** Shared feedback is presented by each independently owned main tab. */
export class StorageTabStatus {
  static layout(): UiPopupFeatureContentDefinition[] {
    return [
      { id: 'storage-tab-notices', kind: 'feature-content' },
      { id: 'storage-workflow-state', kind: 'feature-content' },
    ];
  }
  static render(view: StorageView, footer = false, tabId = ''): string {
    const workflow = view.workflow;
    const model = workflow.workflow;
    const step = workflow.stepById(tabId);
    const warning =
      step && workflow.stepNeedsCurrentVerification(step)
        ? e(
            t(
              view,
              'Saved settings are available for review, but current prerequisites must be verified before target operations.',
              'Οι αποθηκευμένες ρυθμίσεις μπορούν να ελεγχθούν, αλλά απαιτείται νέα επαλήθευση πριν από ενέργειες στον στόχο.',
            ),
          )
        : '';
    return renderNativeComponent(
      'StorageTabStatus',
      {},
      {
        Content: `${!footer && workflow.error ? `<div class="alert alert-danger" role="alert">${e(workflow.error)}</div>` : ''}
        ${!footer && workflow.notice ? `<div class="alert alert-success" role="status">${tr(view, workflow.notice)}</div>` : ''}
        ${!footer && warning ? `<div class="alert alert-warning small" role="status">${warning}</div>` : ''}
        ${footer ? `<p class="small text-secondary mt-3" data-popup-layout-id="storage-workflow-state">${e(t(view, 'Stage', 'Στάδιο'))}: ${tr(view, model.stage)} · ${e(t(view, 'Status', 'Κατάσταση'))}: ${tr(view, model.status)}</p>` : ''}`,
      },
    );
  }
}

export class StorageConnectionOperations {
  static render(view: StorageView): string {
    const flow = view.workflow;
    return renderNativeComponent(
      'StorageConnectionOperations',
      {},
      {
        Content: flow.adapter?.targetWorkflow?.connectionTest
          ? `<h3 class="h6">${e(t(view, 'Connection verification', 'Έλεγχος σύνδεσης'))}</h3>${button(view, 'test-connection', 'Test connection', 'Έλεγχος σύνδεσης')} <span class="small ms-2">${tr(view, flow.connectionState)}</span>`
          : '',
      },
    );
  }
}
export class StorageDatabaseOperations {
  static render(view: StorageView): string {
    const flow = view.workflow;
    const field = flow.databaseField;
    const locked = flow.readOnly || flow.busy;
    const mode = flow.databaseMode;
    const choice = field
      ? `<fieldset data-popup-layout-id="storage-setting-${e(flow.draft.adapterId)}-${e(field.key)}" ${locked ? 'disabled' : ''}>
        <legend class="form-label fw-semibold fs-6">${tr(view, field.label)}</legend>
        <div class="d-flex flex-wrap gap-3 mb-2">
          <label><input type="radio" name="storage-database-mode" data-storage-database-mode="existing" ${mode === 'existing' ? 'checked' : ''}> ${e(t(view, 'Existing database', 'Υπάρχουσα βάση'))}</label>
          <label><input type="radio" name="storage-database-mode" data-storage-database-mode="new" ${mode === 'new' ? 'checked' : ''}> ${e(t(view, 'New database', 'Νέα βάση'))}</label>
        </div>${
          mode === 'existing'
            ? `<select class="form-select" data-storage-existing-database><option value="">${e(t(view, 'Select a database', 'Επιλέξτε βάση'))}</option>${flow.value(field) && !flow.databases.includes(flow.value(field)) ? `<option value="${e(flow.value(field))}" disabled selected>${e(flow.value(field))} (${e(t(view, 'Refresh to verify', 'Ανανέωση για έλεγχο'))})</option>` : ''}${flow.databases.map((database) => `<option value="${e(database)}" ${database === flow.value(field) ? 'selected' : ''}>${e(database)}</option>`).join('')}</select>`
            : `<input class="form-control" type="text" data-storage-field="${e(field.key)}" value="${e(flow.value(field))}" placeholder="${e(field.suggestedValue ?? '')}">`
        }
        <div class="form-text">${tr(view, field.description)}</div>
        </fieldset>`
      : '';
    const actions = `<div class="d-flex flex-wrap gap-2 mt-3 mb-2">${flow.adapter?.targetWorkflow?.databaseDiscovery ? button(view, 'databases', 'Discover databases', 'Αναζήτηση βάσεων') : ''}${button(view, 'database/inspect', 'Inspect database', 'Έλεγχος βάσης')}${flow.adapter?.targetWorkflow?.databasePreparation ? button(view, 'database/prepare', 'Create / prepare database', 'Δημιουργία / προετοιμασία βάσης') : ''}</div>`;
    return renderNativeComponent(
      'StorageDatabaseOperations',
      {},
      {
        Content: `<h3 class="h6">${e(t(view, 'Target database', 'Βάση δεδομένων'))}</h3>${choice}${actions}<p class="small text-secondary">${e(t(view, 'Readiness', 'Ετοιμότητα'))}: ${tr(view, flow.databaseState)}</p>`,
      },
    );
  }
}
export class StorageSchemaOperations {
  static render(view: StorageView): string {
    const flow = view.workflow;
    return renderNativeComponent(
      'StorageSchemaOperations',
      {},
      {
        Content: flow.adapter?.targetWorkflow?.schemaPreparation
          ? `<h3 class="h6">${e(t(view, 'ManatOS schema', 'Σχήμα ManatOS'))}</h3><div class="d-flex flex-wrap gap-2">${button(view, 'schema/inspect', 'Inspect schema', 'Έλεγχος σχήματος')}${button(view, 'schema/prepare', 'Apply required changes', 'Εφαρμογή αλλαγών')}</div><div class="small text-secondary mt-2">${tr(view, flow.schemaState)}</div>${flow.schemaChanges.length ? `<ul class="small">${flow.schemaChanges.map((change) => `<li>${e(change)}</li>`).join('')}</ul>` : ''}`
          : '',
      },
    );
  }
}
export class StorageCapabilities {
  static layout(): UiPopupFeatureContentDefinition[] {
    return [
      {
        id: 'storage-capabilities-body',
        kind: 'feature-content',
        children: [
          { id: 'storage-capabilities-categories', kind: 'feature-content' },
          { id: 'storage-capabilities-table', kind: 'feature-content' },
        ],
      },
    ];
  }
  static render(view: StorageView): string {
    const flow = view.workflow;
    const categories = flow.capabilityGroups
      .map(
        (group) =>
          `<button type="button" class="btn btn-sm ${group.name === flow.activeCapabilityCategory ? 'btn-primary' : 'btn-outline-secondary'}" data-storage-capability-category="${e(group.name)}">${tr(view, group.name)}</button>`,
      )
      .join('');
    const table = `<div class="table-responsive" data-popup-layout-id="storage-capabilities-table"><table class="table table-sm"><thead><tr><th>${e(t(view, 'Capability', 'Δυνατότητα'))}</th><th>${e(t(view, 'Native support', 'Εγγενής υποστήριξη'))}</th><th>${e(t(view, 'Inherited / defined by', 'Κληρονομείται / ορίζεται από'))}</th></tr></thead><tbody>${flow.selectedCapabilities.map((item) => `<tr><td><strong>${tr(view, item.label)}</strong><div class="text-secondary small">${tr(view, item.description)}</div></td><td><span class="badge ${item.supported ? 'text-bg-success' : 'text-bg-secondary'}">${item.supported ? e(t(view, 'Supported', 'Υποστηρίζεται')) : e(t(view, 'Not native', 'Όχι εγγενώς'))}</span></td><td>${tr(view, item.sourceName || item.sourceId)}</td></tr>`).join('')}</tbody></table></div>`;
    return renderNativeComponent(
      'StorageCapabilities',
      {},
      {
        Content: `<div class="d-flex gap-2 flex-wrap mb-3" data-popup-layout-id="storage-capabilities-categories">${categories}</div>${table}`,
      },
    );
  }
}
