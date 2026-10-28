import type { MetadataLanguage } from '@manatos/shared';
import {
  multilingual,
  executeCtxCliCommand,
  formatCtxPath,
  nearestExistingCtxPath,
  normalizeCtxCliPath,
  UI_CLI_HISTORY_LIMIT,
  UI_CLI_TOOLBAR,
  MIN_UI_FONT_SCALE_PERCENT,
  MAX_UI_FONT_SCALE_PERCENT,
  UI_FONT_SCALE_STEP_PERCENT,
  type ApplicationState,
  type UiCliHistoryRuntime,
  type CtxCliCommandInput,
  type UiPersistedCliSession,
} from '@manatos/shared-ui';

interface CliTranscriptEntry {
  readonly id: number;
  readonly kind: 'command' | 'result' | 'error' | 'info';
  readonly text: string;
}

export interface CliController {
  readonly element: HTMLElement;
  retarget(path: string): void;
  setHeightPreference(height: number | null): void;
  ownerDocumentChanged(): void;
  refreshLanguage(): void;
  setDetached(detached: boolean): void;
  isExecuting(): boolean;
  captureSession(): UiPersistedCliSession | null;
  destroy(): void;
}

export interface CliOptions {
  readonly context: ApplicationState['context'];
  readonly startPath: string;
  readonly expressionCapabilityDelegate?: CtxCliCommandInput['expressionCapabilityDelegate'];
  readonly expressionDiagnosticSink?: CtxCliCommandInput['expressionDiagnosticSink'];
  readonly closeRequested: () => void;
  readonly caption?: string;
  readonly canDetach?: boolean;
  readonly detached?: boolean;
  readonly detachRequested?: () => void;
  readonly fontScalePercent?: number;
  readonly fontScaleChanged?: (percent: number) => void;
  readonly initialSession?: UiPersistedCliSession | null;
  readonly sessionChanged?: (session: UiPersistedCliSession) => void;
  readonly heightPreference?: number | null;
  readonly historyRuntime?: UiCliHistoryRuntime | null;
  readonly language?: () => MetadataLanguage;
  readonly currentPathChanged?: (path: string) => void;
}

