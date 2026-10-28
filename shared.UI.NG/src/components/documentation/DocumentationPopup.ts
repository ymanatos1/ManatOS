import { multilingual } from '@manatos/shared-ui';
import { type MetadataLanguage } from '@manatos/shared';
import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
  computed,
} from '@angular/core';

import {
  type ApplicationState,
  applyDocumentFontScale,
  BrowserUiPageContentSource,
  UI_DOCUMENTATION_PAGE,
  ensureUiPageStylesheet,
  mountDocumentationBrowser,
  renderUiPage,
  documentationPopupState,
  type DocumentationBrowserHost,
  type DocumentationLocation,
  type DocumentationPopupState,
  type UiTitleModel,
} from '@manatos/shared-ui';

import { FontScale } from '../preferences/FontScale';
import { Footer } from '../shell/Footer';
import { PopupTitleDocs } from '../surfaces/PopupTitleDocs';
import { SurfaceAction } from '../surfaces/SurfaceAction';

@Component({
  selector: 'manatos-documentation-popup',
  standalone: true,
  imports: [PopupTitleDocs, SurfaceAction, FontScale, Footer],
  templateUrl: './DocumentationPopup.html',
  styleUrl: './DocumentationPopup.css',
})
export class DocumentationPopup implements AfterViewInit, OnDestroy {
  protected readonly multilingual = computed(() => multilingual(this.language(), []));

  readonly state = input.required<ApplicationState>();
  readonly initialLocation = input.required<DocumentationLocation>();
  readonly initialFontScalePercent = input.required<number>();

  readonly openNewRequested = output<DocumentationPopupState>();
  readonly attachRequested = output<DocumentationLocation>();
  readonly closeAllRequested = output<void>();

  protected get title(): UiTitleModel {
    return { title: this.multilingual().resolve('@CM.ManatOSDocumentation'), icon: 'bi-book' };
  }

  protected language(): MetadataLanguage {
    return this.state().currentLanguage.id.toUpperCase() === 'EL' ? 'EL' : 'EN';
  }

  protected readonly fontScalePercent = signal(100);

  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly browserContainer = viewChild.required<ElementRef<HTMLElement>>('browser');
  private readonly source = new BrowserUiPageContentSource();
  private documentationHost: DocumentationBrowserHost | null = null;
  private loadRevision = 0;
  private unsubscribeLanguage: (() => void) | null = null;

  constructor() {
    effect(() => {
      applyDocumentFontScale(this.element.nativeElement.ownerDocument, this.fontScalePercent());
    });
  }

  ngAfterViewInit(): void {
    this.fontScalePercent.set(this.initialFontScalePercent());
    this.unsubscribeLanguage = this.state().subscribe((change) => {
      if (change === 'language') void this.mountBrowser(this.getLocation());
    });
    void this.mountBrowser();
  }

  ngOnDestroy(): void {
    this.loadRevision += 1;
    this.unsubscribeLanguage?.();
    this.unsubscribeLanguage = null;
    this.documentationHost?.destroy();
    this.documentationHost = null;
  }

  protected setFontScalePercent(percent: number): void {
    this.fontScalePercent.set(percent);
  }

  protected openNew(): void {
    this.openNewRequested.emit(
      documentationPopupState(this.getLocation(), this.fontScalePercent()),
    );
  }

  protected attach(): void {
    this.attachRequested.emit(this.getLocation());
  }

  getLocation(): DocumentationLocation {
    return this.documentationHost?.getLocation() ?? this.initialLocation();
  }

  private async mountBrowser(location = this.initialLocation()): Promise<void> {
    const revision = ++this.loadRevision;
    const container = this.browserContainer().nativeElement;

    try {
      const html = await renderUiPage(
        this.source,
        UI_DOCUMENTATION_PAGE,
        Object.freeze({ $language: this.state().currentLanguage.id }),
      );
      if (revision !== this.loadRevision) return;

      ensureUiPageStylesheet(UI_DOCUMENTATION_PAGE, container.ownerDocument);
      container.innerHTML = html;

      const browser = container.querySelector<HTMLElement>('[data-documentation-browser]');
      if (!browser) throw new Error('Documentation popup browser content is missing.');

      this.documentationHost?.destroy();
      this.documentationHost = mountDocumentationBrowser(browser, undefined, location, (location) =>
        this.state().rememberDocumentationPage(location),
      );
    } catch (error) {
      if (revision !== this.loadRevision) return;
      container.textContent =
        error instanceof Error ? error.message : 'Documentation could not be loaded.';
    }
  }
}
