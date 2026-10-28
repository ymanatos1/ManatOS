import type { ExpressionDiagnostic, ExpressionDiagnosticSink } from '@manatos/shared';

import type { UiStateRuntime } from '../state/ui-state-runtime.js';

export interface UiDiagnosticEntry {
  readonly key: string;
  readonly diagnostic: ExpressionDiagnostic;
  readonly count: number;
}

export type UiDiagnosticsListener = (runtime: UiDiagnosticsRuntime) => void;
const UI_DIAGNOSTIC_ENTRY_LIMIT = 200;

export class UiDiagnosticsRuntime {
  private readonly listeners = new Set<UiDiagnosticsListener>();
  private readonly entriesValue = new Map<string, UiDiagnosticEntry>();
  private readonly unsubscribeUiState: () => void;
  private previousEnabled: boolean;

  readonly expressionDiagnosticSink: ExpressionDiagnosticSink = (diagnostic) => {
    this.reportExpressionDiagnostic(diagnostic);
  };

  constructor(private readonly uiState: UiStateRuntime) {
    this.previousEnabled = this.enabled;
    this.unsubscribeUiState = uiState.subscribe((change) => {
      if (change !== 'tab') return;

      const enabled = this.enabled;
      if (enabled === this.previousEnabled) return;
      this.previousEnabled = enabled;
      if (!enabled) this.entriesValue.clear();
      this.emit();
    });
  }

  get enabled(): boolean {
    return this.uiState.tab.debugger.diagnosticsVisible;
  }

  get entries(): readonly UiDiagnosticEntry[] {
    return [...this.entriesValue.values()];
  }

  get totalCount(): number {
    let total = 0;
    for (const entry of this.entriesValue.values()) total += entry.count;
    return total;
  }

  subscribe(listener: UiDiagnosticsListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setEnabled(enabled: boolean): void {
    this.uiState.updateSeedable((current) => ({
      ...current,
      debugger: { ...current.debugger, diagnosticsVisible: enabled },
    }));
  }

  clear(): void {
    if (!this.entriesValue.size) return;
    this.entriesValue.clear();
    this.emit();
  }

  /** Reprojections replace navigation evaluations; retain diagnostics from other sources. */
  clearNavigation(): void {
    let changed = false;
    for (const [key, entry] of this.entriesValue) {
      if (entry.diagnostic.caller?.source !== 'navigation') continue;
      this.entriesValue.delete(key);
      changed = true;
    }
    if (changed) this.emit();
  }

  reportExpressionDiagnostic(diagnostic: ExpressionDiagnostic): void {
    if (!this.enabled) return;

    const key = diagnosticKey(diagnostic);
    const existing = this.entriesValue.get(key);
    if (!existing && this.entriesValue.size >= UI_DIAGNOSTIC_ENTRY_LIMIT) {
      const oldest = this.entriesValue.keys().next().value as string | undefined;
      if (oldest !== undefined) this.entriesValue.delete(oldest);
    }
    this.entriesValue.set(
      key,
      existing ? { ...existing, count: existing.count + 1 } : { key, diagnostic, count: 1 },
    );
    this.emit();
  }

  destroy(): void {
    this.unsubscribeUiState();
    this.listeners.clear();
    this.entriesValue.clear();
  }

  private emit(): void {
    for (const listener of this.listeners) listener(this);
  }
}

function diagnosticKey(diagnostic: ExpressionDiagnostic): string {
  return JSON.stringify([
    diagnostic.phase,
    diagnostic.message,
    diagnostic.expression ?? '',
    diagnostic.variablePath ?? '',
    diagnostic.caller?.sourcePath ?? '',
    diagnostic.targetPath ?? '',
  ]);
}
