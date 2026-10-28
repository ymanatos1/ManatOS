/**
 * Document-scoped modal ownership. Each lease owns its boundary and its own
 * previous focus. Only the top lease may contain keyboard focus, except when
 * its host explicitly allows external focus (for example, the debugger).
 */
export interface UiModalLease {
  readonly isTopmost: () => boolean;
  release(): void;
}

interface ActiveModal {
  readonly id: number;
  readonly previousFocus: HTMLElement | null;
  readonly boundary: () => HTMLElement | null;
  readonly allowExternalFocus: () => boolean;
}

interface DocumentState {
  readonly entries: ActiveModal[];
  readonly originalOverflow: string;
  readonly onFocusIn: (event: FocusEvent) => void;
  nextId: number;
  focusing: boolean;
}

const focusable =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

function focusAndVerify(doc: Document, element: HTMLElement | null): boolean {
  if (
    !element?.isConnected ||
    element.closest('[hidden], [inert]') ||
    element.getClientRects().length === 0
  )
    return false;
  element.focus();
  return doc.activeElement === element;
}

function restoreWithin(
  doc: Document,
  boundary: HTMLElement | null,
  preferred: HTMLElement | null,
): boolean {
  if (!boundary?.isConnected || boundary.closest('[hidden], [inert]')) return false;
  if (preferred && boundary.contains(preferred) && focusAndVerify(doc, preferred)) return true;
  const candidates = boundary.querySelectorAll<HTMLElement>(focusable);
  for (const candidate of candidates) {
    if (focusAndVerify(doc, candidate)) return true;
  }
  // A modal boundary can receive focus if its host explicitly sets tabindex.
  return focusAndVerify(doc, boundary);
}

export class UiModalHost {
  private readonly documents = new WeakMap<Document, DocumentState>();

  acquire(
    doc: Document = document,
    boundary: () => HTMLElement | null = () => null,
    allowExternalFocus: () => boolean = () => false,
  ): UiModalLease {
    let state = this.documents.get(doc);
    if (!state) {
      const owner: DocumentState = {
        entries: [],
        originalOverflow: doc.body.style.overflow,
        nextId: 0,
        focusing: false,
        onFocusIn: (event) => {
          const top = owner.entries[owner.entries.length - 1];
          if (!top || owner.focusing || top.allowExternalFocus()) return;
          const limit = top.boundary();
          if (!limit?.isConnected || limit.contains(event.target as Node)) return;
          if (
            event.target instanceof Element &&
            event.target.closest('[data-manatos-transient-overlay]')
          )
            return;
          owner.focusing = true;
          try {
            restoreWithin(doc, limit, null);
          } finally {
            owner.focusing = false;
          }
        },
      };
      state = owner;
      // Commit state only once both browser resources have been acquired.
      doc.body.style.overflow = 'hidden';
      try {
        doc.addEventListener('focusin', owner.onFocusIn, true);
      } catch (error) {
        doc.body.style.overflow = owner.originalOverflow;
        throw error;
      }
      this.documents.set(doc, owner);
    }
    const previousFocus = doc.activeElement instanceof HTMLElement ? doc.activeElement : null;
    const id = ++state.nextId;
    state.entries.push({ id, previousFocus, boundary, allowExternalFocus });
    const owner = state;
    let released = false;
    return {
      isTopmost: () => !released && owner.entries[owner.entries.length - 1]?.id === id,
      release: () => {
        if (released) return;
        released = true;
        const index = owner.entries.findIndex((entry) => entry.id === id);
        if (index < 0) return;
        const topmost = index === owner.entries.length - 1;
        const [entry] = owner.entries.splice(index, 1);
        if (owner.entries.length === 0) {
          doc.removeEventListener('focusin', owner.onFocusIn, true);
          doc.body.style.overflow = owner.originalOverflow;
          this.documents.delete(doc);
        }
        if (!topmost) return;
        const next = owner.entries[owner.entries.length - 1];
        if (next) {
          if (!next.allowExternalFocus()) restoreWithin(doc, next.boundary(), entry.previousFocus);
        } else if (entry.previousFocus) {
          focusAndVerify(doc, entry.previousFocus);
        }
      },
    };
  }
}

export const uiModalHost = new UiModalHost();
