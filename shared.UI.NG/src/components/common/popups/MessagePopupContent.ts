/** UIS boundary: Messages own localized explanation/trace rendering and async static pages; the popup shell only provides modal/CTX lifecycle. This ownership separation is intentional; preserve it in future migrations. */
import { Component, computed, effect, input, signal } from '@angular/core';
import {
  resolveMetadataText,
  type UiPageIdentity,
  type MultilingualLiteral,
  type MetadataLanguage,
} from '@manatos/shared';
import {
  multilingual,
  BrowserUiPageContentSource,
  renderUiPage,
  type UiPageTemplateContext,
} from '@manatos/shared-ui';
import { PopupContext } from '../../surfaces/PopupContext';

/**
 * Specialized message body ONLY. No modal, CTX owner, action handling or lifecycle.
 * Loads a trusted HTML file and renders it using the existing ManatOS template
 * evaluator; invocation data is projected read-only as $message.
 */
@Component({
  selector: 'manatos-message-popup-content',
  standalone: true,
  templateUrl: './MessagePopupContent.html',
  styleUrl: './MessagePopupContent.css',
})
export class MessagePopupContent {
  readonly popup = input.required<PopupContext>();
  readonly contentContext = input<UiPageTemplateContext>({});
  protected readonly content = computed(() => this.popup().level().data.content);
  private readonly language = computed<MetadataLanguage>(() =>
    String(this.contentContext()['$language'] ?? 'en').toUpperCase() === 'EL' ? 'EL' : 'EN',
  );
  private resolveValue(value: unknown): unknown {
    if (typeof value === 'string') return resolveMetadataText(value, this.language());
    if (
      value &&
      typeof value === 'object' &&
      typeof (value as Record<string, unknown>)['EN'] === 'string'
    )
      return resolveMetadataText(value as MultilingualLiteral, this.language());
    return value;
  }
  protected readonly multilingual = computed(() =>
    multilingual(this.language(), ['MessageLoadError', 'OperationDetails'] as const),
  );
  protected readonly html = signal<string | null>(null);
  protected readonly loadError = signal(false);
  protected readonly illustration = computed(() => {
    const value = this.content()['illustration'];
    return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')
      ? value
      : null;
  });
  protected readonly trace = computed(() => {
    const value = this.content()['operationTrace'];
    return Array.isArray(value) && value.length > 0 ? JSON.stringify(value, null, 2) : null;
  });

  private readonly source = new BrowserUiPageContentSource();

  constructor() {
    effect((onCleanup) => {
      const params = this.content();
      const custom = params['contentPage'];
      const defaultName = this.popup().definition.id === 'message.error' ? 'ErrorInfo' : 'Alert';
      const page: UiPageIdentity =
        custom &&
        typeof custom === 'object' &&
        typeof (custom as Record<string, unknown>)['folder'] === 'string' &&
        typeof (custom as Record<string, unknown>)['name'] === 'string'
          ? (custom as UiPageIdentity)
          : { folder: 'messages', name: defaultName };
      // Only static, trusted ManatOS resource names may be requested.
      if (
        !/^[A-Za-z][A-Za-z0-9_-]*$/.test(page.folder) ||
        !/^[A-Za-z][A-Za-z0-9_-]*$/.test(page.name)
      ) {
        this.loadError.set(true);
        this.html.set(null);
        return;
      }
      this.loadError.set(false);
      this.html.set(null);
      let current = true;
      void renderUiPage(this.source, page, {
        ...this.contentContext(),
        $message: Object.fromEntries(
          Object.entries(params).map(([key, value]) => [key, this.resolveValue(value)]),
        ),
      }).then(
        (value) => {
          if (current) this.html.set(value);
        },
        () => {
          if (current) this.loadError.set(true);
        },
      );
      onCleanup(() => {
        current = false;
      });
    });
  }
}
