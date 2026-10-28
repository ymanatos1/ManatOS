import { Component, ElementRef, OnDestroy, effect, input, output, viewChild } from '@angular/core';

import {
  BrowserUiPageContentSource,
  UI_ERROR_PAGE,
  ensureUiPageStylesheet,
  mountDocumentationBrowser,
  renderUiPage,
  type DocumentationBrowserHost,
  type DocumentationLocation,
  type UiPageIdentity,
  type UiPageTemplateContext,
} from '@manatos/shared-ui';

@Component({
  selector: 'manatos-page-host',
  standalone: true,
  templateUrl: './PageHost.html',
  styleUrl: './PageHost.css',
})
export class PageHost implements OnDestroy {
  readonly page = input.required<UiPageIdentity>();

  readonly context = input.required<UiPageTemplateContext>();
  readonly language = input<string>('en');

  readonly documentationLocationChanged = output<DocumentationLocation>();

  private readonly host = viewChild<ElementRef<HTMLElement>>('host');

  private readonly source = new BrowserUiPageContentSource();

  private documentationHost: DocumentationBrowserHost | null = null;

  private pendingDocumentationLocation: DocumentationLocation | null = null;

  private loadRevision = 0;

  ngOnDestroy(): void {
    this.loadRevision += 1;
    this.documentationHost?.destroy();
    this.documentationHost = null;
  }

  constructor() {
    effect(() => {
      const host = this.host();
      const page = this.page();
      const context = this.context();
      const language = this.language();

      if (!host) return;

      void this.render(host.nativeElement, page, { ...context, $language: language });
    });
  }

  getDocumentationLocation(): DocumentationLocation | null {
    return this.documentationHost?.getLocation() ?? this.pendingDocumentationLocation;
  }

  navigateDocumentation(location: DocumentationLocation): void {
    if (this.documentationHost) {
      this.documentationHost.navigate(location);
      return;
    }

    this.pendingDocumentationLocation = location;
  }

  private async render(
    host: HTMLElement,
    page: UiPageIdentity,
    context: UiPageTemplateContext,
  ): Promise<void> {
    const revision = ++this.loadRevision;

    try {
      const html = await renderUiPage(this.source, page, context);

      if (revision !== this.loadRevision) {
        return;
      }

      this.present(host, page, html);
    } catch (error) {
      if (revision !== this.loadRevision) {
        return;
      }

      const errorContext = Object.freeze({
        ...context,

        errorMessage: error instanceof Error ? error.message : String(error),
      });

      try {
        const html = await renderUiPage(this.source, UI_ERROR_PAGE, errorContext);
        // An earlier fallback must never overwrite a newer page or language.
        if (revision !== this.loadRevision) return;
        this.present(host, UI_ERROR_PAGE, html);
      } catch {
        if (revision === this.loadRevision)
          this.presentText(host, 'ManatOS could not prepare this page.');
      }
    }
  }

  private present(host: HTMLElement, page: UiPageIdentity, html: string): void {
    this.documentationHost?.destroy();
    this.documentationHost = null;

    ensureUiPageStylesheet(page);

    host.innerHTML = html;

    const documentation = host.querySelector<HTMLElement>('[data-documentation-browser]');

    if (documentation) {
      this.documentationHost = mountDocumentationBrowser(
        documentation,
        undefined,
        undefined,
        (location) => this.documentationLocationChanged.emit(location),
      );

      if (this.pendingDocumentationLocation) {
        this.documentationHost.navigate(this.pendingDocumentationLocation);
        this.pendingDocumentationLocation = null;
      }
    }
  }

  private presentText(host: HTMLElement, message: string): void {
    this.documentationHost?.destroy();
    this.documentationHost = null;

    host.textContent = message;
  }
}
