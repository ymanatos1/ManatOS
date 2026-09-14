import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const page = readFileSync(
  new URL('../../views/pages/system-settings.ejs', import.meta.url),
  'utf8',
);
const runtime = readFileSync(
  new URL('../../public/js/system-settings.js', import.meta.url),
  'utf8',
);

describe('system settings storage presentation', () => {
  it('uses a compact gated target workflow and keeps connection testing inside the connection tab', () => {
    expect(page).toContain('data-storage-step="configuration"');
    expect(page).toContain('storage-configuration-tabs');
    expect(page).not.toContain('data-storage-test-connection');
    expect(runtime).toContain('tab.requiresConnection === true');
    expect(runtime).toContain('tab.requiresDatabase === true');
    expect(runtime).toContain('tab.retainWhenConfiguredBy');
    expect(runtime).toContain('data-storage-stage-warning');
    expect(runtime).toContain('stageProjection');
    expect(runtime).toContain('workflowSummary');
    expect(runtime).toContain('restorePersistedWorkflow');
    expect(page).toContain('data-storage-workflow-stage');
    expect(page).toContain('data-storage-workflow-status');
    expect(runtime).toContain('data-storage-test-connection');
    expect(runtime).toContain('addConnectionTest(panel, adapter)');
    expect(runtime).toContain('enhanceSchemaPanel(panel)');
    expect(runtime).toContain('enhanceDataPanel(panel)');
    expect(runtime).toContain('tab.requiresSchema === true');
    expect(runtime).toContain('Use an existing database');
    expect(runtime).toContain('Create a new database');
    expect(runtime).not.toContain('Check database');
    expect(runtime).toContain("originalWrap.dataset.storageWorkflowHidden = 'true'");
  });

  it('keeps connection and database stage outcomes independent and autofocuses active stages', () => {
    expect(runtime).not.toContain('await databaseController?.refresh?.()');
    expect(runtime).toContain('Continue with the ${nextStage.label} stage.');
    expect(runtime).toContain('focusFirstEditable');
    expect(runtime).toContain('beginStageOperation');
    expect(runtime).toContain('stageOperationIsCurrent');
    expect(runtime).toContain('setStageFeedback');
    expect(runtime).toContain('status.targetLabel');
    expect(runtime).toContain("fieldDefinition?.suggestedValue || 'ManatOS_DB'");
    expect(runtime).toContain('refreshDatabases({ selectDatabase: createdDatabase })');
    expect(runtime).toContain("showMode('existing')");
    expect(runtime).toContain("showMode('new')");
    expect(runtime).toContain('newName.value = configuredDatabase || suggestedDatabaseName');
    expect(runtime).toContain('(saved configuration; refresh to revalidate)');
    expect(runtime).toContain('settings.database remains empty');
    expect(runtime).toContain('Configured database');
    expect(runtime).toContain('was not found on this server');
    expect(runtime).toContain('was reported as created but was not returned');
    expect(runtime).not.toContain('(configured; connection not verified)');
    expect(runtime).toContain('data-storage-tab-status-icon');
    expect(runtime).toContain('bi-check-circle-fill');
    expect(runtime).toContain('bi-exclamation-triangle-fill');
    expect(runtime).toContain('bi-lock-fill');
    expect(runtime).toContain(
      "localeCompare(selectDatabase, undefined, { sensitivity: 'accent' })",
    );
  });

  it('renders adapter branding and persisted configuration ordering controls', () => {
    expect(page).toContain("draggable=\"<%= inspectionOnly ? 'false' : 'true' %>\"");
    expect(page).toContain('bi-grip-vertical');
    expect(page).toContain('storage-configuration-drag-handle');
    expect(page).toContain('<th>Status</th><th>Stage</th>');
    expect(page).toContain('<div class="col-12">');
    expect(page).not.toContain('col-xxl-6');
    expect(runtime).toContain('dragstart');
    expect(runtime).toContain('dragover');
    expect(runtime).toContain('dragend');
    expect(page).toContain('data-storage-adapter-picker-menu');
    expect(runtime).toContain('adapter.familyPath.join');
    expect(runtime).toContain('adapter.logoUrl');
    expect(runtime).toContain('/system-settings/storage/configurations/order');
    expect(page).toContain('data-storage-delete');
    expect(runtime).toContain('/delete`');
    expect(page).not.toContain('if (!eligible) continue');
    expect(page).toContain('data-storage-current-picker-menu');
    expect(page).toContain('data-storage-current-option');
    expect(runtime).toContain('renderCurrentStoragePicker');
    expect(runtime).toContain('button.disabled = !storageConfigurationSelectable(configuration)');
    expect(runtime).toContain('renderCurrentPickerContent');
    expect(runtime).not.toContain('storageConfigurationOptionLabel');
    expect(page).toContain("statusLabels[item.status] || 'Unknown'");
    expect(page).toContain("stageLabels[item.stage] || 'Unknown'");
    expect(page).toContain('<strong class="text-truncate"><%= item.name %></strong>');
    expect(page).toContain("adapter?.logoUrl || '/images/storage-adapters/json.svg'");
  });

  it('renders effective inherited storage capabilities as a readonly adapter tab', () => {
    expect(runtime).toContain('renderCapabilitiesTab(adapter)');
    expect(runtime).toContain("label.textContent = 'Capabilities'");
    expect(runtime).toContain("panel.dataset.storageCapabilities = ''");
    expect(runtime).toContain('capability.supported');
    expect(runtime).toContain('capability.sourceName');
    expect(runtime).toContain('storage-capability-category-tabs');
    expect(runtime).toContain('storage-capability-table-scroll');
    expect(runtime).toContain('data-storage-capability-category-panel');
    expect(runtime).toContain(
      'Effective native capabilities resolved from the adapter family hierarchy.',
    );
  });

  it('exposes persisted API storage CTX debugging settings without coupling them to one adapter', () => {
    expect(page).toContain('data-storage-debugging-form');
    expect(page).toContain('data-storage-debug-enabled');
    expect(page).toContain('data-storage-debug-directory');
    expect(page).toContain('../data/logs/api/');
    expect(runtime).toContain("'/system-settings/storage/debugging'");
    expect(runtime).toContain('apiStorageContextEnabled: debugEnabled.checked');
    expect(runtime).toContain('outputDirectory: directory');
  });

  it('posts the body CSRF token expected by the UI route and exposes only sanitized workflow state to popup CTX', () => {
    expect(runtime).toContain('_csrf: currentCsrf()');
    expect(runtime).not.toContain("'x-csrf-token'");
    expect(runtime).toContain("'X-ManatOS-Application-Command': '1'");
    expect(runtime).toContain("payload?.error?.code === 'UI_API_SESSION_EXPIRED'");
    expect(runtime).toContain('window.ManatOS?.reauthenticate?.({');
    expect(runtime).toContain('popupProjection');
    expect(runtime).toContain("placement: 'surface'");
    expect(runtime).toContain('changedFields: changedFieldKeys()');
    expect(runtime).not.toContain('settings: collectSettings(),\n      connection:');
  });

  it('marks required and changed fields and provides normal editor action semantics', () => {
    expect(runtime).toContain("required ? ' (*)' : ''");
    expect(runtime).toContain('storage-field-changed');
    expect(runtime).toContain('field.requiredWhen');
    expect(runtime).toContain("input.type = showing ? 'password' : 'text'");
    expect(runtime).toContain(
      "saveLabel.textContent = inspectionOnly ? 'Read only' : editing ? 'Update' : 'Create'",
    );
    expect(runtime).toContain(
      "dismissLabel.textContent = inspectionOnly || editing ? 'Close' : 'Cancel'",
    );
    expect(runtime).not.toContain("connectionState === 'verified' && databaseState === 'ready'");
    expect(runtime).toContain(
      'saveButton.disabled = inspectionOnly || !minimumValid || !editorDirty()',
    );
    expect(runtime).not.toContain('if (!form.checkValidity())');
    expect(runtime).toContain('promoteSavedBaseline');
    expect(runtime).toContain("prefix.textContent = 'Configure storage:'");
    expect(runtime).toContain('data-storage-modal-adapter-logo');
    expect(runtime).toContain('presentFailure');
    expect(runtime).toContain('duplicateName');
    expect(page).toContain('data-storage-configuration-form novalidate');
    expect(page).toContain('data-storage-save disabled');
    expect(page).toContain('data-storage-dismiss-label');
  });

  it('supports explicit Superuser inspection mode without exposing mutation controls', () => {
    expect(page).toContain('data-storage-read-only');
    expect(page).toContain('Inspection mode.');
    expect(page).toContain("inspectionOnly ? 'Inspect' : 'Configure'");
    expect(runtime).toContain("const inspectionOnly = root.dataset.storageReadOnly === 'true'");
    expect(runtime).toContain('row.draggable = !inspectionOnly');
    expect(runtime).toContain('if (inspectionOnly) {');
  });
});
