import type { ApiTrafficEntry } from '@manatos/shared-ui';

export interface ApiTrafficViewerCaptionController {
  readonly element: HTMLElement;
  update(entry: ApiTrafficEntry | null): void;
  destroy(): void;
}

export function createApiTrafficViewerCaption(
  document: Document,
  entry: ApiTrafficEntry | null,
): ApiTrafficViewerCaptionController {
  const element = document.createElement('div');
  element.className = 'api-traffic-caption';

  function render(value: ApiTrafficEntry | null): void {
    const heading = document.createElement('strong');
    heading.textContent = 'API TRAFFIC';
    heading.dataset.multilingualText = 'ApiTrafficTitle';
    if (!value) {
      const empty = document.createElement('span');
      empty.textContent = 'Select a request to inspect it.';
      empty.dataset.multilingualText = 'SelectApiRequest';
      element.replaceChildren(heading, empty);
      return;
    }

    const call = document.createElement('code');
    call.title = value.requestId;
    call.textContent = `${value.method} ${value.path}`;
    const status = document.createElement('span');
    status.textContent = value.status === null ? '…' : String(value.status);
    element.replaceChildren(heading, call, status);
  }

  render(entry);
  return {
    element,
    update: render,
    destroy() {
      element.remove();
    },
  };
}
