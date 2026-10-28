import { multilingual } from '@manatos/shared-ui';
import {
  Component,
  DestroyRef,
  effect,
  computed,
  ElementRef,
  inject,
  OnChanges,
  OnDestroy,
  OnInit,
  SimpleChanges,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { type MetadataLanguage } from '@manatos/shared';
import type {
  ContextTreeRuntime,
  ExpressionCapabilityDelegate,
  ExpressionDiagnosticSink,
  ManatOSRuntimeRootContext,
} from '@manatos/shared';
import { FontScale } from '../preferences/FontScale';
import {
  executeCtxCliCommand,
  formatCtxPath,
  nearestExistingCtxPath,
  normalizeCtxCliPath,
  UI_CLI_HISTORY_LIMIT,
  UI_CLI_TOOLBAR,
  type UiCliHistoryRuntime,
} from '@manatos/shared-ui';
export interface CliTranscriptEntry {
  readonly id: number;
  readonly kind: 'command' | 'result' | 'error' | 'info';
  readonly text: string;
}

/** Logical CLI state transferred between attached and popup Angular hosts. */
export interface CliSessionSnapshot {
  readonly currentPath: string;
  readonly command: string;
  readonly transcript: readonly CliTranscriptEntry[];
  readonly transcriptSequence: number;
  readonly history: readonly string[];
  readonly historyIndex: number;
}

@Component({
  selector: 'manatos-debug-cli',
  standalone: true,
  imports: [FontScale],
  templateUrl: './Cli.html',
  styleUrl: './Cli.css',
  host: {
    'data-debug-resizable-panel': 'cli',
    '[attr.data-debug-preferred-height]': 'preferredHeight()',
    '[style.height.px]': 'detached() ? null : preferredHeight()',
    '[style.--cli-local-scale]': 'fontScalePercent() / 100',
  },
})
export class Cli implements OnInit, OnChanges, OnDestroy {
  protected readonly multilingual = computed(() => multilingual(this.language(), []));

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  readonly context = input.required<ContextTreeRuntime<ManatOSRuntimeRootContext>>();
  readonly startPath = input('ctx');
  readonly expressionCapabilityDelegate = input<ExpressionCapabilityDelegate | null>(null);
  readonly expressionDiagnosticSink = input<ExpressionDiagnosticSink | null>(null);
  readonly heightPreference = input<number | null>(null);
  readonly historyRuntime = input<UiCliHistoryRuntime | null>(null);
  readonly closeRequested = output<void>();
  readonly sessionChanged = output<CliSessionSnapshot>();
  readonly detachRequested = output<void>();
  readonly fontScaleChanged = output<number>();
  protected readonly toolbar = UI_CLI_TOOLBAR;
  readonly caption = input<string>(UI_CLI_TOOLBAR.globalCaption);
  readonly language = input<MetadataLanguage>('EN');

  readonly initialSession = input<CliSessionSnapshot | null>(null);
  private executing = false;
  constructor() {
    effect(() => {
      this.command();
      this.currentPath();
      this.transcript();
      // Persist live input and transcript independently of presentation host changes.
      queueMicrotask(() => {
        if (this.destroyRef.destroyed) return;
        const session = this.captureSession();
        if (session) this.sessionChanged.emit(session);
      });
    });
  }

  /** Do not destroy a CLI presentation during an unfinished async command. */
  captureSession(): CliSessionSnapshot | null {
    if (this.executing) return null;
    return {
      currentPath: this.currentPath(),
      command: this.command(),
      transcript: this.transcript(),
      transcriptSequence: this.transcriptSequence,
      history: this.history(),
      historyIndex: this.historyIndex,
    };
  }
  readonly fontScalePercent = input(100);
  readonly canDetach = input(false);
  readonly detached = input(false);
  readonly currentPathChanged = output<string>();
  private readonly inputElement = viewChild<ElementRef<HTMLTextAreaElement>>('commandInput');
  private readonly transcriptElement = viewChild<ElementRef<HTMLElement>>('transcriptElement');
  protected readonly currentPath = signal('ctx');
  protected readonly command = signal('');
  protected readonly transcript = signal<readonly CliTranscriptEntry[]>([]);
  protected readonly history = signal<readonly string[]>([]);
  protected readonly historyOpen = signal(false);
  protected readonly preferredHeight = computed(() =>
    this.resolveHeightPreference(this.heightPreference()),
  );
  private transcriptSequence = 0;
  private historyIndex = -1;
  private unsubscribeHistory: (() => void) | null = null;
  private historyListenerDocument: Document | null = null;
  private readonly closeHistoryFromDocument = (event: PointerEvent): void => {
    if (!this.historyOpen()) return;
    const target = event.target;
    if (
      target &&
      typeof (target as Element).closest === 'function' &&
      (target as Element).closest('.debugging-cli-prompt, .debugging-cli-history')
    )
      return;
    this.closeHistory();
  };
  ngOnInit(): void {
    this.retargetToStartPath();
    this.bindHistory();
    const session = this.initialSession();
    if (session) {
      this.currentPath.set(session.currentPath);
      this.command.set(session.command);
      this.transcript.set(session.transcript);
      this.transcriptSequence = session.transcriptSequence;
      if (!this.historyRuntime()) this.history.set(session.history);
      this.historyIndex = session.historyIndex;
    }
    queueMicrotask(() => {
      if (!this.destroyRef.destroyed) this.focusInput();
    });
  }
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['startPath'] && !changes['startPath'].firstChange) this.retargetToStartPath();
    if (changes['historyRuntime'] && !changes['historyRuntime'].firstChange) this.bindHistory();
  }
  ngOnDestroy(): void {
    this.closeHistory();
    this.unsubscribeHistory?.();
    this.unsubscribeHistory = null;
  }
  protected get displayPath(): string {
    return formatCtxPath(this.currentPath());
  }
  protected changeCommand(event: Event): void {
    const input = event.target as HTMLTextAreaElement;
    this.command.set(input.value);
    this.resizeInput(input);
  }
  protected handleKey(event: KeyboardEvent): void {
    const input = event.target as HTMLTextAreaElement;
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void this.run();
      return;
    }
    if (event.key === 'Escape') {
      this.closeHistory();
      return;
    }
    if (input.selectionStart !== input.selectionEnd || !this.history().length) return;
    if (event.key === 'ArrowUp' && input.selectionStart === 0) {
      event.preventDefault();
      this.navigateHistory(-1);
      return;
    }
    if (event.key === 'ArrowDown' && input.selectionStart === input.value.length) {
      event.preventDefault();
      this.navigateHistory(1);
    }
  }
  protected async run(): Promise<void> {
    const source = this.command().trim();
    if (!source || this.executing) return;
    this.executing = true;
    this.append('command', `${this.displayPath} > ${source}`);
    this.pushHistory(source);
    this.setCommand('');
    this.closeHistory();
    try {
      const expressionDiagnosticSink = this.expressionDiagnosticSink();
      const result = await executeCtxCliCommand({
        context: this.context(),
        currentPath: this.currentPath(),
        source,
        expressionCapabilityDelegate: this.expressionCapabilityDelegate(),
        ...(expressionDiagnosticSink ? { expressionDiagnosticSink } : {}),
      });
      if (this.destroyRef.destroyed) return;
      this.currentPath.set(result.currentPath);
      this.currentPathChanged.emit(result.currentPath);
      if (result.clearTranscript) this.transcript.set([]);
      if (result.output !== undefined && result.output !== '') this.append('result', result.output);
    } catch (error) {
      if (!this.destroyRef.destroyed)
        this.append('error', error instanceof Error ? error.message : String(error));
    } finally {
      this.executing = false;
    }
  }
  protected insertHistory(command: string): void {
    this.historyIndex = this.history().length;
    this.setCommand(command, true);
    this.closeHistory();
  }
  protected toggleHistory(): void {
    if (this.historyOpen()) {
      this.closeHistory();
      return;
    }
    this.historyOpen.set(true);
    queueMicrotask(() => {
      if (!this.destroyRef.destroyed) this.listenForHistoryClickAway();
    });
  }
  protected focusInputFromConsole(event: MouseEvent): void {
    const target = event.target;
    if (!target || typeof (target as Element).closest !== 'function') return;
    if ((target as Element).closest('button, a, [role="option"]')) return;
    if (this.selectedTranscriptText()) return;
    this.focusInput();
  }
  protected copySelectedTranscript(): void {
    const text = this.selectedTranscriptText();
    if (!text) return;
    const transcript = this.transcriptElement()?.nativeElement;
    void transcript?.ownerDocument.defaultView?.navigator.clipboard?.writeText(text);
  }
  private append(kind: CliTranscriptEntry['kind'], text: string): void {
    const entry = Object.freeze({ id: ++this.transcriptSequence, kind, text });
    this.transcript.update((entries) => [...entries, entry]);
    queueMicrotask(() => {
      const transcript = this.transcriptElement()?.nativeElement;
      transcript?.scrollTo?.({ top: transcript.scrollHeight });
    });
  }
  private pushHistory(source: string): void {
    const runtime = this.historyRuntime();
    if (runtime) {
      runtime.add(source);
      this.history.set(runtime.entries);
    } else {
      this.history.update((entries) => {
        const next = entries[entries.length - 1] === source ? [...entries] : [...entries, source];
        return next.slice(-UI_CLI_HISTORY_LIMIT);
      });
    }
    this.historyIndex = this.history().length;
  }
  private bindHistory(): void {
    this.unsubscribeHistory?.();
    this.unsubscribeHistory = null;
    const runtime = this.historyRuntime();
    if (!runtime) return;
    this.history.set(runtime.entries);
    this.historyIndex = runtime.entries.length;
    this.unsubscribeHistory = runtime.subscribe((entries) => {
      this.history.set(entries);
      this.historyIndex = entries.length;
    });
  }
  private navigateHistory(direction: -1 | 1): void {
    const history = this.history();
    if (!history.length) return;
    this.historyIndex = Math.max(0, Math.min(history.length, this.historyIndex + direction));
    this.setCommand(
      this.historyIndex >= history.length ? '' : (history[this.historyIndex] ?? ''),
      true,
    );
  }
  private retargetToStartPath(): void {
    const requested = normalizeCtxCliPath(this.startPath());
    this.currentPath.set(nearestExistingCtxPath(this.context(), requested));
  }
  private setCommand(value: string, focus = false): void {
    this.command.set(value);
    const input = this.inputElement()?.nativeElement;
    if (!input) return;
    input.value = value;
    this.resizeInput(input);
    if (focus) {
      input.focus();
      input.setSelectionRange(value.length, value.length);
    }
  }
  private focusInput(): void {
    this.inputElement()?.nativeElement.focus();
  }
  private listenForHistoryClickAway(): void {
    if (!this.historyOpen()) return;
    const document = this.host.nativeElement.ownerDocument;
    if (this.historyListenerDocument === document) return;
    this.removeHistoryClickAwayListener();
    this.historyListenerDocument = document;
    document.addEventListener('pointerdown', this.closeHistoryFromDocument, true);
  }
  private closeHistory(): void {
    this.historyOpen.set(false);
    this.removeHistoryClickAwayListener();
  }
  private removeHistoryClickAwayListener(): void {
    this.historyListenerDocument?.removeEventListener(
      'pointerdown',
      this.closeHistoryFromDocument,
      true,
    );
    this.historyListenerDocument = null;
  }
  private resizeInput(input: HTMLTextAreaElement): void {
    input.style.height = 'auto';
    input.style.height = `${Math.max(input.scrollHeight, 22)}px`;
  }
  private resolveHeightPreference(value: number | null): number {
    return value === null ? 192 : Math.max(192, Math.min(576, Math.round(value)));
  }
  private selectedTranscriptText(): string {
    const transcript = this.transcriptElement()?.nativeElement;
    const document = transcript?.ownerDocument;
    const selection = document?.getSelection?.();
    if (!transcript || !selection || selection.isCollapsed || !selection.rangeCount) return '';
    const text = selection.toString();
    if (!text.trim()) return '';
    const common = selection.getRangeAt(0).commonAncestorContainer;
    const element = common.nodeType === 1 ? (common as Element) : common.parentElement;
    return element && transcript.contains(element) ? text : '';
  }
}
