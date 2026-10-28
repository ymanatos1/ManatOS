import type { UiStatePersistence } from './ui-state-persistence.js';

export const UI_CLI_HISTORY_STORAGE_KEY = 'manatos.cli.history.global.v1';
export const UI_CLI_HISTORY_LIMIT = 100;
const UI_CLI_HISTORY_VERSION = 1 as const;
const UI_CLI_COMMAND_MAX_LENGTH = 8192;

export type UiCliHistoryListener = (entries: readonly string[]) => void;

export class UiCliHistoryRuntime {
  private readonly listeners = new Set<UiCliHistoryListener>();
  private entriesValue: readonly string[];

  constructor(private readonly persistence: UiStatePersistence) {
    this.entriesValue = parseCliHistory(persistence.readRawLocal(UI_CLI_HISTORY_STORAGE_KEY));
  }

  get entries(): readonly string[] {
    return this.entriesValue;
  }

  subscribe(listener: UiCliHistoryListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  add(command: string): void {
    const normalized = normalizeCommand(command);
    if (!normalized) return;

    const current = this.entriesValue;
    if (current[current.length - 1] === normalized) return;

    this.entriesValue = [...current, normalized].slice(-UI_CLI_HISTORY_LIMIT);
    this.persist();
    this.emit();
  }

  reload(): void {
    const next = parseCliHistory(this.persistence.readRawLocal(UI_CLI_HISTORY_STORAGE_KEY));
    if (sameEntries(this.entriesValue, next)) return;
    this.entriesValue = next;
    this.emit();
  }

  private persist(): void {
    this.persistence.writeRawLocal(
      UI_CLI_HISTORY_STORAGE_KEY,
      JSON.stringify({ version: UI_CLI_HISTORY_VERSION, entries: this.entriesValue }),
    );
  }

  private emit(): void {
    for (const listener of this.listeners) listener(this.entriesValue);
  }
}

function parseCliHistory(raw: string | null): readonly string[] {
  if (!raw) return [];
  try {
    const candidate = JSON.parse(raw) as unknown;
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return [];
    const document = candidate as Record<string, unknown>;
    if (document['version'] !== UI_CLI_HISTORY_VERSION || !Array.isArray(document['entries'])) {
      return [];
    }

    const entries: string[] = [];
    for (const value of document['entries']) {
      const command = normalizeCommand(value);
      if (!command) continue;
      if (entries[entries.length - 1] !== command) entries.push(command);
    }
    return entries.slice(-UI_CLI_HISTORY_LIMIT);
  } catch {
    return [];
  }
}

function normalizeCommand(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const command = value.trim();
  return command && command.length <= UI_CLI_COMMAND_MAX_LENGTH ? command : null;
}

function sameEntries(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
