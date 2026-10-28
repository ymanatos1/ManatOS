import { DetachedWindowHost, type UiWindowPlacement } from '@manatos/shared-ui';

export interface DetachableWindowRenderOptions {
  content: string;
}

export interface DetachableWindowMountOptions {
  title: string;
  windowName: string;
  subject?: string;
  detachedClass?: string;
  layoutCss?: string;
  loadPlacement?: () => UiWindowPlacement | null;
  savePlacement?: (placement: UiWindowPlacement) => void;
  detachedChanged?: (detached: boolean) => void;
}

export interface DetachableWindowController {
  readonly detached: boolean;
  toggle(): void;
  attach(focusMain?: boolean): void;
  destroy(): void;
}

export function renderDetachableWindow(options: DetachableWindowRenderOptions): string {
  return `<div class="detachable-window" data-detachable-window>${options.content}</div>`;
}

export function mountDetachableWindow(
  surface: HTMLElement,
  options: DetachableWindowMountOptions,
): DetachableWindowController {
  const subject = options.subject ?? 'surface';
  const host = new DetachedWindowHost({
    title: options.title,
    windowName: options.windowName,
    detachedClass: options.detachedClass ?? 'is-detached-window',
    layoutCss: options.layoutCss,
    loadPlacement: options.loadPlacement,
    savePlacement: options.savePlacement,
    detachedChanged: (detached) => {
      updateToggle(detached);
      options.detachedChanged?.(detached);
    },
  });

  const onClick = (event: Event): void => {
    const target = event.target as HTMLElement | null;
    if (!target?.closest('[data-detach-toggle]')) return;
    event.preventDefault();
    event.stopPropagation();
    host.toggle(surface);
  };

  const updateToggle = (detached: boolean): void => {
    const button = surface.querySelector<HTMLButtonElement>('[data-detach-toggle]');
    if (!button) return;

    const title = `${detached ? 'Attach' : 'Detach'} ${subject}`;
    button.title = title;
    button.setAttribute('aria-label', title);
    button.setAttribute('aria-pressed', String(detached));

    const icon = button.querySelector<HTMLElement>('.bi');
    if (icon) {
      icon.className = `bi ${detached ? 'bi-box-arrow-in-down-left' : 'bi-box-arrow-up-right'}`;
    }
  };

  surface.addEventListener('click', onClick);
  updateToggle(false);

  return {
    get detached() {
      return host.detached;
    },
    toggle() {
      host.toggle(surface);
    },
    attach(focusMain = false) {
      host.attach(focusMain);
    },
    destroy() {
      surface.removeEventListener('click', onClick);
      host.destroy();
    },
  };
}
