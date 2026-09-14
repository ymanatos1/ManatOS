(() => {
  'use strict';

  const root = document.querySelector('[data-system-settings]');
  if (!(root instanceof HTMLElement)) return;

  const inspectionOnly = root.dataset.storageReadOnly === 'true';

  const currentCsrf = () =>
    root.closest('main')?.querySelector('input[name="_csrf"]')?.value ||
    document.querySelector('input[name="_csrf"]')?.value ||
    '';

  let model;
  try {
    model = JSON.parse(root.dataset.storageSettings || '{}');
  } catch {
    return;
  }

  const configurations = Array.isArray(model.configurations) ? model.configurations : [];
  const adapters = Array.isArray(model.adapters) ? model.adapters : [];
  const currentPickerButton = root.querySelector('[data-storage-current-picker-button]');
  const currentPickerMenu = root.querySelector('[data-storage-current-picker-menu]');
  const currentValue = root.querySelector('[data-storage-current-value]');
  const debuggingForm = root.querySelector('[data-storage-debugging-form]');
  const debugEnabled = root.querySelector('[data-storage-debug-enabled]');
  const debugDirectory = root.querySelector('[data-storage-debug-directory]');
  const debugResult = root.querySelector('[data-storage-debug-result]');
  const modalElement = document.getElementById('storageConfigurationModal');
  if (!(modalElement instanceof HTMLElement) || !window.bootstrap?.Modal) return;

  const modal = window.bootstrap.Modal.getOrCreateInstance(modalElement);
  const form = modalElement.querySelector('[data-storage-configuration-form]');
  const adapterSelect = modalElement.querySelector('[data-storage-adapter]');
  const adapterPicker = modalElement.querySelector('[data-storage-adapter-picker]');
  const adapterPickerButton = modalElement.querySelector('[data-storage-adapter-picker-button]');
  const adapterPickerMenu = modalElement.querySelector('[data-storage-adapter-picker-menu]');
  const nameInput = modalElement.querySelector('[data-storage-configuration-name]');
  const nameLabel = modalElement.querySelector('[data-storage-configuration-name-label]');
  const nameFeedback = modalElement.querySelector('[data-storage-name-feedback]');
  const adapterLabel = modalElement.querySelector('[data-storage-adapter-label]');
  const saveButton = modalElement.querySelector('[data-storage-save]');
  const saveLabel = modalElement.querySelector('[data-storage-save-label]');
  const dismissButton = modalElement.querySelector('[data-storage-dismiss]');
  const dismissLabel = modalElement.querySelector('[data-storage-dismiss-label]');
  const description = modalElement.querySelector('[data-storage-adapter-description]');
  const tabsHost = modalElement.querySelector('[data-storage-tabs]');
  const configurationPanel = modalElement.querySelector('[data-storage-panel="configuration"]');
  const configurationFields = modalElement.querySelector('[data-storage-configuration-fields]');
  const panelsHost = modalElement.querySelector('[data-storage-adapter-panels]');
  const errorBox = modalElement.querySelector('[data-storage-error]');
  const operationResult = modalElement.querySelector('[data-storage-operation-result]');
  const workflowStageSelect = modalElement.querySelector('[data-storage-workflow-stage]');
  const workflowStatusSelect = modalElement.querySelector('[data-storage-workflow-status]');
  const deleteModalElement = document.getElementById('storageConfigurationDeleteModal');
  const deleteModal =
    deleteModalElement instanceof HTMLElement
      ? window.bootstrap.Modal.getOrCreateInstance(deleteModalElement)
      : null;
  const deleteName = deleteModalElement?.querySelector('[data-storage-delete-name]');
  const deleteConfirm = deleteModalElement?.querySelector('[data-storage-delete-confirm]');
  let deleteCandidateId = '';

  if (
    !(form instanceof HTMLFormElement) ||
    !(adapterSelect instanceof HTMLSelectElement) ||
    !(adapterPicker instanceof HTMLElement) ||
    !(adapterPickerButton instanceof HTMLButtonElement) ||
    !(adapterPickerMenu instanceof HTMLElement) ||
    !(nameInput instanceof HTMLInputElement) ||
    !(nameLabel instanceof HTMLElement) ||
    !(nameFeedback instanceof HTMLElement) ||
    !(adapterLabel instanceof HTMLElement) ||
    !(saveButton instanceof HTMLButtonElement) ||
    !(saveLabel instanceof HTMLElement) ||
    !(dismissButton instanceof HTMLButtonElement) ||
    !(dismissLabel instanceof HTMLElement) ||
    !(tabsHost instanceof HTMLElement) ||
    !(configurationPanel instanceof HTMLElement) ||
    !(configurationFields instanceof HTMLElement) ||
    !(panelsHost instanceof HTMLElement) ||
    !(errorBox instanceof HTMLElement) ||
    !(operationResult instanceof HTMLElement) ||
    !(workflowStageSelect instanceof HTMLSelectElement) ||
    !(workflowStatusSelect instanceof HTMLSelectElement)
  )
    return;

  let editing = null;
  let configuredSecretKeys = [];
  let initialValues = new Map();
  let activeStep = 'configuration';
  let connectionState = 'idle';
  let databaseState = 'idle';
  let schemaState = 'idle';
  let connectionDetails = null;
  let schemaDetails = null;
  let databaseController = null;
  let schemaController = null;
  let initialAdapterId = '';
  let initialWorkflow = { stage: '', status: '' };
  let databaseDiscoveredThisSession = false;
  let databaseExists = null;
  let editorGeneration = 0;
  const stageRequests = { connection: 0, database: 0, schema: 0 };

  const beginStageOperation = (stage) => ({
    generation: editorGeneration,
    stage,
    request: ++stageRequests[stage],
  });
  const stageOperationIsCurrent = (token) =>
    token?.generation === editorGeneration && stageRequests[token.stage] === token.request;
  const invalidateStageOperations = (...stages) => {
    for (const stage of stages) stageRequests[stage] += 1;
  };

  const adapterFor = (id) => adapters.find((entry) => entry.id === id) || null;

  const stageLabels = {
    configuration: 'Configuration',
    connection: 'Connection',
    database: 'Database',
    schema: 'Schema',
    data: 'Data',
    complete: 'Complete',
  };

  const statusLabels = {
    incomplete: 'Incomplete',
    ready: 'Ready',
    error: 'Error',
  };

  const selectedConfigurationId = () =>
    model.selectedConfigurationId || model.currentConfigurationId || '';
  const runningConfigurationId = () =>
    model.runningConfigurationId || model.currentConfigurationId || '';

  const duplicateName = () => {
    const normalized = nameInput.value.trim().toLocaleLowerCase();
    if (!normalized) return null;
    return (
      configurations.find(
        (entry) => entry.id !== editing?.id && entry.name.trim().toLocaleLowerCase() === normalized,
      ) || null
    );
  };

  const editorDirty = () => {
    if (nameInput.value !== (initialValues.get('name') ?? '')) return true;
    if (adapterSelect.value !== initialAdapterId) return true;
    if (changedFieldKeys().length > 0) return true;
    const workflow = workflowSummary();
    return workflow.stage !== initialWorkflow.stage || workflow.status !== initialWorkflow.status;
  };

  const refreshPrimaryAction = () => {
    const duplicate = duplicateName();
    nameInput.setCustomValidity(duplicate ? 'Storage configuration name is already in use.' : '');
    nameFeedback.textContent = duplicate
      ? 'A storage configuration with this name already exists.'
      : '';
    nameInput.classList.toggle('is-invalid', Boolean(duplicate));
    const minimumValid = Boolean(nameInput.value.trim() && adapterSelect.value && !duplicate);
    // Saving a storage configuration is intentionally independent from target
    // verification. Admins may persist an incomplete/offline target and validate
    // or prepare it later; activation remains a separate, explicit operation.
    saveButton.disabled = inspectionOnly || !minimumValid || !editorDirty();
    saveLabel.textContent = inspectionOnly ? 'Read only' : editing ? 'Update' : 'Create';
    dismissLabel.textContent = inspectionOnly || editing ? 'Close' : 'Cancel';
    const adapterChanged = adapterSelect.value !== initialAdapterId;
    adapterLabel.classList.toggle('fw-bold', adapterChanged);
    adapterLabel.classList.toggle('fw-semibold', !adapterChanged);
  };

  const setResult = (message = '', tone = 'info') => {
    operationResult.textContent = message;
    operationResult.className = `alert alert-${tone} mt-3 mb-0`;
    operationResult.classList.toggle('d-none', !message);
  };

  const setError = (message = '') => {
    errorBox.textContent = message;
    errorBox.classList.toggle('d-none', !message);
  };

  const stageFeedbackNode = (stage) => {
    const panel = tabPanel(stage);
    if (!(panel instanceof HTMLElement)) return null;
    let node = panel.querySelector('[data-storage-stage-feedback]');
    if (node instanceof HTMLElement) return node;
    node = document.createElement('div');
    node.dataset.storageStageFeedback = '';
    node.className = 'alert d-none mt-3 mb-0';
    panel.appendChild(node);
    return node;
  };

  const setStageFeedback = (stage, message = '', tone = 'info') => {
    const node = stageFeedbackNode(stage);
    if (!(node instanceof HTMLElement)) return;
    node.textContent = message;
    node.className = `alert alert-${tone} mt-3 mb-0`;
    node.classList.toggle('d-none', !message);
  };

  const clearStageFeedback = (...stages) => {
    for (const stage of stages) setStageFeedback(stage);
  };

  const presentFailure = (
    error,
    fallback = 'The operation could not be completed.',
    { popup = false } = {},
  ) => {
    const message = error instanceof Error ? error.message : String(error || fallback);
    setError(message || fallback);
    // The editor already owns a prominent inline error surface. Do not stack a
    // second modal with the same message; reserve the global error popup for
    // failures that have no local surface or genuinely need additional context.
    if (popup) {
      window.ManatOS?.errors?.present?.({
        name: 'StorageConfigurationError',
        code: 'STORAGE_CONFIGURATION_OPERATION_FAILED',
        message: message || fallback,
        userMessage: message || fallback,
        retryable: false,
        operationTrace: [],
      });
    }
  };

  const controlValue = (input) =>
    input instanceof HTMLInputElement && input.type === 'checkbox'
      ? String(input.checked)
      : input.value;

  const collectSettings = () => {
    const settings = {};
    modalElement.querySelectorAll('[name^="setting."]').forEach((input) => {
      settings[input.name.slice('setting.'.length)] = controlValue(input);
    });
    return settings;
  };

  const changedFieldKeys = () =>
    [...modalElement.querySelectorAll('[data-storage-field-key]')]
      .filter(
        (node) => node instanceof HTMLElement && node.classList.contains('storage-field-changed'),
      )
      .map((node) => node.dataset.storageFieldKey)
      .filter(Boolean);

  const stageSettingsDirty = (stage) =>
    [...modalElement.querySelectorAll('[data-storage-field-key].storage-field-changed')].some(
      (wrap) => wrap.querySelector('[name^="setting."]')?.dataset.storageTab === stage,
    );

  const minimumConfigurationReady = () =>
    Boolean(nameInput.value.trim() && adapterSelect.value && !duplicateName());

  const tabConfiguredBy = (button) => {
    if (!(button instanceof HTMLButtonElement)) return false;
    const keys = String(button.dataset.retainWhenConfiguredBy || '')
      .split('|')
      .map((key) => key.trim())
      .filter(Boolean);
    if (!keys.length) return false;
    const settings = collectSettings();
    return keys.some((key) => String(settings[key] || '').trim());
  };

  const stageProjection = () => {
    const settings = collectSettings();
    const connectionConfigured = [
      ...modalElement.querySelectorAll('[data-storage-panel="connection"] [name^="setting."]'),
    ].some((input) => String(controlValue(input) || '').trim());
    const databaseConfigured = Boolean(String(settings.database || '').trim());
    return {
      configuration: { status: minimumConfigurationReady() ? 'ready' : 'incomplete' },
      connection: {
        status:
          connectionState === 'verified'
            ? 'ready'
            : connectionState === 'failed'
              ? 'error'
              : connectionConfigured
                ? 'configured'
                : 'incomplete',
      },
      database: {
        status:
          databaseState === 'ready'
            ? 'ready'
            : databaseState === 'error'
              ? 'error'
              : databaseConfigured
                ? 'configured'
                : connectionState === 'verified'
                  ? 'available'
                  : 'locked',
      },
      schema: {
        status:
          schemaState === 'ready'
            ? 'ready'
            : schemaState === 'changes-required'
              ? 'changes-required'
              : databaseConfigured
                ? 'configured'
                : databaseState === 'ready'
                  ? 'available'
                  : 'locked',
      },
      data: { status: schemaState === 'ready' ? 'available' : 'locked' },
    };
  };

  const adapterConfigurationComplete = () => {
    if (!minimumConfigurationReady()) return false;
    return [...modalElement.querySelectorAll('[data-storage-field-key]')].every((wrap) => {
      if (!(wrap instanceof HTMLElement) || wrap.classList.contains('d-none')) return true;
      const input = wrap.querySelector('[name^="setting."]');
      if (!input || typeof input.checkValidity !== 'function') return true;
      return input.checkValidity();
    });
  };

  const workflowSummary = () => {
    if (!adapterConfigurationComplete()) return { stage: 'configuration', status: 'incomplete' };
    const adapter = adapterFor(adapterSelect.value);
    const workflow = adapter?.targetWorkflow || {};
    if (workflow.connectionTest === true && connectionState !== 'verified') {
      return {
        stage: 'connection',
        status: connectionState === 'failed' ? 'error' : 'incomplete',
      };
    }
    if (
      (workflow.databaseDiscovery === true || workflow.databasePreparation === true) &&
      databaseState !== 'ready'
    ) {
      return {
        stage: 'database',
        status: databaseState === 'error' ? 'error' : 'incomplete',
      };
    }
    if (workflow.schemaPreparation === true && schemaState !== 'ready') {
      return {
        stage: 'schema',
        status: schemaState === 'error' ? 'error' : 'incomplete',
      };
    }
    return { stage: 'complete', status: 'ready' };
  };

  const syncWorkflowSummaryControlsFromCtx = () => {
    const popupPath = window.ManatOS?.popup?.runtime?.popupPath?.();
    const ctx = window.ManatOS?.ctx;
    if (!popupPath || !ctx?.get) return false;
    const basePath = `${popupPath}.storageConfiguration`;
    const stage = ctx.get(`${basePath}.stage`);
    const status = ctx.get(`${basePath}.status`);
    if (typeof stage !== 'string' || typeof status !== 'string') return false;
    workflowStageSelect.value = stage;
    workflowStatusSelect.value = status;
    return true;
  };

  const popupProjection = () => ({
    storageConfiguration: {
      mode: editing ? 'configure' : 'add',
      configurationId: editing?.id || null,
      name: nameInput.value,
      adapterId: adapterSelect.value || null,
      activeStep,
      stage: workflowSummary().stage,
      status: workflowSummary().status,
      changedFields: changedFieldKeys(),
      stages: stageProjection(),
      connection: {
        status: connectionState,
        ...(connectionDetails?.targetLabel ? { targetLabel: connectionDetails.targetLabel } : {}),
        ...(connectionDetails?.serverLabel ? { serverLabel: connectionDetails.serverLabel } : {}),
        ...(connectionDetails?.engineVersion
          ? { engineVersion: connectionDetails.engineVersion }
          : {}),
      },
      database: {
        status: databaseState,
        configuredName: String(collectSettings().database || ''),
        validationSource: databaseDiscoveredThisSession
          ? 'current-session'
          : databaseState === 'ready'
            ? 'persisted'
            : 'unverified',
        discoveredThisSession: databaseDiscoveredThisSession,
        exists: databaseExists,
      },
      schema: {
        status: schemaState,
        ...(typeof schemaDetails?.changes?.length === 'number'
          ? { pendingChanges: schemaDetails.changes.length }
          : {}),
      },
    },
  });

  const syncPopupCtx = () => {
    const projection = popupProjection();
    refreshPrimaryAction();
    window.ManatOS?.popup?.runtime?.replaceContext?.(projection, {
      placement: 'surface',
      source: 'system-settings-storage',
      action: 'storage-configuration-state',
    });
    // These readonly controls are CTX consumers, not an independent state
    // source. The fallback is used only before the popup surface exists.
    if (!syncWorkflowSummaryControlsFromCtx()) {
      workflowStageSelect.value = projection.storageConfiguration.stage;
      workflowStatusSelect.value = projection.storageConfiguration.status;
    }
  };

  window.addEventListener(window.ManatOS?.ctx?.eventName || 'manatos:ctx-change', () => {
    syncWorkflowSummaryControlsFromCtx();
  });

  const targetPayload = (extra = {}) => ({
    _csrf: currentCsrf(),
    configurationId: editing?.id || undefined,
    adapterId: adapterSelect.value,
    settings: collectSettings(),
    ...extra,
  });

  const errorMessage = async (response) => {
    const contentType = response.headers.get('content-type') || '';
    try {
      if (contentType.includes('application/json')) {
        const payload = await response.json();
        return (
          payload?.error?.userMessage ||
          payload?.error?.message ||
          payload?.errorMessage ||
          payload?.message ||
          `Request failed with HTTP ${response.status}.`
        );
      }
      const text = (await response.text()).trim();
      if (text && !text.startsWith('<!doctype') && !text.startsWith('<html')) return text;
    } catch {
      // Fall through to the stable HTTP diagnostic below.
    }
    return `Request failed with HTTP ${response.status}.`;
  };

  const sendStorageCommand = async (url, payloadFactory, operation = 'storage operation') => {
    const send = async () => {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'content-type': 'application/json',
          'X-ManatOS-Application-Command': '1',
        },
        body: JSON.stringify(payloadFactory()),
      });
      const contentType = response.headers.get('content-type') || '';
      const payload = contentType.includes('application/json')
        ? await response.json().catch(() => null)
        : null;
      return { response, payload };
    };

    let result = await send();
    if (
      result.response.status === 401 &&
      (!result.payload || result.payload?.error?.code === 'UI_API_SESSION_EXPIRED')
    ) {
      const reauthenticated = await window.ManatOS?.reauthenticate?.({
        reason: 'session-expired',
        operation,
      });
      if (!reauthenticated) return null;
      result = await send();
    }
    if (!result.response.ok || !result.payload?.success) {
      if (result.payload) {
        window.ManatOS?.errors?.fromResponse?.(result.response, result.payload);
        const failure = new Error(
          result.payload?.error?.userMessage ||
            result.payload?.error?.message ||
            result.payload?.message ||
            `Request failed with HTTP ${result.response.status}.`,
        );
        failure.manatosPresented = true;
        throw failure;
      }
      throw new Error(await errorMessage(result.response));
    }
    return result.payload;
  };

  const postTarget = (operation, payload = {}) =>
    sendStorageCommand(
      `/system-settings/storage/target/${operation}`,
      () => targetPayload(payload),
      operation,
    );

  const tabButton = (id) => tabsHost.querySelector(`[data-storage-step="${CSS.escape(id)}"]`);
  const tabPanel = (id) => modalElement.querySelector(`[data-storage-panel="${CSS.escape(id)}"]`);

  const tabPrerequisiteReady = (button) => {
    if (!(button instanceof HTMLButtonElement)) return false;
    if (button.dataset.requiresConnection === 'true' && connectionState !== 'verified')
      return false;
    if (button.dataset.requiresDatabase === 'true' && databaseState !== 'ready') return false;
    if (button.dataset.requiresSchema === 'true' && schemaState !== 'ready') return false;
    return true;
  };

  const tabVisible = (button) =>
    tabPrerequisiteReady(button) ||
    tabConfiguredBy(button) ||
    (button instanceof HTMLButtonElement &&
      button.dataset.requiresConnection !== 'true' &&
      button.dataset.requiresDatabase !== 'true');

  const stageWarningMessage = (button) => {
    if (!(button instanceof HTMLButtonElement) || tabPrerequisiteReady(button)) return '';
    if (button.dataset.requiresConnection === 'true') {
      return 'Connection is not currently verified. Existing database settings remain available to review or edit, but database discovery/creation is unavailable until Connection is verified again.';
    }
    if (button.dataset.requiresDatabase === 'true') {
      return 'The configured database is not currently verified as ready. Schema settings remain visible, but schema inspection/preparation is unavailable until the Database stage is ready again.';
    }
    if (button.dataset.requiresSchema === 'true') {
      return 'The current schema is not verified as ready. Data tools remain visible for review, but data checks and migration operations stay unavailable until the Schema stage is ready.';
    }
    return '';
  };

  const refreshStageWarning = (button) => {
    if (!(button instanceof HTMLButtonElement)) return;
    const panel = tabPanel(button.dataset.storageStep || '');
    const warning = panel?.querySelector('[data-storage-stage-warning]');
    if (!(warning instanceof HTMLElement)) return;
    const message = stageWarningMessage(button);
    warning.textContent = message;
    warning.classList.toggle('d-none', !message);
    const configuredButBlocked = Boolean(message && tabConfiguredBy(button));
    const step = button.dataset.storageStep || '';
    const prerequisiteReady = tabPrerequisiteReady(button);
    const ready =
      step === 'connection'
        ? connectionState === 'verified'
        : step === 'database'
          ? databaseState === 'ready'
          : step === 'schema'
            ? schemaState === 'ready'
            : false;
    const locked = !prerequisiteReady && !configuredButBlocked;
    const icon = button.querySelector('[data-storage-tab-status-icon]');
    if (icon instanceof HTMLElement) {
      icon.className = 'me-1';
      icon.classList.toggle(
        'd-none',
        step === 'configuration' || (!ready && !configuredButBlocked && !locked),
      );
      icon.classList.toggle('bi', step !== 'configuration');
      icon.classList.toggle('bi-check-circle-fill', ready);
      icon.classList.toggle('text-success', ready);
      icon.classList.toggle('bi-exclamation-triangle-fill', configuredButBlocked);
      icon.classList.toggle('text-warning', configuredButBlocked);
      icon.classList.toggle('bi-lock-fill', locked);
      icon.classList.toggle('text-secondary', locked);
      icon.title = ready
        ? 'Stage verified and ready.'
        : configuredButBlocked
          ? 'Configured, but its prerequisite stage is not currently verified.'
          : locked
            ? 'Complete the prerequisite stage first.'
            : '';
    }
  };

  const refreshTabAvailability = () => {
    modalElement.querySelectorAll('[data-storage-step]').forEach((button) => {
      if (!(button instanceof HTMLButtonElement)) return;
      const usable = tabVisible(button);
      // Keep the universal stage sequence visible. A locked stage is dark gray;
      // persisted later-stage settings keep it editable with a warning.
      button.disabled = !usable;
      button.closest('li')?.classList.remove('d-none');
      refreshStageWarning(button);
    });
    databaseController?.setOperational?.(connectionState === 'verified');
    const schemaButton = tabButton('schema');
    schemaController?.setOperational?.(schemaButton ? tabPrerequisiteReady(schemaButton) : false);
    const activeButton = tabButton(activeStep);
    if (activeButton && !tabVisible(activeButton)) {
      const fallback =
        connectionState === 'verified' && tabVisible(tabButton('database'))
          ? 'database'
          : tabVisible(tabButton('connection'))
            ? 'connection'
            : 'configuration';
      showTab(fallback);
    }
  };

  const focusFirstEditable = (step = activeStep) => {
    const panel = tabPanel(step);
    if (!(panel instanceof HTMLElement)) return;
    const candidate = [...panel.querySelectorAll('input, select, textarea, button')].find(
      (element) =>
        element instanceof HTMLElement &&
        !element.hidden &&
        !element.closest('.d-none') &&
        !element.hasAttribute('disabled') &&
        !(element instanceof HTMLInputElement && element.type === 'hidden') &&
        !element.matches(
          '[data-storage-test-connection], [data-storage-refresh-databases], [data-storage-create-database], [data-storage-inspect-schema], [data-storage-prepare-schema]',
        ),
    );
    window.setTimeout(() => candidate?.focus?.(), 0);
  };

  const showTab = (value) => {
    const button = tabButton(value);
    if (button && !tabVisible(button)) return;
    activeStep = value;
    modalElement.dataset.storageActiveStep = value;
    modalElement
      .querySelectorAll('[data-storage-panel]')
      .forEach((panel) => panel.classList.toggle('d-none', panel.dataset.storagePanel !== value));
    modalElement.querySelectorAll('[data-storage-step]').forEach((entry) => {
      entry.classList.toggle('active', entry.dataset.storageStep === value);
      entry.setAttribute('aria-selected', String(entry.dataset.storageStep === value));
    });
    refreshTabAvailability();
    syncPopupCtx();
    focusFirstEditable(value);
  };

  const fieldRequired = (field) => {
    if (field.required === true) return true;
    const dependency = field.requiredWhen;
    if (!dependency?.key) return false;
    const source = modalElement.querySelector(
      `[name="setting.${CSS.escape(String(dependency.key))}"]`,
    );
    return source?.value === String(dependency.equals ?? '');
  };

  const updateFieldPresentation = (wrap, input, field) => {
    const visibility = field.visibleWhen;
    const visibilitySource = visibility?.key
      ? modalElement.querySelector(`[name="setting.${CSS.escape(String(visibility.key))}"]`)
      : null;
    const workflowHidden = wrap.dataset.storageWorkflowHidden === 'true';
    const visible =
      !workflowHidden &&
      (!visibility || visibilitySource?.value === String(visibility.equals ?? ''));
    wrap.classList.toggle('d-none', !visible);
    const required = visible && fieldRequired(field);
    const storedSecret = field.secret && configuredSecretKeys.includes(field.key) && !input.value;
    input.required = required && !storedSecret;
    const label = wrap.querySelector('label');
    if (label instanceof HTMLElement) {
      label.textContent = `${field.label}${required ? ' (*)' : ''}`;
      const changed = controlValue(input) !== (initialValues.get(input.name) ?? '');
      wrap.classList.toggle('storage-field-changed', changed);
      label.classList.toggle('fw-bold', changed);
      label.classList.toggle('fw-semibold', !changed);
    }
  };

  const refreshFieldPresentations = () => {
    modalElement.querySelectorAll('[data-storage-field-key]').forEach((wrap) => {
      const input = wrap.querySelector('[name^="setting."]');
      const field = wrap._storageFieldDefinition;
      if (input && field) updateFieldPresentation(wrap, input, field);
    });
    const nameChanged = nameInput.value !== (initialValues.get('name') ?? '');
    nameLabel.classList.toggle('fw-bold', nameChanged);
    nameLabel.classList.toggle('fw-semibold', !nameChanged);
    refreshPrimaryAction();
    syncPopupCtx();
  };

  const resetAfterConnectionChange = () => {
    invalidateStageOperations('connection', 'database', 'schema');
    connectionState = 'idle';
    databaseState = 'idle';
    schemaState = 'idle';
    connectionDetails = null;
    schemaDetails = null;
    databaseDiscoveredThisSession = false;
    databaseExists = null;
    databaseController?.reset?.();
    clearStageFeedback('connection', 'database', 'schema');
    refreshTabAvailability();
    syncPopupCtx();
  };

  const resetAfterDatabaseChange = () => {
    invalidateStageOperations('database', 'schema');
    databaseState = 'idle';
    schemaState = 'idle';
    schemaDetails = null;
    clearStageFeedback('database', 'schema');
    refreshTabAvailability();
    syncPopupCtx();
  };

  const makeField = (field, settings) => {
    const wrap = document.createElement('div');
    wrap.className = field.columnClass || 'col-12';
    wrap.dataset.storageFieldKey = field.key;
    wrap._storageFieldDefinition = field;

    const label = document.createElement('label');
    label.className = 'form-label fw-semibold';
    label.textContent = field.label;

    let input;
    if (field.type === 'select') {
      input = document.createElement('select');
      input.className = 'form-select';
      for (const choice of field.options || []) {
        const option = document.createElement('option');
        option.value = choice.value;
        option.textContent = choice.label;
        input.appendChild(option);
      }
      input.value = settings[field.key] ?? field.defaultValue ?? '';
    } else if (field.type === 'boolean' && field.presentation === 'checkbox') {
      input = document.createElement('input');
      input.type = 'checkbox';
      input.className = 'form-check-input';
      input.checked = String(settings[field.key] ?? field.defaultValue ?? 'false') === 'true';
      input.value = String(input.checked);
    } else if (field.type === 'boolean') {
      input = document.createElement('select');
      input.className = 'form-select';
      for (const [value, text] of [
        ['true', 'Yes'],
        ['false', 'No'],
      ]) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = text;
        input.appendChild(option);
      }
      input.value = settings[field.key] ?? field.defaultValue ?? 'false';
    } else {
      input = document.createElement('input');
      input.className = 'form-control';
      input.type =
        field.type === 'password' ? 'password' : field.type === 'number' ? 'number' : 'text';
      input.value = settings[field.key] ?? field.defaultValue ?? '';
      if (field.secret && configuredSecretKeys.includes(field.key)) {
        input.placeholder = 'Stored secret — leave blank to retain';
        input.autocomplete = 'new-password';
      }
    }

    input.name = `setting.${field.key}`;
    input.dataset.storageTab = field._tabId || '';
    initialValues.set(input.name, controlValue(input));

    let control = input;
    if (field.type === 'boolean' && field.presentation === 'checkbox') {
      const check = document.createElement('div');
      check.className = 'form-check mt-2';
      label.className = 'form-check-label fw-semibold';
      check.append(input, label);
      control = check;
    } else if (field.type === 'password' && input instanceof HTMLInputElement) {
      const group = document.createElement('div');
      group.className = 'input-group';
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'btn btn-outline-secondary';
      toggle.title = 'Show password';
      toggle.setAttribute('aria-label', 'Show password');
      toggle.innerHTML = '<i class="bi bi-eye"></i>';
      toggle.addEventListener('click', () => {
        const showing = input.type === 'text';
        input.type = showing ? 'password' : 'text';
        toggle.title = showing ? 'Show password' : 'Hide password';
        toggle.setAttribute('aria-label', toggle.title);
        toggle.innerHTML = `<i class="bi ${showing ? 'bi-eye' : 'bi-eye-slash'}"></i>`;
      });
      group.append(input, toggle);
      control = group;
    }

    const help = document.createElement('div');
    help.className = 'form-text';
    help.textContent = field.description || '';
    if (field.type === 'boolean' && field.presentation === 'checkbox') wrap.append(control, help);
    else wrap.append(label, control, help);

    input.addEventListener('input', () => {
      if (input instanceof HTMLInputElement && input.type === 'checkbox')
        input.value = String(input.checked);
      refreshFieldPresentations();
      if (input.dataset.storageTab === 'connection') resetAfterConnectionChange();
      if (input.dataset.storageTab === 'database') resetAfterDatabaseChange();
    });
    input.addEventListener('change', () => {
      if (input instanceof HTMLInputElement && input.type === 'checkbox')
        input.value = String(input.checked);
      refreshFieldPresentations();
      if (input.dataset.storageTab === 'connection') resetAfterConnectionChange();
      if (input.dataset.storageTab === 'database') resetAfterDatabaseChange();
    });

    return { wrap, input };
  };

  const validatePanel = (id) => {
    const panel = tabPanel(id);
    if (!(panel instanceof HTMLElement)) return true;
    refreshFieldPresentations();
    for (const input of panel.querySelectorAll('input, select, textarea')) {
      if (
        input instanceof HTMLElement &&
        typeof input.checkValidity === 'function' &&
        !input.checkValidity()
      ) {
        input.reportValidity?.();
        input.focus?.();
        return false;
      }
    }
    return true;
  };

  const markDatabaseReady = (database) => {
    databaseState = 'ready';
    databaseExists = true;
    schemaState = 'idle';
    schemaDetails = null;
    const input = modalElement.querySelector('[name="setting.database"]');
    if (input && database) input.value = database;
    refreshFieldPresentations();
    refreshTabAvailability();
    syncPopupCtx();
  };

  const enhanceDatabasePanel = (panel, adapter) => {
    const fieldKey = adapter?.targetWorkflow?.databaseFieldKey;
    if (!fieldKey) return;
    const fieldDefinition = (adapter?.tabs || [])
      .flatMap((tab) => tab.fields || [])
      .find((field) => field.key === fieldKey);
    const suggestedDatabaseName = String(fieldDefinition?.suggestedValue || 'ManatOS_DB');
    const input = panel.querySelector(`[name="setting.${CSS.escape(fieldKey)}"]`);
    if (!(input instanceof HTMLInputElement)) return;
    const originalWrap = input.closest('[data-storage-field-key]');
    if (originalWrap instanceof HTMLElement) {
      originalWrap.dataset.storageWorkflowHidden = 'true';
      originalWrap.classList.add('d-none');
    }

    const actions = document.createElement('div');
    actions.className = 'col-12';
    actions.innerHTML = `
      <div class="border rounded p-3 bg-body-tertiary">
        <div class="fw-semibold mb-2">Database target (*)</div>
        <div class="form-check mb-2">
          <input class="form-check-input" type="radio" name="storageDatabaseMode" value="existing" id="storageDatabaseExisting" checked>
          <label class="form-check-label fw-semibold" for="storageDatabaseExisting">Use an existing database</label>
        </div>
        <div class="row g-2 align-items-end mb-3" data-storage-existing-database>
          <div class="col-12 col-md">
            <select class="form-select" data-storage-database-list><option value="">Select an existing database…</option></select>
          </div>
          <div class="col-auto"><button type="button" class="btn btn-outline-secondary" data-storage-refresh-databases><i class="bi bi-arrow-clockwise me-1"></i>Refresh</button></div>
        </div>
        <div class="form-check mb-2">
          <input class="form-check-input" type="radio" name="storageDatabaseMode" value="new" id="storageDatabaseNew">
          <label class="form-check-label fw-semibold" for="storageDatabaseNew">Create a new database</label>
        </div>
        <div class="row g-2 align-items-end d-none" data-storage-new-database>
          <div class="col-12 col-md">
            <label class="form-label mb-1">New database name (*)</label>
            <input type="text" class="form-control" data-storage-new-database-name>
          </div>
          <div class="col-auto"><button type="button" class="btn btn-outline-primary" data-storage-create-database><i class="bi bi-database-add me-1"></i>Create database</button></div>
        </div>
      </div>`;
    panel.querySelector('.row')?.appendChild(actions);

    const list = actions.querySelector('[data-storage-database-list]');
    const refresh = actions.querySelector('[data-storage-refresh-databases]');
    const existingRegion = actions.querySelector('[data-storage-existing-database]');
    const newRegion = actions.querySelector('[data-storage-new-database]');
    const newName = actions.querySelector('[data-storage-new-database-name]');
    const create = actions.querySelector('[data-storage-create-database]');
    const modeInputs = [...actions.querySelectorAll('[name="storageDatabaseMode"]')];
    const existingMode = modeInputs.find((radio) => radio.value === 'existing');
    const newMode = modeInputs.find((radio) => radio.value === 'new');

    const setDatabase = (value) => {
      const changed = input.value !== value;
      input.value = value;
      if (changed) input.dispatchEvent(new Event('input', { bubbles: true }));
    };

    const showMode = (mode) => {
      if (existingMode instanceof HTMLInputElement) existingMode.checked = mode === 'existing';
      if (newMode instanceof HTMLInputElement) newMode.checked = mode === 'new';
      existingRegion?.classList.toggle('d-none', mode !== 'existing');
      newRegion?.classList.toggle('d-none', mode !== 'new');
    };

    const inspectSelected = async (database) => {
      if (!database) {
        resetAfterDatabaseChange();
        return false;
      }
      const token = beginStageOperation('database');
      setStageFeedback('database', `Checking database '${database}'…`, 'info');
      try {
        const response = await postTarget('database/inspect', { database });
        if (!response) return false;
        if (!stageOperationIsCurrent(token)) return false;
        const status = response?.data || response;
        if (status.exists) {
          markDatabaseReady(status.database);
          setStageFeedback(
            'database',
            `Database '${status.database}' exists and is available.`,
            'success',
          );
          return true;
        }
        resetAfterDatabaseChange();
        setStageFeedback('database', `Database '${status.database}' does not exist.`, 'warning');
        return false;
      } catch (error) {
        if (!stageOperationIsCurrent(token)) return false;
        resetAfterDatabaseChange();
        setStageFeedback(
          'database',
          error instanceof Error ? error.message : 'Database could not be checked.',
          'danger',
        );
        return false;
      }
    };

    const refreshDatabases = async ({ selectDatabase = String(input.value || '').trim() } = {}) => {
      const token = beginStageOperation('database');
      setStageFeedback('database', 'Reading available databases…', 'info');
      try {
        const response = await postTarget('databases');
        if (!response) return false;
        if (!stageOperationIsCurrent(token)) return false;
        const databases = response?.data?.databases || response?.databases || [];
        list.replaceChildren();
        const empty = document.createElement('option');
        empty.value = '';
        empty.textContent = 'Select an existing database…';
        list.appendChild(empty);
        for (const database of databases) {
          const option = document.createElement('option');
          option.value = database;
          option.textContent = database;
          list.appendChild(option);
        }

        const discoveredDatabase = selectDatabase
          ? databases.find(
              (database) =>
                database.localeCompare(selectDatabase, undefined, { sensitivity: 'accent' }) === 0,
            )
          : '';
        databaseDiscoveredThisSession = true;
        if (discoveredDatabase) {
          const databaseChanged = input.value !== discoveredDatabase;
          showMode('existing');
          list.value = discoveredDatabase;
          newName.value = discoveredDatabase;
          setDatabase(discoveredDatabase);
          databaseState = 'ready';
          databaseExists = true;
          if (databaseChanged) {
            schemaState = 'idle';
            schemaDetails = null;
          }
          refreshFieldPresentations();
          refreshTabAvailability();
          syncPopupCtx();
          setStageFeedback(
            'database',
            `Database '${discoveredDatabase}' is available and selected.`,
            'success',
          );
          return true;
        }

        if (selectDatabase) {
          // Discovery is authoritative only after the Admin explicitly asks for
          // it. A remembered database is shown before refresh, but if refresh
          // proves it missing we downgrade the working state and offer the same
          // remembered name as the Create-new proposal.
          databaseExists = false;
          showMode('new');
          list.value = '';
          newName.value = selectDatabase;
          setDatabase(selectDatabase);
          databaseState = 'error';
          schemaState = 'idle';
          schemaDetails = null;
          refreshTabAvailability();
          syncPopupCtx();
          const missingMessage = `Configured database '${selectDatabase}' was not found on this server.`;
          setStageFeedback('database', missingMessage, 'danger');
          presentFailure(new Error(missingMessage), missingMessage, { popup: true });
          return false;
        } else {
          setStageFeedback(
            'database',
            `${databases.length} database${databases.length === 1 ? '' : 's'} available.`,
            'success',
          );
        }
        return true;
      } catch (error) {
        if (!stageOperationIsCurrent(token)) return false;
        setStageFeedback(
          'database',
          error instanceof Error ? error.message : 'Databases could not be read.',
          'danger',
        );
        return false;
      }
    };

    const applyMode = () => {
      const mode = modeInputs.find((radio) => radio.checked)?.value || 'existing';
      showMode(mode);
      if (mode === 'existing') {
        if (list.value) setDatabase(list.value);
      } else {
        if (!newName.value.trim()) newName.value = suggestedDatabaseName;
        list.value = '';
        setDatabase(newName.value.trim());
      }
      resetAfterDatabaseChange();
    };

    databaseController = {
      refresh: refreshDatabases,
      setOperational(ready) {
        refresh.disabled = !ready;
        create.disabled = !ready;
        list.disabled = !ready;
        refresh.title = ready ? '' : 'Verify Connection before discovering databases.';
        list.title = ready ? '' : 'Verify Connection before selecting a database.';
        create.title = ready ? '' : 'Verify Connection before creating a database.';
      },
      reset() {
        const configuredDatabase = String(input.value || '').trim();
        list.replaceChildren();
        if (configuredDatabase) {
          const remembered = document.createElement('option');
          remembered.value = configuredDatabase;
          remembered.textContent = `${configuredDatabase} (saved configuration; refresh to revalidate)`;
          list.appendChild(remembered);
        }
        const refreshHint = document.createElement('option');
        refreshHint.value = '';
        refreshHint.textContent = 'Verify connection and refresh to discover existing databases…';
        refreshHint.disabled = true;
        list.appendChild(refreshHint);
        newName.value = configuredDatabase || suggestedDatabaseName;
        if (configuredDatabase) {
          showMode('existing');
          list.value = configuredDatabase;
        } else {
          showMode('new');
          list.value = '';
          // The suggestion is presentation-only. settings.database remains empty
          // until the Admin explicitly chooses or creates a target database.
          input.value = '';
        }
      },
    };
    databaseController.reset();

    modeInputs.forEach((radio) => radio.addEventListener('change', applyMode));
    list.addEventListener('change', async () => {
      setDatabase(list.value);
      await inspectSelected(list.value);
    });
    newName.addEventListener('input', () => {
      databaseExists = null;
      setDatabase(newName.value.trim());
      resetAfterDatabaseChange();
    });
    refresh.addEventListener('click', () => refreshDatabases());
    create.addEventListener('click', async () => {
      const database = newName.value.trim();
      if (!database) {
        newName.setCustomValidity('Database name is required.');
        newName.reportValidity();
        newName.setCustomValidity('');
        return;
      }
      const token = beginStageOperation('database');
      create.disabled = true;
      setStageFeedback('database', `Creating database '${database}'…`, 'info');
      try {
        const response = await postTarget('database/prepare', { database });
        if (!response) {
          setStageFeedback('database');
          return;
        }
        if (!stageOperationIsCurrent(token)) return;
        const status = response?.data || response;
        const createdDatabase = status.database || database;
        setDatabase(createdDatabase);
        // Creation success is not enough to claim the database exists. Switch to
        // Existing and perform the same authoritative discovery as the Refresh action.
        showMode('existing');
        const selected = await refreshDatabases({ selectDatabase: createdDatabase });
        if (selected) {
          setStageFeedback(
            'database',
            `Database '${createdDatabase}' is available and selected.`,
            'success',
          );
        } else {
          // Keep the intended name, but never fabricate it as an existing database.
          showMode('new');
          newName.value = createdDatabase;
          setDatabase(createdDatabase);
          presentFailure(
            new Error(
              `Database '${createdDatabase}' was reported as created but was not returned by the subsequent database refresh.`,
            ),
            'The created database could not be confirmed.',
            { popup: true },
          );
        }
      } catch (error) {
        if (!stageOperationIsCurrent(token)) return;
        setStageFeedback(
          'database',
          error instanceof Error ? error.message : 'Database could not be created.',
          'danger',
        );
      } finally {
        create.disabled = connectionState !== 'verified';
      }
    });
  };

  const renderSchemaStatus = (status) => {
    schemaDetails = status;
    schemaState = status?.ready ? 'ready' : 'changes-required';
    const details = Array.isArray(status?.changes)
      ? status.changes
          .slice(0, 8)
          .map((change) => change.description)
          .join(' · ')
      : '';
    const suffix = details ? ` ${details}${status.changes.length > 8 ? ' …' : ''}` : '';
    setStageFeedback(
      'schema',
      `${status?.message || 'Schema status inspected.'}${suffix}`,
      status?.ready ? 'success' : 'warning',
    );
    syncPopupCtx();
  };

  const enhanceSchemaPanel = (panel) => {
    const actions = document.createElement('div');
    actions.className = 'border rounded p-3 bg-body-tertiary';
    actions.innerHTML = `
      <div class="fw-semibold mb-1">ManatOS schema readiness</div>
      <div class="small text-secondary mb-3">Inspect the selected target without switching the active datastore. Preparation is additive and can be run now; startup will inspect again when this configuration eventually becomes active.</div>
      <div class="d-flex flex-wrap gap-2">
        <button type="button" class="btn btn-outline-secondary" data-storage-inspect-schema><i class="bi bi-diagram-3 me-1"></i>Check schema</button>
        <button type="button" class="btn btn-outline-primary" data-storage-prepare-schema><i class="bi bi-wrench-adjustable me-1"></i>Apply required changes now</button>
      </div>`;
    panel.appendChild(actions);
    const inspectButton = actions.querySelector('[data-storage-inspect-schema]');
    const prepareButton = actions.querySelector('[data-storage-prepare-schema]');
    schemaController = {
      setOperational(ready) {
        if (inspectButton instanceof HTMLButtonElement) inspectButton.disabled = !ready;
        if (prepareButton instanceof HTMLButtonElement) prepareButton.disabled = !ready;
      },
    };

    inspectButton?.addEventListener('click', async () => {
      const token = beginStageOperation('schema');
      setStageFeedback('schema', 'Inspecting schema…', 'info');
      schemaState = 'checking';
      syncPopupCtx();
      try {
        const response = await postTarget('schema/inspect', {
          database: collectSettings().database,
        });
        if (!response) {
          schemaState = 'idle';
          setStageFeedback('schema');
          return;
        }
        if (!stageOperationIsCurrent(token)) return;
        renderSchemaStatus(response?.data || response);
      } catch (error) {
        if (!stageOperationIsCurrent(token)) return;
        schemaState = 'error';
        syncPopupCtx();
        setStageFeedback(
          'schema',
          error instanceof Error ? error.message : 'Schema could not be inspected.',
          'danger',
        );
      }
    });

    prepareButton?.addEventListener('click', async () => {
      const token = beginStageOperation('schema');
      try {
        schemaState = 'checking';
        setStageFeedback('schema', 'Inspecting schema…', 'info');
        syncPopupCtx();
        const inspectionResponse = await postTarget('schema/inspect', {
          database: collectSettings().database,
        });
        if (!inspectionResponse) {
          schemaState = 'idle';
          setStageFeedback('schema');
          return;
        }
        if (!stageOperationIsCurrent(token)) return;
        const inspection = inspectionResponse?.data || inspectionResponse;
        renderSchemaStatus(inspection);
        if (inspection.ready) return;
        setStageFeedback('schema', 'Applying required schema changes…', 'info');
        schemaState = 'preparing';
        syncPopupCtx();
        const response = await postTarget('schema/prepare', {
          database: collectSettings().database,
        });
        if (!response) {
          schemaState = 'idle';
          setStageFeedback('schema');
          return;
        }
        if (!stageOperationIsCurrent(token)) return;
        renderSchemaStatus(response?.data || response);
      } catch (error) {
        if (!stageOperationIsCurrent(token)) return;
        schemaState = 'error';
        syncPopupCtx();
        setStageFeedback(
          'schema',
          error instanceof Error ? error.message : 'Schema preparation failed.',
          'danger',
        );
      }
    });
  };

  const enhanceDataPanel = (panel) => {
    const actions = document.createElement('div');
    actions.className = 'border rounded p-3 bg-body-tertiary';
    actions.innerHTML = `
      <div class="fw-semibold mb-1">Data readiness and migration</div>
      <div class="small text-secondary">This stage is reserved for future data consistency checks, source/target comparison and migration tools between saved storage configurations.</div>`;
    panel.appendChild(actions);
  };

  const addConnectionTest = (panel, adapter) => {
    if (adapter?.targetWorkflow?.connectionTest !== true) return;
    const row = panel.querySelector('.row');
    if (!(row instanceof HTMLElement)) return;
    const actions = document.createElement('div');
    actions.className = 'col-12 d-flex flex-wrap gap-2 align-items-center pt-1';
    actions.innerHTML = `
      <button type="button" class="btn btn-outline-primary" data-storage-test-connection><i class="bi bi-plug me-1"></i>Test connection</button>
      <span class="small text-secondary" data-storage-connection-status></span>`;
    row.appendChild(actions);
    const button = actions.querySelector('[data-storage-test-connection]');
    const statusNode = actions.querySelector('[data-storage-connection-status]');
    button?.addEventListener('click', async () => {
      if (!validatePanel('connection')) return;

      // A connection test owns only the Connection stage. Starting a new attempt
      // invalidates older Connection/Database/Schema requests so a late response
      // from a previous target can never contaminate this editor session.
      invalidateStageOperations('connection', 'database', 'schema');
      const token = beginStageOperation('connection');
      setError();
      setResult();
      clearStageFeedback('connection', 'database', 'schema');
      const connectionChanged = stageSettingsDirty('connection');
      connectionState = 'testing';
      connectionDetails = null;
      if (connectionChanged) {
        databaseState = 'idle';
        schemaState = 'idle';
        schemaDetails = null;
        databaseExists = null;
        databaseDiscoveredThisSession = false;
        databaseController?.reset?.();
      }
      statusNode.textContent = 'Testing…';
      button.disabled = true;
      refreshTabAvailability();
      syncPopupCtx();
      try {
        const response = await postTarget('test-connection');
        if (!response) {
          connectionState = 'idle';
          connectionDetails = null;
          statusNode.textContent = 'Not tested';
          setStageFeedback('connection');
          return;
        }
        if (!stageOperationIsCurrent(token)) return;
        const status = response?.data || response;
        connectionState = 'verified';
        connectionDetails = status;
        statusNode.textContent = `Connected${status.engineVersion ? ` · ${status.engineVersion}` : ''}`;
        const nextStage = (adapter?.tabs || []).find((tab) => tab.id !== 'connection');
        const continuation = nextStage ? ` Continue with the ${nextStage.label} stage.` : '';
        setStageFeedback(
          'connection',
          `Connection successful: ${status.targetLabel || 'configured target'}.${continuation}`,
          'success',
        );
      } catch (error) {
        if (!stageOperationIsCurrent(token)) return;
        connectionState = 'failed';
        connectionDetails = null;
        statusNode.textContent = 'Connection failed';
        setStageFeedback(
          'connection',
          error instanceof Error ? error.message : 'Connection test failed.',
          'danger',
        );
      } finally {
        if (stageOperationIsCurrent(token)) {
          button.disabled = false;
          refreshTabAvailability();
          syncPopupCtx();
        }
      }
    });
  };

  const restorePersistedWorkflow = (configuration, adapter) => {
    if (!configuration?.stage) return;
    const stage = configuration.stage;
    const status = configuration.status || '';
    const workflow = adapter?.targetWorkflow || {};
    const order = ['configuration', 'connection', 'database', 'schema', 'data', 'complete'];
    const index = order.indexOf(stage);
    const beyond = (candidate) => index > order.indexOf(candidate);

    if (workflow.connectionTest === true && beyond('connection')) connectionState = 'verified';
    if (
      (workflow.databaseDiscovery === true || workflow.databasePreparation === true) &&
      beyond('database')
    ) {
      databaseState = 'ready';
    }
    if (workflow.schemaPreparation === true && beyond('schema')) schemaState = 'ready';

    if (status === 'ready' || stage === 'complete') {
      if (workflow.connectionTest === true) connectionState = 'verified';
      if (workflow.databaseDiscovery === true || workflow.databasePreparation === true)
        databaseState = 'ready';
      if (workflow.schemaPreparation === true) schemaState = 'ready';
    } else if (status === 'error') {
      if (stage === 'connection') connectionState = 'failed';
      if (stage === 'database') databaseState = 'error';
      if (stage === 'schema') schemaState = 'error';
    }

    const statusNode = modalElement.querySelector('[data-storage-connection-status]');
    if (statusNode instanceof HTMLElement && connectionState === 'verified') {
      statusNode.textContent = 'Saved as validated · retest optional';
    }
  };

  const renderCapabilitiesTab = (adapter) => {
    const capabilities = Array.isArray(adapter?.capabilities) ? adapter.capabilities : [];

    const item = document.createElement('li');
    item.className = 'nav-item';
    item.setAttribute('role', 'presentation');
    item.dataset.storageAdapterTab = 'capabilities';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'nav-link';
    button.dataset.storageStep = 'capabilities';
    button.dataset.requiresConnection = 'false';
    button.dataset.requiresDatabase = 'false';
    button.dataset.requiresSchema = 'false';
    const label = document.createElement('span');
    label.dataset.storageTabLabel = '';
    label.textContent = 'Capabilities';
    button.appendChild(label);
    item.appendChild(button);
    tabsHost.appendChild(item);

    const panel = document.createElement('section');
    panel.className = 'd-none';
    panel.dataset.storagePanel = 'capabilities';
    panel.dataset.storageCapabilities = '';

    const intro = document.createElement('div');
    intro.className = 'small text-secondary mb-3';
    intro.textContent =
      'Effective native capabilities resolved from the adapter family hierarchy. System behavioral guarantees and adapter implementation strategies are separate concerns.';
    panel.appendChild(intro);

    const categories = new Map();
    for (const capability of capabilities) {
      const category = capability.category || 'Other';
      if (!categories.has(category)) categories.set(category, []);
      categories.get(category).push(capability);
    }

    const categoryNav = document.createElement('div');
    categoryNav.className = 'nav nav-pills flex-nowrap gap-1 storage-capability-category-tabs mb-3';
    categoryNav.setAttribute('role', 'tablist');
    const categoryPanels = document.createElement('div');
    categoryPanels.className = 'storage-capability-category-panels';

    const showCategory = (name) => {
      categoryNav.querySelectorAll('[data-storage-capability-category]').forEach((node) => {
        const active = node.dataset.storageCapabilityCategory === name;
        node.classList.toggle('active', active);
        node.setAttribute('aria-selected', String(active));
      });
      categoryPanels
        .querySelectorAll('[data-storage-capability-category-panel]')
        .forEach((node) => {
          node.classList.toggle('d-none', node.dataset.storageCapabilityCategoryPanel !== name);
        });
    };

    let categoryIndex = 0;
    for (const [categoryName, categoryCapabilities] of categories) {
      const categoryButton = document.createElement('button');
      categoryButton.type = 'button';
      categoryButton.className = `nav-link ${categoryIndex === 0 ? 'active' : ''}`;
      categoryButton.dataset.storageCapabilityCategory = categoryName;
      categoryButton.setAttribute('role', 'tab');
      categoryButton.setAttribute('aria-selected', String(categoryIndex === 0));
      categoryButton.textContent = categoryName;
      categoryNav.appendChild(categoryButton);

      const categoryPanel = document.createElement('div');
      categoryPanel.dataset.storageCapabilityCategoryPanel = categoryName;
      categoryPanel.className = categoryIndex === 0 ? '' : 'd-none';

      const tableWrap = document.createElement('div');
      tableWrap.className = 'table-responsive storage-capability-table-scroll';
      const table = document.createElement('table');
      table.className = 'table table-sm align-middle mb-0';
      table.innerHTML =
        '<thead class="sticky-top bg-body"><tr><th>Capability</th><th>Native support</th><th>Inherited / defined by</th></tr></thead>';
      const body = document.createElement('tbody');

      for (const capability of categoryCapabilities) {
        const row = document.createElement('tr');
        row.dataset.storageCapabilityKey = capability.key || '';

        const name = document.createElement('td');
        const title = document.createElement('div');
        title.className = 'fw-semibold';
        title.textContent = capability.label || capability.key || 'Capability';
        const description = document.createElement('div');
        description.className = 'small text-secondary';
        description.textContent = capability.description || '';
        name.append(title, description);

        const support = document.createElement('td');
        const badge = document.createElement('span');
        badge.className = capability.supported
          ? 'badge text-bg-success'
          : 'badge text-bg-light border text-secondary';
        badge.textContent = capability.supported ? 'Supported' : 'Not native';
        support.appendChild(badge);

        const source = document.createElement('td');
        source.textContent = capability.sourceName || capability.sourceId || '—';

        row.append(name, support, source);
        body.appendChild(row);
      }

      table.appendChild(body);
      tableWrap.appendChild(table);
      categoryPanel.appendChild(tableWrap);
      categoryPanels.appendChild(categoryPanel);
      categoryIndex += 1;
    }

    categoryNav.addEventListener('click', (event) => {
      const choice =
        event.target instanceof Element
          ? event.target.closest('[data-storage-capability-category]')
          : null;
      if (!(choice instanceof HTMLButtonElement)) return;
      showCategory(choice.dataset.storageCapabilityCategory || '');
    });

    panel.append(categoryNav, categoryPanels);
    panelsHost.appendChild(panel);
  };

  const renderAdapterTabs = (settings = {}, persisted = null) => {
    tabsHost.querySelectorAll('[data-storage-adapter-tab]').forEach((node) => node.remove());
    panelsHost.replaceChildren();
    configurationFields.replaceChildren();
    databaseController = null;
    schemaController = null;
    connectionState = 'idle';
    databaseState = 'idle';
    schemaState = 'idle';
    connectionDetails = null;
    schemaDetails = null;
    databaseDiscoveredThisSession = false;
    databaseExists = null;
    invalidateStageOperations('connection', 'database', 'schema');
    clearStageFeedback('connection', 'database', 'schema');

    const adapter = adapterFor(adapterSelect.value);
    description.textContent = adapter?.description || '';
    const tabs = Array.isArray(adapter?.tabs) ? adapter.tabs : [];
    const configurationTab = tabs.find((tab) => tab.id === 'configuration');

    if (configurationTab) {
      const row = document.createElement('div');
      row.className = 'row g-3 mt-1';
      for (const field of configurationTab.fields || []) {
        const fieldWithTab = { ...field, _tabId: 'configuration' };
        row.appendChild(makeField(fieldWithTab, settings).wrap);
      }
      configurationFields.appendChild(row);
    }

    for (const tab of tabs.filter((entry) => entry.id !== 'configuration')) {
      const item = document.createElement('li');
      item.className = 'nav-item';
      item.setAttribute('role', 'presentation');
      item.dataset.storageAdapterTab = tab.id;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'nav-link';
      button.dataset.storageStep = tab.id;
      button.dataset.requiresConnection = String(tab.requiresConnection === true);
      button.dataset.requiresDatabase = String(tab.requiresDatabase === true);
      button.dataset.requiresSchema = String(tab.requiresSchema === true);
      button.dataset.retainWhenConfiguredBy = Array.isArray(tab.retainWhenConfiguredBy)
        ? tab.retainWhenConfiguredBy.join('|')
        : '';
      const statusIcon = document.createElement('span');
      statusIcon.className = 'me-1 d-none';
      statusIcon.dataset.storageTabStatusIcon = '';
      const label = document.createElement('span');
      label.dataset.storageTabLabel = '';
      label.textContent = tab.label;
      button.append(statusIcon, label);
      item.appendChild(button);
      tabsHost.appendChild(item);

      const panel = document.createElement('section');
      panel.className = 'd-none';
      panel.dataset.storagePanel = tab.id;
      const warning = document.createElement('div');
      warning.className = 'alert alert-warning d-none mb-3';
      warning.dataset.storageStageWarning = '';
      panel.appendChild(warning);
      const row = document.createElement('div');
      row.className = 'row g-3';
      panel.appendChild(row);
      for (const field of tab.fields || []) {
        const fieldWithTab = { ...field, _tabId: tab.id };
        row.appendChild(makeField(fieldWithTab, settings).wrap);
      }
      panelsHost.appendChild(panel);
      if (tab.id === 'connection') addConnectionTest(panel, adapter);
      if (tab.id === 'database') enhanceDatabasePanel(panel, adapter);
      if (tab.id === 'schema') enhanceSchemaPanel(panel);
      if (tab.id === 'data') enhanceDataPanel(panel);
    }

    renderCapabilitiesTab(adapter);
    restorePersistedWorkflow(persisted, adapter);
    if (!initialValues.has('name')) initialValues.set('name', nameInput.value);
    refreshFieldPresentations();
    refreshTabAvailability();
    showTab('configuration');
  };

  const configurationRow = (configuration) =>
    root.querySelector(`[data-storage-configuration-id="${CSS.escape(configuration.id)}"]`);

  const effectiveConfigurationStatus = (configuration) => {
    if (configuration.id === runningConfigurationId()) return 'current';
    if (
      configuration.id === selectedConfigurationId() &&
      configuration.id !== runningConfigurationId()
    )
      return 'selected';
    return configuration.status || '';
  };

  const storageConfigurationSelectable = (configuration) => {
    const adapter = adapterFor(configuration.adapterId);
    return (
      adapter?.runtimeAvailable !== false &&
      (configuration.status === 'ready' ||
        configuration.id === runningConfigurationId() ||
        configuration.id === selectedConfigurationId())
    );
  };

  const renderWorkflowCells = (row, configuration) => {
    const stageCell = row.querySelector('[data-storage-row-stage]');
    if (stageCell instanceof HTMLElement) {
      stageCell.textContent = stageLabels[configuration.stage] || '—';
    }
    const statusCell = row.querySelector('[data-storage-row-status]');
    if (!(statusCell instanceof HTMLElement)) return;
    const effective = effectiveConfigurationStatus(configuration);
    const presentation = {
      current: ['Current', 'text-bg-primary'],
      selected: ['Selected', 'text-bg-info'],
      ready: ['Ready', 'text-bg-success'],
      incomplete: ['Incomplete', 'text-bg-warning'],
      error: ['Error', 'text-bg-danger'],
      '': ['Unknown', 'text-bg-light border text-secondary'],
    }[effective] || [statusLabels[effective] || 'Unknown', 'text-bg-light border text-secondary'];
    const badge = document.createElement('span');
    badge.className = `badge ${presentation[1]}`;
    badge.textContent = presentation[0];
    statusCell.replaceChildren(badge);
  };

  const renderCurrentPickerContent = (host, configuration, { active = false } = {}) => {
    const adapter = adapterFor(configuration.adapterId);
    const status = statusLabels[configuration.status] || 'Unknown';
    const stage = stageLabels[configuration.stage] || 'Unknown';
    host.replaceChildren();

    const name = document.createElement('strong');
    name.className = 'text-truncate';
    name.textContent = configuration.name;
    const separator = document.createElement('span');
    separator.className = active ? 'opacity-75' : 'text-secondary';
    separator.textContent = '—';
    const image = document.createElement('img');
    image.src = adapter?.logoUrl || '/images/storage-adapters/json.svg';
    image.alt = '';
    image.width = 20;
    image.height = 20;
    image.className = 'rounded flex-shrink-0';
    const adapterName = document.createElement('span');
    adapterName.className = 'text-truncate';
    adapterName.textContent = adapter?.name || configuration.adapterId;
    const state = document.createElement('span');
    state.className = active
      ? 'ms-auto small opacity-75 text-nowrap'
      : 'text-secondary text-nowrap';
    state.textContent = `${active ? '' : '— '}${status} (${stage})`;
    host.append(name, separator, image, adapterName, state);
  };

  const renderCurrentStoragePicker = () => {
    if (
      !(currentPickerButton instanceof HTMLButtonElement) ||
      !(currentPickerMenu instanceof HTMLElement) ||
      !(currentValue instanceof HTMLInputElement)
    )
      return;

    currentPickerMenu.replaceChildren();
    for (const configuration of configurations) {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'dropdown-item d-flex align-items-center gap-2 py-2';
      if (configuration.id === currentValue.value) button.classList.add('active');
      button.dataset.storageCurrentOption = configuration.id;
      button.disabled = !storageConfigurationSelectable(configuration);
      renderCurrentPickerContent(button, configuration, { active: true });
      item.appendChild(button);
      currentPickerMenu.appendChild(item);
    }

    const selected = configurations.find((entry) => entry.id === currentValue.value);
    const content = currentPickerButton.querySelector('[data-storage-current-picker-content]');
    if (selected && content instanceof HTMLElement) renderCurrentPickerContent(content, selected);
  };

  const syncCurrentStorageOption = () => renderCurrentStoragePicker();

  const syncConfigurationUi = (configuration) => {
    const adapter = adapterFor(configuration.adapterId);
    let row = configurationRow(configuration);
    if (!(row instanceof HTMLTableRowElement)) {
      row = document.createElement('tr');
      row.dataset.storageConfigurationId = configuration.id;
      row.draggable = true;
      row.innerHTML = `
        <td class="text-secondary text-center storage-configuration-drag-handle" style="width:2rem" title="Drag to reorder"><i class="bi bi-grip-vertical"></i></td>
        <td class="fw-semibold" data-storage-row-name></td>
        <td data-storage-row-adapter></td>
        <td data-storage-row-status></td>
        <td data-storage-row-stage></td>
        <td class="text-end text-nowrap">
          <button type="button" class="btn btn-outline-secondary btn-sm" data-storage-configure><i class="bi bi-sliders me-1"></i>Configure</button>
          <button type="button" class="btn btn-outline-danger btn-sm ms-1" data-storage-delete><i class="bi bi-trash3 me-1"></i>Delete</button>
        </td>`;
      root.querySelector('[data-storage-configurations]')?.appendChild(row);
      row
        .querySelector('[data-storage-configure]')
        ?.addEventListener('click', () =>
          openEditor(
            configurations.find((entry) => entry.id === configuration.id) || configuration,
          ),
        );
    }
    const nameCell = row.querySelector('[data-storage-row-name]') || row.children[0];
    const adapterCell = row.querySelector('[data-storage-row-adapter]') || row.children[1];
    if (nameCell) nameCell.textContent = configuration.name;
    if (adapterCell) {
      adapterCell.replaceChildren();
      const image = document.createElement('img');
      image.src = adapter?.logoUrl || '/images/storage-adapters/json.svg';
      image.alt = '';
      image.width = 22;
      image.height = 22;
      image.className = 'me-2 rounded';
      adapterCell.append(image, document.createTextNode(adapter?.name || configuration.adapterId));
    }

    const deleteButton = row.querySelector('[data-storage-delete]');
    if (deleteButton instanceof HTMLButtonElement) {
      deleteButton.dataset.storageDelete = configuration.id;
      deleteButton.disabled =
        configuration.id === selectedConfigurationId() ||
        configuration.id === runningConfigurationId();
      deleteButton.title = deleteButton.disabled
        ? 'A selected or currently running configuration cannot be deleted.'
        : 'Delete storage configuration';
    }

    const existingIndex = configurations.findIndex((entry) => entry.id === configuration.id);
    if (existingIndex >= 0) configurations[existingIndex] = configuration;
    else configurations.push(configuration);

    renderWorkflowCells(row, configuration);
    syncCurrentStorageOption(configuration);
    refreshOrderControls();
  };

  const refreshOrderControls = () => {};

  const renderAdapterPicker = () => {
    adapterPickerMenu.replaceChildren();
    let currentFamily = '';
    for (const adapter of adapters) {
      const family = Array.isArray(adapter.familyPath) ? adapter.familyPath.join(' › ') : 'Other';
      if (family !== currentFamily) {
        const heading = document.createElement('li');
        heading.innerHTML = `<h6 class="dropdown-header">${family}</h6>`;
        adapterPickerMenu.appendChild(heading);
        currentFamily = family;
      }
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'dropdown-item d-flex align-items-center gap-2';
      button.dataset.storageAdapterChoice = adapter.id;
      const image = document.createElement('img');
      image.src = adapter.logoUrl || '/images/storage-adapters/json.svg';
      image.alt = '';
      image.width = 24;
      image.height = 24;
      image.className = 'rounded';
      const label = document.createElement('span');
      label.textContent = adapter.name;
      button.append(image, label);
      item.appendChild(button);
      adapterPickerMenu.appendChild(item);
    }
  };

  const syncAdapterPicker = () => {
    const adapter = adapterFor(adapterSelect.value);
    adapterPickerButton.replaceChildren();
    const image = document.createElement('img');
    image.src = adapter?.logoUrl || '/images/storage-adapters/json.svg';
    image.alt = '';
    image.width = 24;
    image.height = 24;
    image.className = 'rounded me-2';
    const label = document.createElement('span');
    label.textContent = adapter?.name || 'Choose storage adapter';
    adapterPickerButton.append(image, label);
    adapterPickerButton.disabled = inspectionOnly || Boolean(editing);
  };

  const refreshModalTitle = () => {
    const prefix = modalElement.querySelector('[data-storage-modal-title-prefix]');
    const logo = modalElement.querySelector('[data-storage-modal-adapter-logo]');
    const name = modalElement.querySelector('[data-storage-modal-title-name]');
    if (!(prefix instanceof HTMLElement) || !(name instanceof HTMLElement)) return;
    const adapter = adapterFor(adapterSelect.value);
    if (editing) {
      prefix.textContent = 'Configure storage:';
      name.textContent = nameInput.value.trim() || editing.name;
      if (logo instanceof HTMLImageElement) {
        logo.src = adapter?.logoUrl || '/images/storage-adapters/json.svg';
        logo.classList.remove('d-none');
      }
      return;
    }
    prefix.textContent = 'Add storage configuration';
    name.textContent = '';
    if (logo instanceof HTMLImageElement) {
      logo.removeAttribute('src');
      logo.classList.add('d-none');
    }
  };

  const promoteSavedBaseline = (configuration) => {
    editing = configuration;
    configuredSecretKeys = configuration.configuredSecretKeys || [];
    initialAdapterId = adapterSelect.value;
    initialWorkflow = {
      stage: configuration.stage || '',
      status: configuration.status || '',
    };
    initialValues.set('name', nameInput.value);
    modalElement.querySelectorAll('[name^="setting."]').forEach((input) => {
      initialValues.set(input.name, controlValue(input));
    });
    adapterSelect.disabled = inspectionOnly;
    syncAdapterPicker();
    refreshModalTitle();
    modalElement.querySelector('[data-storage-modal-subtitle]').textContent =
      'Validate or prepare this target without affecting the datastore currently serving ManatOS.';
    refreshFieldPresentations();
    syncPopupCtx();
  };

  const openEditor = (configuration = null) => {
    editorGeneration += 1;
    invalidateStageOperations('connection', 'database', 'schema');
    editing = configuration;
    configuredSecretKeys = configuration?.configuredSecretKeys || [];
    initialValues = new Map();
    setError();
    setResult();

    adapterSelect.replaceChildren();
    for (const adapter of adapters) {
      const option = document.createElement('option');
      option.value = adapter.id;
      option.textContent = adapter.name;
      adapterSelect.appendChild(option);
    }
    adapterSelect.value = configuration?.adapterId || adapters[0]?.id || '';
    adapterSelect.disabled = inspectionOnly;
    renderAdapterPicker();
    syncAdapterPicker();
    initialAdapterId = adapterSelect.value;
    initialWorkflow = {
      stage: configuration?.stage || '',
      status: configuration?.status || '',
    };
    nameInput.value = configuration?.name || '';
    initialValues.set('name', nameInput.value);

    refreshModalTitle();
    modalElement.querySelector('[data-storage-modal-subtitle]').textContent = configuration
      ? 'Validate or prepare this target without affecting the datastore currently serving ManatOS.'
      : 'Choose an adapter, then configure and validate its target.';

    renderAdapterTabs(configuration?.settings || {}, configuration);
    if (inspectionOnly) {
      nameInput.readOnly = true;
      modalElement.querySelectorAll('input, select, textarea').forEach((control) => {
        if (control instanceof HTMLInputElement && control.type !== 'hidden')
          control.readOnly = true;
        if (control instanceof HTMLSelectElement) control.disabled = true;
        if (control instanceof HTMLTextAreaElement) control.readOnly = true;
      });
      modalElement.querySelectorAll('button').forEach((button) => {
        const navigational =
          button.hasAttribute('data-storage-step') ||
          button.hasAttribute('data-storage-dismiss') ||
          button.hasAttribute('data-bs-dismiss');
        if (!navigational) button.disabled = true;
      });
    }
    modal.show();
  };

  modalElement.addEventListener('shown.bs.modal', () => {
    syncPopupCtx();
    focusFirstEditable(activeStep);
  });

  nameInput.addEventListener('input', () => {
    refreshModalTitle();
    refreshFieldPresentations();
    if (nameInput.validationMessage && !duplicateName()) nameInput.setCustomValidity('');
  });
  adapterSelect.addEventListener('change', () => {
    syncAdapterPicker();
    refreshModalTitle();
    configuredSecretKeys = [];
    initialWorkflow = { stage: '', status: '' };
    renderAdapterTabs();
    syncPopupCtx();
  });

  adapterPickerMenu.addEventListener('click', (event) => {
    const choice =
      event.target instanceof Element
        ? event.target.closest('[data-storage-adapter-choice]')
        : null;
    if (!(choice instanceof HTMLButtonElement) || editing) return;
    adapterSelect.value = choice.dataset.storageAdapterChoice || '';
    adapterSelect.dispatchEvent(new Event('change', { bubbles: true }));
  });

  tabsHost.addEventListener('click', (event) => {
    const button =
      event.target instanceof Element ? event.target.closest('[data-storage-step]') : null;
    if (!(button instanceof HTMLButtonElement) || button.disabled) return;
    showTab(button.dataset.storageStep || 'configuration');
  });

  const configurationBody = root.querySelector('[data-storage-configurations]');
  let draggedConfigurationId = '';

  const persistConfigurationOrder = async () => {
    if (!(configurationBody instanceof HTMLElement)) return;
    const ids = [...configurationBody.querySelectorAll('[data-storage-configuration-id]')]
      .map((row) => row.dataset.storageConfigurationId || '')
      .filter(Boolean);
    const result = await sendStorageCommand(
      '/system-settings/storage/configurations/order',
      () => ({ _csrf: currentCsrf(), ids }),
      'reorder storage configurations',
    );
    if (!result) return;
    const ordered = result?.data?.configurations;
    if (!Array.isArray(ordered)) throw new Error('The server did not return storage order.');
    configurations.splice(0, configurations.length, ...ordered);
  };

  configurationBody?.querySelectorAll('[data-storage-configuration-id]').forEach((row) => {
    row.draggable = !inspectionOnly;
  });
  configurationBody?.addEventListener('dragstart', (event) => {
    if (inspectionOnly) return;
    const row =
      event.target instanceof Element
        ? event.target.closest('[data-storage-configuration-id]')
        : null;
    if (!(row instanceof HTMLTableRowElement)) return;
    draggedConfigurationId = row.dataset.storageConfigurationId || '';
    row.classList.add('opacity-50');
    event.dataTransfer?.setData('text/plain', draggedConfigurationId);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  });
  configurationBody?.addEventListener('dragover', (event) => {
    if (inspectionOnly) return;
    if (!draggedConfigurationId) return;
    const target =
      event.target instanceof Element
        ? event.target.closest('[data-storage-configuration-id]')
        : null;
    const dragged = configurationRow({ id: draggedConfigurationId });
    if (
      !(target instanceof HTMLTableRowElement) ||
      !(dragged instanceof HTMLTableRowElement) ||
      target === dragged
    )
      return;
    event.preventDefault();
    const rect = target.getBoundingClientRect();
    target.parentElement?.insertBefore(
      dragged,
      event.clientY < rect.top + rect.height / 2 ? target : target.nextSibling,
    );
  });
  configurationBody?.addEventListener('dragend', async () => {
    if (inspectionOnly) return;
    const dragged = draggedConfigurationId
      ? configurationRow({ id: draggedConfigurationId })
      : null;
    dragged?.classList.remove('opacity-50');
    draggedConfigurationId = '';
    try {
      await persistConfigurationOrder();
    } catch (error) {
      presentFailure(error, 'Storage configuration order could not be changed.', { popup: true });
      window.location.reload();
    }
  });

  configurationBody?.addEventListener('click', (event) => {
    const button =
      event.target instanceof Element ? event.target.closest('[data-storage-delete]') : null;
    if (inspectionOnly || !(button instanceof HTMLButtonElement) || button.disabled || !deleteModal)
      return;
    const id = button.dataset.storageDelete || '';
    const configuration = configurations.find((entry) => entry.id === id);
    if (!configuration) return;
    deleteCandidateId = id;
    if (deleteName instanceof HTMLElement) deleteName.textContent = configuration.name;
    deleteModal.show();
  });

  deleteConfirm?.addEventListener('click', async () => {
    if (!(deleteConfirm instanceof HTMLButtonElement) || !deleteCandidateId) return;
    const id = deleteCandidateId;
    deleteConfirm.disabled = true;
    try {
      const result = await sendStorageCommand(
        `/system-settings/storage/configurations/${encodeURIComponent(id)}/delete`,
        () => ({ _csrf: currentCsrf() }),
        'delete storage configuration',
      );
      if (!result) return;
      configurations.splice(
        0,
        configurations.length,
        ...configurations
          .filter((entry) => entry.id !== id)
          .map((entry, sequence) => ({ ...entry, sequence })),
      );
      configurationRow({ id })?.remove();
      renderCurrentStoragePicker();
      deleteCandidateId = '';
      deleteModal?.hide();
    } catch (error) {
      presentFailure(error, 'Storage configuration could not be deleted.', { popup: true });
    } finally {
      deleteConfirm.disabled = false;
    }
  });

  deleteModalElement?.addEventListener('hidden.bs.modal', () => {
    deleteCandidateId = '';
    if (deleteName instanceof HTMLElement) deleteName.textContent = '';
  });

  root.querySelector('[data-storage-add]')?.addEventListener('click', () => openEditor());
  currentPickerMenu?.addEventListener('click', (event) => {
    if (inspectionOnly) return;
    const choice =
      event.target instanceof Element
        ? event.target.closest('[data-storage-current-option]')
        : null;
    if (!(choice instanceof HTMLButtonElement) || choice.disabled) return;
    if (!(currentValue instanceof HTMLInputElement)) return;
    currentValue.value = choice.dataset.storageCurrentOption || '';
    renderCurrentStoragePicker();
  });

  debuggingForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (inspectionOnly) return;
    if (
      !(debugEnabled instanceof HTMLInputElement) ||
      !(debugDirectory instanceof HTMLInputElement) ||
      !(debugResult instanceof HTMLElement)
    )
      return;
    const directory = debugDirectory.value.trim();
    if (!directory) {
      debugDirectory.setCustomValidity('Debug output directory is required.');
      debugDirectory.reportValidity();
      return;
    }
    debugDirectory.setCustomValidity('');
    debugResult.textContent = 'Saving…';
    try {
      const responsePayload = await sendStorageCommand(
        '/system-settings/storage/debugging',
        () => ({
          _csrf: currentCsrf(),
          apiStorageContextEnabled: debugEnabled.checked,
          outputDirectory: directory,
        }),
        'update storage debugging settings',
      );
      if (!responsePayload) return;
      const saved = responsePayload?.data?.debugging;
      if (saved) model.debugging = saved;
      debugResult.textContent = 'Debugging settings saved.';
    } catch (error) {
      presentFailure(error, 'Debugging settings could not be saved.', { popup: true });
      debugResult.textContent =
        error instanceof Error ? error.message : 'Debugging settings could not be saved.';
    }
  });

  debugDirectory?.addEventListener('input', () => {
    if (debugDirectory instanceof HTMLInputElement) debugDirectory.setCustomValidity('');
  });

  renderCurrentStoragePicker();
  refreshOrderControls();
  root.querySelectorAll('[data-storage-configure]').forEach((button) => {
    button.addEventListener('click', () =>
      openEditor(configurations.find((entry) => entry.id === button.dataset.storageConfigure)),
    );
  });

  form.addEventListener('submit', async (event) => {
    if (inspectionOnly) {
      event.preventDefault();
      return;
    }
    event.preventDefault();
    setError();
    refreshFieldPresentations();
    const duplicate = duplicateName();
    nameInput.setCustomValidity(duplicate ? 'Storage configuration name is already in use.' : '');
    if (!nameInput.checkValidity() || !adapterSelect.checkValidity()) {
      showTab('configuration');
      if (!nameInput.checkValidity()) nameInput.reportValidity();
      else adapterSelect.reportValidity();
      return;
    }

    const workflow = workflowSummary();
    const payload = {
      _csrf: currentCsrf(),
      name: nameInput.value || '',
      adapterId: adapterSelect.value,
      stage: workflow.stage,
      status: workflow.status,
      settings: collectSettings(),
    };
    const url = editing
      ? `/system-settings/storage/configurations/${encodeURIComponent(editing.id)}`
      : '/system-settings/storage/configurations';
    try {
      const result = await sendStorageCommand(
        url,
        () => ({ ...payload, _csrf: currentCsrf() }),
        editing ? 'update storage configuration' : 'create storage configuration',
      );
      if (!result) return;
      const saved = result?.data?.item;
      if (!saved?.id) throw new Error('The server did not return the saved storage configuration.');
      const wasNew = !editing;
      syncConfigurationUi(saved);
      promoteSavedBaseline(saved);
      setError();
      setResult(
        result?.message ||
          (wasNew
            ? 'Storage configuration created successfully.'
            : 'Storage configuration updated successfully.'),
        'success',
      );
    } catch (error) {
      presentFailure(error, 'Storage configuration could not be saved.');
    }
  });

  root.querySelector('[data-storage-current-form]')?.addEventListener('submit', async (event) => {
    if (inspectionOnly) {
      event.preventDefault();
      return;
    }
    event.preventDefault();
    const select = event.currentTarget.querySelector('[name="configurationId"]');
    const result = event.currentTarget.querySelector('[data-storage-current-result]');
    if (!(select instanceof HTMLInputElement) || !(result instanceof HTMLElement)) return;
    try {
      const responsePayload = await sendStorageCommand(
        '/system-settings/storage/current',
        () => ({ _csrf: currentCsrf(), configurationId: select.value }),
        'change current storage configuration',
      );
      if (!responsePayload) return;
      result.textContent = 'Selection saved. Restart the API to activate it.';
      window.setTimeout(() => window.location.reload(), 500);
    } catch (error) {
      presentFailure(error, 'Selection could not be saved.', { popup: true });
      result.textContent = error instanceof Error ? error.message : 'Selection could not be saved.';
    }
  });
})();
