import { EjsTransientMenus } from './transient-menu.js';

/**
 * Browser-document modal ownership for the native EJS adapter.
 *
 * A lease owns focus containment, restoration and scroll locking; individual
 * popup renderers own their DOM and the canonical UiPopupRuntime. Keeping these
 * responsibilities separate matches the Angular adapter without creating a
 * second modal or CTX model.
 */
export interface EjsModalLease {
  isTopmost(): boolean;
  release(): void;
}

type ModalEntry = Readonly<{
  id: number;
  previousFocus: HTMLElement | null;
  boundary: () => HTMLElement | null;
  debuggerForeground: () => boolean;
}>;

type DocumentLeaseState = {
  readonly entries: ModalEntry[];
  readonly originalOverflow: string;
  readonly onFocusIn: (event: FocusEvent) => void;
  sequence: number;
  redirecting: boolean;
};

const states = new WeakMap<Document, DocumentLeaseState>();
const focusable =
  'button:not([disabled]):not([hidden]), input:not([disabled]):not([hidden]), select:not([disabled]):not([hidden]), textarea:not([disabled]):not([hidden]), a[href], [tabindex]:not([tabindex="-1"])';

function tryFocus(element: HTMLElement | null, doc: Document): boolean {
  if (
    !element?.isConnected ||
    element.closest('[hidden], [inert]') ||
    element.getClientRects().length === 0
  )
    return false;
  element.focus();
  return doc.activeElement === element;
}

function restoreFocus(
  doc: Document,
  boundary: HTMLElement | null,
  preferred: HTMLElement | null,
): boolean {
  if (!boundary?.isConnected || boundary.closest('[hidden], [inert]')) return false;
  if (preferred && boundary.contains(preferred) && tryFocus(preferred, doc)) return true;
  for (const child of boundary.querySelectorAll<HTMLElement>(focusable)) {
    if (tryFocus(child, doc)) return true;
  }
  return tryFocus(boundary, doc);
}

/** Each document has one focus listener, regardless of popup nesting depth. */
export function acquireEjsModal(
  doc: Document,
  boundary: () => HTMLElement | null,
  debuggerForeground: () => boolean,
): EjsModalLease {
  let owner = states.get(doc);
  if (!owner) {
    const next: DocumentLeaseState = {
      entries: [],
      originalOverflow: doc.body.style.overflow,
      sequence: 0,
      redirecting: false,
      onFocusIn: (event) => {
        const active = next.entries[next.entries.length - 1];
        if (!active || next.redirecting || active.debuggerForeground()) return;
        const limit = active.boundary();
        // Body-portaled menus remain inside their owning modal's focus boundary.
        // A menu owned by a background modal is not exempt from this focus trap.
        const inOwnedOverlay =
          limit?.isConnected &&
          EjsTransientMenus.forDocument(doc).owns(limit, event.target as Node);
        if (!limit?.isConnected || limit.contains(event.target as Node) || inOwnedOverlay) return;
        next.redirecting = true;
        try {
          restoreFocus(doc, limit, null);
        } finally {
          next.redirecting = false;
        }
      },
    };
    doc.body.style.overflow = 'hidden';
    try {
      doc.addEventListener('focusin', next.onFocusIn, true);
    } catch (error) {
      doc.body.style.overflow = next.originalOverflow;
      throw error;
    }
    states.set(doc, next);
    owner = next;
  }

  const previousFocus = doc.activeElement instanceof HTMLElement ? doc.activeElement : null;
  const id = ++owner.sequence;
  owner.entries.push({ id, previousFocus, boundary, debuggerForeground });
  const current = owner;
  let released = false;
  return {
    isTopmost: () => !released && current.entries.at(-1)?.id === id,
    release: () => {
      if (released) return;
      released = true;
      const index = current.entries.findIndex((entry) => entry.id === id);
      if (index < 0) return;
      const wasTop = index === current.entries.length - 1;
      const [entry] = current.entries.splice(index, 1);
      if (!current.entries.length) {
        doc.removeEventListener('focusin', current.onFocusIn, true);
        doc.body.style.overflow = current.originalOverflow;
        states.delete(doc);
      }
      if (!wasTop) return;
      const underneath = current.entries.at(-1);
      if (underneath) {
        if (!underneath.debuggerForeground()) {
          restoreFocus(doc, underneath.boundary(), entry?.previousFocus ?? null);
        }
      } else {
        tryFocus(entry?.previousFocus ?? null, doc);
      }
    },
  };
}
