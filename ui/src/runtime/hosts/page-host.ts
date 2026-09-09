import type { CommandRuntime } from '../commands/command-runtime.js';
import type { SurfaceContext } from '../surface/contracts.js';
import type {
  PageHostEnvironment,
  SurfaceContentRenderer,
  SurfaceHostMount,
} from './host-contracts.js';

/** Thin browser host for a page Surface. It owns page chrome/navigation only. */
export class PageHost {
  constructor(
    readonly environment: PageHostEnvironment,
    readonly commands: CommandRuntime,
  ) {}

  mount(surface: SurfaceContext, renderContent: SurfaceContentRenderer): SurfaceHostMount {
    if (surface.host !== 'page') throw new Error(`PageHost cannot mount ${surface.host} surface.`);

    const doc = this.environment.document;
    const shell = doc.createElement('section');
    shell.className = 'v2-page-host';
    shell.dataset.surfaceId = surface.id;
    shell.dataset.surfaceKind = surface.kind;
    shell.dataset.surfaceMode = surface.mode;

    const header = doc.createElement('header');
    header.className = 'v2-page-host__header';
    const title = doc.createElement('h1');
    title.className = 'v2-page-host__title';
    title.textContent = surface.presentation.title ?? surface.name;
    header.append(title);

    const contentRegion = doc.createElement('div');
    contentRegion.className = 'v2-page-host__content';
    const content = renderContent(surface);
    contentRegion.append(content.element);
    shell.append(header, contentRegion);
    this.environment.root.append(shell);

    let disposed = false;
    return {
      surfaceId: surface.id,
      host: 'page',
      element: shell,
      activate: () => {
        if (disposed) return;
        shell.hidden = false;
        shell.removeAttribute('inert');
      },
      deactivate: (preserveVisual = false) => {
        if (disposed) return;
        shell.hidden = !preserveVisual;
        shell.setAttribute('inert', '');
      },
      dispose: () => {
        if (disposed) return;
        disposed = true;
        content.dispose();
        shell.remove();
      },
    };
  }
}
