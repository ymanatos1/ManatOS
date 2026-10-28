import { multilingual, type UiPagePresentation } from '@manatos/shared-ui';

import { renderBreadcrumb } from './Breadcrumb.js';
import { renderDetailsToggle } from './DetailsToggle.js';
import { renderPageContent } from './PageContent.js';
import { renderPageDetails } from './PageDetails.js';
import { renderPageTitle } from './PageTitle.js';

export interface PageOptions {
  presentation: UiPagePresentation;
  content: string;
  detailsId?: string;
  headingActions?: string;
  titleActions?: string;
  detailsContent?: string;
  language?: 'EN' | 'EL';
}

export interface MountedPage {
  /** The transient details model survives a same-app page presentation change. */
  detailsVisible(): boolean;
  /** Reconcile page chrome without replacing the owning Page or content host. */
  updatePresentation(options: Omit<PageOptions, 'content'>, preserveDetails?: boolean): void;
  destroy(): void;
}

export class Page {
  constructor(protected readonly options: PageOptions) {}

  protected renderHeadingActions(): string {
    const details = this.options.presentation.details;

    const detailsToggle = details.available
      ? renderDetailsToggle({
          controlsId: this.options.detailsId ?? 'pageDetails',
          label: multilingual(this.options.language ?? 'EN', ['Details']).Details,
        })
      : '';

    return `${detailsToggle}${this.options.headingActions ?? ''}`;
  }

  protected renderDetails(): string {
    const details = this.options.presentation.details;

    if (!details.available) return '';

    return renderPageDetails({
      id: this.options.detailsId ?? 'pageDetails',
      language: this.options.language,
      eyebrow: details.eyebrow,
      title:
        details.title === 'Details'
          ? multilingual(this.options.language ?? 'EN', ['Details']).Details
          : details.title,
      ...(details.message !== undefined ? { message: details.message } : {}),
      ...(this.options.detailsContent !== undefined
        ? { content: this.options.detailsContent }
        : {}),
    });
  }

  render(): string {
    return `
      <section class="page" data-manatos-page>
        <div class="page-main">
          ${renderBreadcrumb({
            items: this.options.presentation.breadcrumb,
            language: this.options.language,
            actions: this.renderHeadingActions(),
          })}

          ${renderPageTitle({
            model: this.options.presentation.title,
            ...(this.options.titleActions !== undefined
              ? { actions: this.options.titleActions }
              : {}),
          })}

          ${renderPageContent({ content: this.options.content })}
        </div>

        ${this.renderDetails()}
      </section>
    `;
  }
}

export function renderPage(options: PageOptions): string {
  return new Page(options).render();
}

/**
 * The EJS Page owns the same stable outer presentation as NG1's Page component.
 * Its click listener is delegated to that root, so replacing a changed title or
 * details panel never leaves listeners attached to discarded controls.
 */
export function mountPage(scope: ParentNode = document, initiallyVisible = false): MountedPage {
  const page = scope.querySelector<HTMLElement>('[data-manatos-page]');
  if (!page) throw new Error('EJS1 Page is not mounted.');

  let detailsVisible = initiallyVisible;
  let destroyed = false;

  const setVisible = (visible: boolean): void => {
    const details = page.querySelector<HTMLElement>('[data-page-details]');
    const toggle = page.querySelector<HTMLButtonElement>('[data-page-details-toggle]');
    detailsVisible = visible && details !== null && toggle !== null;
    page.classList.toggle('has-details', detailsVisible);
    if (details) {
      details.hidden = !detailsVisible;
      details.setAttribute('aria-hidden', String(!detailsVisible));
    }
    if (toggle) {
      toggle.classList.toggle('active', detailsVisible);
      toggle.setAttribute('aria-expanded', String(detailsVisible));
    }
  };

  const onClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('[data-page-details-toggle]')) {
      setVisible(!detailsVisible);
    } else if (target.closest('[data-page-details-close]')) {
      setVisible(false);
    }
  };
  page.addEventListener('click', onClick);
  setVisible(initiallyVisible);

  return {
    detailsVisible: () => detailsVisible,
    updatePresentation(options, preserveDetails = false): void {
      if (destroyed) return;
      // Parse the new semantic chrome away from the live document. Only actual
      // changes replace their individual nodes; Page, PageContent and PageHost
      // retain their identity and any independently owned event handlers.
      const template = page.ownerDocument.createElement('template');
      template.innerHTML = new Page({ ...options, content: '' }).render();
      const nextPage = template.content.querySelector<HTMLElement>('[data-manatos-page]');
      const main = page.querySelector<HTMLElement>('.page-main');
      if (!nextPage || !main) return;

      const reconcile = (current: Element | null, next: Element | null): void => {
        if (current && next && current.outerHTML !== next.outerHTML) current.replaceWith(next);
      };

      const breadcrumb = main.querySelector(':scope > .breadcrumb-row');
      const nextBreadcrumb = nextPage.querySelector('.page-main > .breadcrumb-row');
      reconcile(
        breadcrumb?.querySelector('.page-breadcrumb') ?? null,
        nextBreadcrumb?.querySelector('.page-breadcrumb') ?? null,
      );

      const actions = breadcrumb?.querySelector('.breadcrumb-actions') ?? null;
      const nextActions = nextBreadcrumb?.querySelector('.breadcrumb-actions') ?? null;
      if (actions && nextActions) {
        const normalized = actions.cloneNode(true) as Element;
        const toggle = normalized.querySelector('[data-page-details-toggle]');
        toggle?.classList.remove('active');
        toggle?.setAttribute('aria-expanded', 'false');
        if (normalized.outerHTML !== nextActions.outerHTML) {
          const liveToggle = actions.querySelector('[data-page-details-toggle]');
          const replacementToggle = nextActions.querySelector('[data-page-details-toggle]');
          // Preserve the interactive toggle when another heading action changes.
          if (
            toggle &&
            liveToggle &&
            replacementToggle &&
            toggle.outerHTML === replacementToggle.outerHTML
          ) {
            replacementToggle.replaceWith(liveToggle);
          }
          actions.replaceWith(nextActions);
        }
      }

      const title = main.querySelector(':scope > .page-title');
      const nextTitle = nextPage.querySelector('.page-main > .page-title');
      reconcile(
        title?.querySelector('.surface-title-copy') ?? null,
        nextTitle?.querySelector('.surface-title-copy') ?? null,
      );
      reconcile(
        title?.querySelector('.surface-title-actions') ?? null,
        nextTitle?.querySelector('.surface-title-actions') ?? null,
      );

      const currentDetails = page.querySelector<HTMLElement>(':scope > [data-page-details]');
      const nextDetails = nextPage.querySelector<HTMLElement>(':scope > [data-page-details]');
      if (currentDetails && !nextDetails) currentDetails.remove();
      else if (!currentDetails && nextDetails) page.append(nextDetails);
      else if (currentDetails && nextDetails) {
        // Ignore the runtime hidden/expanded state when comparing semantic
        // details. The state is restored below, not rebuilt on every repaint.
        const currentHidden = currentDetails.hidden;
        currentDetails.hidden = true;
        currentDetails.setAttribute('aria-hidden', 'true');
        const unchanged = currentDetails.outerHTML === nextDetails.outerHTML;
        if (unchanged) {
          currentDetails.hidden = currentHidden;
          currentDetails.setAttribute('aria-hidden', String(currentHidden));
        } else {
          currentDetails.replaceWith(nextDetails);
        }
      }
      setVisible(preserveDetails ? detailsVisible : false);
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      page.removeEventListener('click', onClick);
    },
  };
}
