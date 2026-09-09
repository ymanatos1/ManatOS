import type { CommandRuntime } from '../commands/command-runtime.js';
import type { SurfaceContext } from '../surface/contracts.js';
import type {
  PopupHostEnvironment,
  SurfaceContentRenderer,
  SurfaceHostMount,
} from './host-contracts.js';

/**
 * Thin popup chrome. Content determines its natural height; the host imposes
 * only viewport safety limits, so ordinary forms do not acquire scrollbars.
 */
export class PopupHost {
  constructor(
    readonly environment: PopupHostEnvironment,
    readonly commands: CommandRuntime,
  ) {}

  mount(surface: SurfaceContext, renderContent: SurfaceContentRenderer): SurfaceHostMount {
    if (surface.host !== 'popup')
      throw new Error(`PopupHost cannot mount ${surface.host} surface.`);

    const doc = this.environment.document;
    const previousFocus = doc.activeElement instanceof HTMLElement ? doc.activeElement : null;
    const backdrop = doc.createElement('div');
    backdrop.className = 'v2-popup-host';
    backdrop.dataset.surfaceId = surface.id;
    backdrop.dataset.surfaceKind = surface.kind;
    backdrop.dataset.surfaceMode = surface.mode;

    const dialog = doc.createElement('section');
    dialog.className = 'v2-popup-host__dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');

    const header = doc.createElement('header');
    header.className = 'v2-popup-host__header';
    const title = doc.createElement('h2');
    title.className = 'v2-popup-host__title';
    title.textContent = surface.presentation.title ?? surface.name;
    const close = doc.createElement('button');
    close.type = 'button';
    close.className = 'v2-popup-host__close';
    close.setAttribute('aria-label', 'Close');
    close.textContent = '×';
    close.addEventListener('click', () => {
      void this.commands.execute({ name: 'surface.close', surfaceId: surface.id, payload: {} });
    });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        void this.commands.execute({ name: 'surface.close', surfaceId: surface.id, payload: {} });
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = [
        ...dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((element) => !element.hidden);
      if (!focusable.length) {
        event.preventDefault();
        close.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && doc.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && doc.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    dialog.addEventListener('keydown', onKeyDown);
    header.append(title, close);

    const body = doc.createElement('div');
    body.className = 'v2-popup-host__body';
    const content = renderContent(surface);
    body.append(content.element);
    dialog.append(header, body);
    backdrop.append(dialog);
    this.environment.root.append(backdrop);

    let disposed = false;
    return {
      surfaceId: surface.id,
      host: 'popup',
      element: backdrop,
      activate: () => {
        if (disposed) return;
        backdrop.hidden = false;
        backdrop.removeAttribute('inert');
        close.focus({ preventScroll: true });
      },
      deactivate: (preserveVisual = false) => {
        if (disposed) return;
        backdrop.hidden = !preserveVisual;
        backdrop.setAttribute('inert', '');
      },
      dispose: () => {
        if (disposed) return;
        disposed = true;
        dialog.removeEventListener('keydown', onKeyDown);
        content.dispose();
        backdrop.remove();
        if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
      },
    };
  }
}
