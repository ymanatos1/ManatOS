import type { ApiTrafficEntry } from '@manatos/shared-ui';

const DEFAULT_COLUMN_WIDTHS = [84, 56, 240, 52, 72] as const;
const MIN_COLUMN_WIDTHS = [62, 50, 120, 48, 60] as const;
const COLUMN_LABELS = ['Time', 'Method', 'Path', 'Status', 'Duration'] as const;

export interface ApiTrafficViewerListController {
  readonly element: HTMLElement;
  update(
    entries: readonly ApiTrafficEntry[],
    selectedId: number | null,
    columnWidthsPreference?: readonly number[],
  ): void;
  destroy(): void;
}

export function createApiTrafficViewerList(
  document: Document,
  selected: (id: number) => void,
  columnWidthsPreference: readonly number[] = [],
  columnWidthsChanged?: (widths: readonly number[]) => void,
): ApiTrafficViewerListController {
  const abortController = new AbortController();
  const element = document.createElement('div');
  element.className = 'api-traffic-list-host';
  element.dataset.debugFlexiblePanel = '';
  element.dataset.debugFlexiblePreferredHeight = '128';

  const headings = document.createElement('div');
  headings.className = 'api-traffic-columns';
  headings.setAttribute('aria-hidden', 'true');
  const list = document.createElement('div');
  list.className = 'api-traffic-list';
  list.setAttribute('role', 'list');
  list.setAttribute('aria-label', 'Captured API requests');
  list.dataset.multilingualAriaLabel = 'CapturedApiRequests';
  element.append(headings, list);

  let columnWidths = resolveColumnWidths(columnWidthsPreference);
  let resizingColumn = -1;
  let resizeStartX = 0;
  let resizeStartWidth = 0;

  function gridColumns(): string {
    return columnWidths.map((width) => `${width}px`).join(' ');
  }

  function applyColumns(): void {
    const columns = gridColumns();
    headings.style.gridTemplateColumns = columns;
    list.querySelectorAll<HTMLElement>('.api-traffic-row').forEach((row) => {
      row.style.gridTemplateColumns = columns;
    });
  }

  function renderHeadings(): void {
    headings.replaceChildren(
      ...COLUMN_LABELS.map((label, index) => {
        const heading = document.createElement('span');
        heading.className = 'api-traffic-column-heading';
        // Translate the caption child, not the containing column: replacing
        // the heading's textContent would also remove its resize handle.
        const caption = document.createElement('span');
        caption.textContent = label;
        caption.dataset.multilingualText = label;
        const handle = document.createElement('i');
        handle.className = 'api-traffic-column-resize';
        handle.title = 'Drag to resize column; double-click the header row to reset all columns';
        handle.dataset.multilingualTitle = 'ResizeApiColumn';
        handle.dataset.apiColumnResize = String(index);
        heading.append(caption, handle);
        return heading;
      }),
    );
    applyColumns();
  }

  headings.addEventListener(
    'dblclick',
    () => {
      columnWidths = [...DEFAULT_COLUMN_WIDTHS];
      applyColumns();
      columnWidthsChanged?.([]);
    },
    { signal: abortController.signal },
  );
  headings.addEventListener(
    'pointerdown',
    (event) => {
      const handle = (event.target as Element).closest<HTMLElement>('[data-api-column-resize]');
      if (!handle) return;
      event.stopPropagation();
      const index = Number(handle.dataset.apiColumnResize);
      if (!Number.isInteger(index)) return;
      resizingColumn = index;
      resizeStartX = event.clientX;
      resizeStartWidth = columnWidths[index] ?? DEFAULT_COLUMN_WIDTHS[index] ?? 80;
      handle.setPointerCapture(event.pointerId);
    },
    { signal: abortController.signal },
  );
  headings.addEventListener(
    'pointermove',
    (event) => {
      if (resizingColumn < 0) return;
      const next = [...columnWidths];
      next[resizingColumn] = Math.max(
        MIN_COLUMN_WIDTHS[resizingColumn] ?? 48,
        resizeStartWidth + event.clientX - resizeStartX,
      );
      columnWidths = next;
      applyColumns();
    },
    { signal: abortController.signal },
  );
  const stopResize = () => {
    if (resizingColumn < 0) return;
    resizingColumn = -1;
    columnWidthsChanged?.([...columnWidths]);
  };
  headings.addEventListener('pointerup', stopResize, { signal: abortController.signal });
  headings.addEventListener('pointercancel', stopResize, { signal: abortController.signal });
  list.addEventListener(
    'click',
    (event) => {
      const id = Number(
        (event.target as Element).closest<HTMLElement>('[data-api-entry-id]')?.dataset.apiEntryId,
      );
      if (Number.isInteger(id)) selected(id);
    },
    { signal: abortController.signal },
  );

  renderHeadings();

  return {
    element,
    update(entries, selectedId, nextColumnWidths) {
      if (nextColumnWidths) {
        const resolved = resolveColumnWidths(nextColumnWidths);
        if (!sameWidths(resolved, columnWidths)) {
          columnWidths = resolved;
          applyColumns();
        }
      }

      if (!entries.length) {
        const empty = document.createElement('div');
        empty.className = 'api-traffic-empty';
        empty.textContent = 'No API traffic matches the current view.';
        empty.dataset.multilingualText = 'NoMatchingApiTraffic';
        list.replaceChildren(empty);
        return;
      }

      list.replaceChildren(
        ...entries.map((entry) => {
          const row = document.createElement('button');
          row.type = 'button';
          row.className = 'api-traffic-row';
          row.dataset.apiEntryId = String(entry.id);
          row.style.gridTemplateColumns = gridColumns();
          row.classList.toggle('is-selected', entry.id === selectedId);
          row.classList.toggle('is-error', entry.ok === false);
          row.setAttribute('role', 'listitem');

          const time = document.createElement('span');
          time.textContent = formatTime(entry.startedAt);
          const method = document.createElement('span');
          method.className = 'api-traffic-method';
          method.textContent = entry.method;
          const path = document.createElement('span');
          path.className = 'api-traffic-path';
          path.title = entry.path;
          path.textContent = entry.path;
          const status = document.createElement('span');
          status.className = 'api-traffic-status';
          status.textContent = entry.status === null ? '…' : String(entry.status);
          const duration = document.createElement('span');
          duration.className = 'api-traffic-duration';
          duration.textContent = entry.durationMs === null ? '…' : `${entry.durationMs} ms`;
          row.append(time, method, path, status, duration);
          return row;
        }),
      );
    },
    destroy() {
      abortController.abort();
      element.remove();
    },
  };
}

function resolveColumnWidths(value: readonly number[]): number[] {
  if (value.length !== DEFAULT_COLUMN_WIDTHS.length) return [...DEFAULT_COLUMN_WIDTHS];
  return DEFAULT_COLUMN_WIDTHS.map((fallback, index) => {
    const width = value[index];
    return Number.isFinite(width)
      ? Math.max(MIN_COLUMN_WIDTHS[index] ?? 48, Math.round(width!))
      : fallback;
  });
}

function sameWidths(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleTimeString([], { hour12: false });
}
