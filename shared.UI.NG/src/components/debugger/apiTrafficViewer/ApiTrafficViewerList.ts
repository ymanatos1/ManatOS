import { multilingual } from '@manatos/shared-ui';
import {
  Component,
  OnChanges,
  SimpleChanges,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import type { ApiTrafficEntry } from '@manatos/shared-ui';

const DEFAULT_COLUMN_WIDTHS = [84, 56, 240, 52, 72] as const;
const MIN_COLUMN_WIDTHS = [62, 50, 120, 48, 60] as const;

@Component({
  selector: 'manatos-api-traffic-list',
  standalone: true,
  templateUrl: './ApiTrafficViewerList.html',
  styleUrl: './ApiTrafficViewerList.css',
  host: {
    'data-debug-flexible-panel': '',
    'data-debug-flexible-preferred-height': '128',
  },
})
export class ApiTrafficViewerList implements OnChanges {
  protected readonly multilingual = computed(() =>
    multilingual(this.language(), [
      'ResizeApiColumn',
      'CapturedApiRequests',
      'NoMatchingApiTraffic',
      'Time',
      'Method',
      'Path',
      'Status',
      'Duration',
    ] as const),
  );

  readonly language = input<'EN' | 'EL'>('EN');
  readonly entries = input.required<readonly ApiTrafficEntry[]>();
  readonly selectedId = input<number | null>(null);
  readonly columnWidthsPreference = input<readonly number[]>([]);
  readonly selected = output<number>();
  readonly columnWidthsChanged = output<readonly number[]>();

  protected readonly columnWidths = signal<readonly number[]>([...DEFAULT_COLUMN_WIDTHS]);
  protected readonly gridColumns = computed(() =>
    this.columnWidths()
      .map((width) => `${width}px`)
      .join(' '),
  );

  private resizingColumn = -1;
  private resizeStartX = 0;
  private resizeStartWidth = 0;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['columnWidthsPreference']) {
      this.columnWidths.set(this.resolveColumnWidths(this.columnWidthsPreference()));
    }
  }

  protected time(value: string): string {
    const date = new Date(value);
    return Number.isNaN(date.valueOf()) ? value : date.toLocaleTimeString([], { hour12: false });
  }

  protected resizeStart(index: number, event: PointerEvent): void {
    event.stopPropagation();
    this.resizingColumn = index;
    this.resizeStartX = event.clientX;
    this.resizeStartWidth = this.columnWidths()[index] ?? DEFAULT_COLUMN_WIDTHS[index] ?? 80;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  protected resizeMove(index: number, event: PointerEvent): void {
    if (this.resizingColumn !== index) return;
    const next = [...this.columnWidths()];
    next[index] = Math.max(
      MIN_COLUMN_WIDTHS[index] ?? 48,
      this.resizeStartWidth + event.clientX - this.resizeStartX,
    );
    this.columnWidths.set(next);
  }

  protected resizeEnd(index: number): void {
    if (this.resizingColumn !== index) return;
    this.resizingColumn = -1;
    this.columnWidthsChanged.emit(this.columnWidths());
  }

  protected resetColumns(): void {
    this.columnWidths.set([...DEFAULT_COLUMN_WIDTHS]);
    this.columnWidthsChanged.emit([]);
  }

  private resolveColumnWidths(value: readonly number[]): readonly number[] {
    if (value.length !== DEFAULT_COLUMN_WIDTHS.length) return [...DEFAULT_COLUMN_WIDTHS];
    return DEFAULT_COLUMN_WIDTHS.map((fallback, index) =>
      Math.max(MIN_COLUMN_WIDTHS[index] ?? 48, Math.round(value[index] ?? fallback)),
    );
  }
}