export function createCli(document: Document, options: CliOptions): CliController {
  const abortController = new AbortController();
  const uiText = () =>
    multilingual(options.language?.() ?? 'EN', [
      'DragResize',
      'CliFontSize',
      'IncreaseCliFontSize',
      'ResetCliFontSize',
      'DecreaseCliFontSize',
      'CliFontSizeValue',
      'AttachGlobalCli',
      'DetachGlobalCli',
      'CloseCli',
      'CliHistory',
      'DebugExpression',
      'ExecutionContext',
      'NoCommandsYet',
    ] as const);
  const element = document.createElement('section');
  element.className = 'debugging-cli debugging-cli-dock';
  element.setAttribute('aria-label', options.caption ?? UI_CLI_TOOLBAR.contextualCaption);
  element.dataset.debugResizablePanel = 'cli';
  let preferredHeight = resolveHeightPreference(options.heightPreference ?? null);
  element.dataset.debugPreferredHeight = String(preferredHeight);
  element.style.height = `${preferredHeight}px`;

  const resize = document.createElement('div');
  resize.className = 'debugging-cli-resize';
  resize.dataset.debugVerticalResize = 'cli';
  resize.title = uiText().DragResize;

  const heading = document.createElement('div');
  heading.className = 'debugging-cli-dock-heading';
  const headingLabel = document.createElement('span');
  headingLabel.innerHTML =
    `<i class="${UI_CLI_TOOLBAR.terminalIcon}" aria-hidden="true"></i> ` +
    (options.caption === UI_CLI_TOOLBAR.globalCaption
      ? UI_CLI_TOOLBAR.globalCaption
      : UI_CLI_TOOLBAR.contextualCaption);
  const headingActions = document.createElement('div');
  headingActions.className = 'debugging-cli-dock-heading-actions';
  let fontScalePercent = Math.max(
    MIN_UI_FONT_SCALE_PERCENT,
    Math.min(MAX_UI_FONT_SCALE_PERCENT, options.fontScalePercent ?? 100),
  );
  const scale = document.createElement('div');
  scale.className = 'font-scale debugging-cli-font-scale';
  scale.setAttribute('role', 'group');
  scale.setAttribute('aria-label', uiText().CliFontSize);
  const percentage = document.createElement('span');
  percentage.className = 'font-scale-value';
  percentage.setAttribute('aria-live', 'polite');
  const controls = document.createElement('span');
  controls.className = 'font-scale-controls';
  function scaleButton(label: string, icon: string, delta: number): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'font-scale-button';
    button.title = label;
    button.setAttribute('aria-label', label);
    const symbol = document.createElement('i');
    symbol.className = 'bi ' + icon;
    symbol.setAttribute('aria-hidden', 'true');
    button.append(symbol);
    button.addEventListener('click', () => setScale(fontScalePercent + delta));
    return button;
  }
  const increase = scaleButton(
    uiText().IncreaseCliFontSize,
    'bi-caret-up-fill',
    UI_FONT_SCALE_STEP_PERCENT,
  );
  const reset = document.createElement('button');
  reset.className = 'font-scale-reset';
  reset.type = 'button';
  reset.title = uiText().ResetCliFontSize;
  reset.setAttribute('aria-label', reset.title);
  reset.textContent = '●';
  reset.addEventListener('click', () => setScale(100));
  const decrease = scaleButton(
    uiText().DecreaseCliFontSize,
    'bi-caret-down-fill',
    -UI_FONT_SCALE_STEP_PERCENT,
  );
  controls.append(increase, reset, decrease);
  scale.append(percentage, controls);
  function setScale(value: number): void {
    const next = Math.max(MIN_UI_FONT_SCALE_PERCENT, Math.min(MAX_UI_FONT_SCALE_PERCENT, value));
    if (fontScalePercent !== next) options.fontScaleChanged?.(next);
    fontScalePercent = next;
    percentage.textContent = `${next}%`;
    percentage.setAttribute(
      'aria-label',
      uiText().format('@CM.CliFontSizeValue', { percent: next }),
    );
    increase.setAttribute('aria-disabled', String(next >= MAX_UI_FONT_SCALE_PERCENT));
    decrease.setAttribute('aria-disabled', String(next <= MIN_UI_FONT_SCALE_PERCENT));
    element.style.setProperty('--cli-local-scale', String(next / 100));
  }
  setScale(fontScalePercent);
  const detach = document.createElement('button');
  detach.className = 'btn-close-debug debugging-cli-detach';
  detach.type = 'button';
  let detached = options.detached ?? false;
  const updateDetach = (): void => {
    detach.title = uiText().select(detached, '@CM.AttachGlobalCli', '@CM.DetachGlobalCli');
    detach.setAttribute('aria-label', detach.title);
    detach.innerHTML = detached
      ? `<i class="${UI_CLI_TOOLBAR.attachIcon}" aria-hidden="true"></i>`
      : `<i class="${UI_CLI_TOOLBAR.detachIcon}" aria-hidden="true"></i>`;
    element.classList.toggle('debugging-cli-detached', detached);
    element.style.height = detached ? '100%' : `${preferredHeight}px`;
  };
  updateDetach();
  detach.addEventListener('click', () => options.detachRequested?.());
  const close = document.createElement('button');
  close.className = 'btn-close-debug';
  close.type = 'button';
  close.title = uiText().CloseCli;
  close.setAttribute('aria-label', close.title);
  close.textContent = '×';
  headingActions.append(scale);
  if (options.canDetach) headingActions.append(detach);
  headingActions.append(close);
  heading.append(headingLabel, headingActions);

  const consoleElement = document.createElement('div');
  consoleElement.className = 'debugging-cli-console';
  consoleElement.setAttribute('aria-live', 'polite');

  const transcriptElement = document.createElement('div');
  transcriptElement.className = 'debugging-cli-transcript';

  const inputLine = document.createElement('div');
  inputLine.className = 'debugging-cli-input-line';
  const promptWrap = document.createElement('div');
  promptWrap.className = 'debugging-cli-prompt-wrap';
  const prompt = document.createElement('button');
  prompt.className = 'debugging-cli-prompt';
  prompt.type = 'button';
  prompt.setAttribute('aria-expanded', 'false');
  const historyPopup = document.createElement('div');
  historyPopup.className = 'debugging-cli-history';
  historyPopup.setAttribute('role', 'listbox');
  historyPopup.setAttribute('aria-label', uiText().CliHistory);
  historyPopup.hidden = true;
  promptWrap.append(prompt, historyPopup);

  const input = document.createElement('textarea');
  input.className = 'debugging-cli-input';
  input.rows = 1;
  input.spellcheck = false;
  input.autocomplete = 'off';
  input.setAttribute('aria-label', uiText().DebugExpression);
  inputLine.append(promptWrap, input);
  consoleElement.append(transcriptElement, inputLine);
  element.append(resize, heading, consoleElement);

  const initialSession = options.initialSession;
  let currentPath = nearestExistingCtxPath(
    options.context,
    normalizeCtxCliPath(initialSession?.currentPath ?? options.startPath),
  );
  let transcriptSequence = initialSession?.transcriptSequence ?? 0;
  let transcript: readonly CliTranscriptEntry[] = initialSession?.transcript ?? [];
  let history: readonly string[] = options.historyRuntime?.entries ?? initialSession?.history ?? [];
  let historyIndex = initialSession?.historyIndex ?? history.length;
  let destroyed = false;
  let persistQueued = false;
  function captureSession(): UiPersistedCliSession | null {
    if (executing || destroyed) return null;
    return {
      currentPath,
      command: input.value,
      transcript,
      transcriptSequence,
      history,
      historyIndex,
    };
  }
  function notifySession(): void {
    if (persistQueued || destroyed) return;
    persistQueued = true;
    queueMicrotask(() => {
      persistQueued = false;
      const snapshot = captureSession();
      if (snapshot) options.sessionChanged?.(snapshot);
    });
  }
  let historyOpen = false;
  let historyListenerDocument: Document | null = null;
  let executing = false;

  function displayPath(): string {
    return formatCtxPath(currentPath);
  }

  function refreshLanguage(): void {
    resize.title = uiText().DragResize;
    scale.setAttribute('aria-label', uiText().CliFontSize);
    const labels = [
      uiText().IncreaseCliFontSize,
      uiText().ResetCliFontSize,
      uiText().DecreaseCliFontSize,
    ];
    [increase, reset, decrease].forEach((button, index) => {
      button.title = labels[index]!;
      button.setAttribute('aria-label', labels[index]!);
    });
    percentage.setAttribute(
      'aria-label',
      uiText().format('@CM.CliFontSizeValue', { percent: fontScalePercent }),
    );
    updateDetach();
    close.title = uiText().CloseCli;
    close.setAttribute('aria-label', close.title);
    historyPopup.setAttribute('aria-label', uiText().CliHistory);
    input.setAttribute('aria-label', uiText().DebugExpression);
    renderPrompt();
    if (historyOpen) renderHistory();
  }

  function renderPrompt(): void {
    prompt.textContent = `${displayPath()} >`;
    prompt.title = uiText().format('@CM.ExecutionContext', { path: displayPath() });
  }

  function renderTranscript(): void {
    transcriptElement.replaceChildren(
      ...transcript.map((entry) => {
        const row = document.createElement('pre');
        row.className = `debugging-cli-${entry.kind}`;
        row.textContent = entry.text;
        return row;
      }),
    );
    queueMicrotask(() => transcriptElement.scrollTo?.({ top: transcriptElement.scrollHeight }));
  }

  function renderHistory(): void {
    prompt.setAttribute('aria-expanded', String(historyOpen));
    historyPopup.hidden = !historyOpen;
    if (!historyOpen) {
      historyPopup.replaceChildren();
      return;
    }

    if (!history.length) {
      const empty = document.createElement('div');
      empty.className = 'debugging-cli-history-empty';
      empty.textContent = uiText().NoCommandsYet;
      historyPopup.replaceChildren(empty);
      return;
    }

    historyPopup.replaceChildren(
      ...[...history].reverse().map((command) => {
        const button = document.createElement('button');
        button.className = 'debugging-cli-history-item';
        button.type = 'button';
        button.setAttribute('role', 'option');
        button.dataset.cliHistoryCommand = command;
        button.textContent = command;
        return button;
      }),
    );
  }

  function append(kind: CliTranscriptEntry['kind'], text: string): void {
    transcript = [...transcript, Object.freeze({ id: ++transcriptSequence, kind, text })];
    renderTranscript();
    notifySession();
  }

  function pushHistory(source: string): void {
    if (options.historyRuntime) {
      options.historyRuntime.add(source);
      history = options.historyRuntime.entries;
    } else {
      const next = history[history.length - 1] === source ? [...history] : [...history, source];
      history = next.slice(-UI_CLI_HISTORY_LIMIT);
    }
    historyIndex = history.length;
    notifySession();
  }

  function setCommand(value: string, focus = false): void {
    input.value = value;
    resizeInput();
    notifySession();
    if (!focus) return;
    input.focus();
    input.setSelectionRange(value.length, value.length);
  }

  function navigateHistory(direction: -1 | 1): void {
    if (!history.length) return;
    historyIndex = Math.max(0, Math.min(history.length, historyIndex + direction));
    setCommand(historyIndex >= history.length ? '' : (history[historyIndex] ?? ''), true);
  }

  function toggleHistory(): void {
    historyOpen = !historyOpen;
    renderHistory();
    if (historyOpen) listenForHistoryClickAway();
    else removeHistoryClickAwayListener();
  }

  function closeHistory(): void {
    if (!historyOpen) return;
    historyOpen = false;
    renderHistory();
    removeHistoryClickAwayListener();
  }

  function listenForHistoryClickAway(): void {
    if (!historyOpen) return;
    const ownerDocument = element.ownerDocument;
    if (historyListenerDocument === ownerDocument) return;
    removeHistoryClickAwayListener();
    historyListenerDocument = ownerDocument;
    ownerDocument.addEventListener('pointerdown', closeHistoryFromDocument, true);
  }

  function removeHistoryClickAwayListener(): void {
    historyListenerDocument?.removeEventListener('pointerdown', closeHistoryFromDocument, true);
    historyListenerDocument = null;
  }

  function closeHistoryFromDocument(event: PointerEvent): void {
    if (!historyOpen) return;
    const target = event.target as Element;
    if (target.closest('.debugging-cli-prompt, .debugging-cli-history')) return;
    closeHistory();
  }

  function resizeInput(): void {
    input.style.height = 'auto';
    input.style.height = `${Math.max(input.scrollHeight, 22)}px`;
  }

  function selectedTranscriptText(): string {
    const selection = transcriptElement.ownerDocument.getSelection?.();
    if (!selection || selection.isCollapsed || !selection.rangeCount) return '';
    const text = selection.toString();
    if (!text.trim()) return '';
    const common = selection.getRangeAt(0).commonAncestorContainer;
    const owner = common.nodeType === 1 ? (common as Element) : common.parentElement;
    return owner && transcriptElement.contains(owner) ? text : '';
  }

  async function run(): Promise<void> {
    const source = input.value.trim();
    if (!source || executing) return;
    executing = true;
    append('command', `${displayPath()} > ${source}`);
    pushHistory(source);
    setCommand('');
    closeHistory();

    try {
      const result = await executeCtxCliCommand({
        context: options.context,
        currentPath,
        source,
        expressionCapabilityDelegate: options.expressionCapabilityDelegate,
        ...(options.expressionDiagnosticSink
          ? { expressionDiagnosticSink: options.expressionDiagnosticSink }
          : {}),
      });
      if (destroyed) return;
      currentPath = result.currentPath;
      notifySession();
      options.currentPathChanged?.(currentPath);
      renderPrompt();
      if (result.clearTranscript) {
        transcript = [];
        renderTranscript();
      }
      if (result.output !== undefined && result.output !== '') append('result', result.output);
    } catch (error) {
      if (!destroyed) append('error', error instanceof Error ? error.message : String(error));
    } finally {
      executing = false;
      if (!destroyed) notifySession();
    }
  }

  input.addEventListener(
    'input',
    () => {
      resizeInput();
      notifySession();
    },
    { signal: abortController.signal },
  );
  input.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        void run();
        return;
      }
      if (event.key === 'Escape') {
        closeHistory();
        return;
      }
      if (input.selectionStart !== input.selectionEnd || !history.length) return;
      if (event.key === 'ArrowUp' && input.selectionStart === 0) {
        event.preventDefault();
        navigateHistory(-1);
      } else if (event.key === 'ArrowDown' && input.selectionStart === input.value.length) {
        event.preventDefault();
        navigateHistory(1);
      }
    },
    { signal: abortController.signal },
  );
  prompt.addEventListener('click', toggleHistory, { signal: abortController.signal });
  historyPopup.addEventListener('mousedown', (event) => event.preventDefault(), {
    signal: abortController.signal,
  });
  historyPopup.addEventListener(
    'click',
    (event) => {
      const command = (event.target as Element).closest<HTMLElement>('[data-cli-history-command]')
        ?.dataset.cliHistoryCommand;
      if (command === undefined) return;
      historyIndex = history.length;
      setCommand(command, true);
      closeHistory();
    },
    { signal: abortController.signal },
  );
  consoleElement.addEventListener(
    'click',
    (event) => {
      const target = event.target as Element;
      if (target.closest('button, a, [role="option"]')) return;
      if (selectedTranscriptText()) return;
      input.focus();
    },
    { signal: abortController.signal },
  );
  consoleElement.addEventListener(
    'mouseup',
    () => {
      const text = selectedTranscriptText();
      if (text) {
        void transcriptElement.ownerDocument.defaultView?.navigator.clipboard?.writeText(text);
      }
    },
    { signal: abortController.signal },
  );
  close.addEventListener('click', options.closeRequested, { signal: abortController.signal });

  function resolveHeightPreference(value: number | null): number {
    return value === null ? 192 : Math.max(192, Math.min(576, Math.round(value)));
  }

  function applyHeightPreference(value: number | null): void {
    const nextPreferredHeight = resolveHeightPreference(value);
    if (nextPreferredHeight === preferredHeight) return;
    preferredHeight = nextPreferredHeight;
    element.dataset.debugPreferredHeight = String(preferredHeight);
    if (!detached) element.style.height = `${preferredHeight}px`;
  }

  const unsubscribeHistory = options.historyRuntime?.subscribe((entries) => {
    history = entries;
    historyIndex = entries.length;
    if (historyOpen) renderHistory();
  });

  if (initialSession?.command) input.value = initialSession.command;
  renderPrompt();
  renderHistory();
  renderTranscript();
  resizeInput();
  queueMicrotask(() => {
    if (destroyed) return;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  });

  return {
    element,
    retarget(path) {
      currentPath = nearestExistingCtxPath(options.context, normalizeCtxCliPath(path));
      renderPrompt();
      notifySession();
    },
    setHeightPreference(height) {
      applyHeightPreference(height);
    },
    refreshLanguage,
    ownerDocumentChanged() {
      closeHistory();
    },
    setDetached(value) {
      detached = value;
      updateDetach();
    },
    isExecuting() {
      return executing;
    },
    captureSession,
    destroy() {
      destroyed = true;
      removeHistoryClickAwayListener();
      unsubscribeHistory?.();
      abortController.abort();
      historyOpen = false;
      transcript = [];
      history = [];
      element.remove();
    },
  };
}
