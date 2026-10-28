/** UIS boundary: Messages own localized explanation/trace rendering and async static pages; the popup shell only provides modal/CTX lifecycle. This ownership separation is intentional; preserve it in future migrations. */
import {
  multilingual,
  BrowserUiPageContentSource,
  renderUiPage,
  UiPopupRuntime,
  type UiPopupText,
} from '@manatos/shared-ui';

function localize(value: unknown, language: 'EN' | 'EL'): unknown {
  if (typeof value === 'string') return multilingual(language, []).resolve(value);
  if (
    value &&
    typeof value === 'object' &&
    typeof (value as Record<string, unknown>)['EN'] === 'string'
  ) {
    const literal = value as UiPopupText;
    return typeof literal === 'string' ? literal : (literal[language] ?? literal.EN);
  }
  return value;
}

/** Trusted message HTML, illustration, and trace; no independent modal or CTX. */
export class MessagePopupContent {
  // A live popup may emit many unrelated CTX updates. Do not repeat async
  // template evaluation or replace the message DOM unless its inputs changed.
  private readonly rendered = new WeakMap<HTMLElement, string>();
  private readonly source = new BrowserUiPageContentSource();

  constructor(private readonly language: () => 'EN' | 'EL') {}

  append(parent: HTMLElement, popup: UiPopupRuntime): void {
    // NG1 keeps illustration and operation trace reactive to live #data changes.
    // Retain their DOM owners while the message body translates asynchronously.
    if (popup.definition.id !== 'message.error') {
      const image = document.createElement('img');
      image.className = 'ejs-semantic-popup-message-illustration';
      image.dataset.ejsMessageIllustration = '';
      image.alt = '';
      image.setAttribute('aria-hidden', 'true');
      image.hidden = true;
      parent.append(image);
    }

    const article = document.createElement('div');
    article.className = 'ejs-semantic-popup-message-content';
    article.dataset.ejsMessageContent = '';
    article.dataset.popupLayoutId = 'message-body';
    parent.append(article);

    const details = document.createElement('details');
    details.className = 'ejs-semantic-popup-message-trace';
    details.dataset.ejsMessageTrace = '';
    details.dataset.popupLayoutId = 'message-details';
    const summary = document.createElement('summary');
    summary.dataset.ejsMessageTraceSummary = '';
    const body = document.createElement('pre');
    body.dataset.ejsMessageTraceBody = '';
    details.append(summary, body);
    details.hidden = true;
    parent.append(details);

    void this.refresh(article, popup);
  }

  private refreshPresentation(article: HTMLElement, popup: UiPopupRuntime): void {
    const container = article.parentElement;
    if (!container) return;
    const params = popup.level.data.content;
    const illustration = params['illustration'];
    const image = container.querySelector<HTMLImageElement>('[data-ejs-message-illustration]');
    if (image) {
      const url =
        popup.definition.id !== 'message.error' &&
        typeof illustration === 'string' &&
        illustration.startsWith('/') &&
        !illustration.startsWith('//')
          ? illustration
          : null;
      image.hidden = url === null;
      if (url !== null && image.getAttribute('src') !== url) image.src = url;
      if (url === null) image.removeAttribute('src');
    }
    const details = container.querySelector<HTMLDetailsElement>('[data-ejs-message-trace]');
    if (!details) return;
    const trace = params['operationTrace'];
    let text: string | null = null;
    if (Array.isArray(trace) && trace.length > 0) {
      try {
        text = JSON.stringify(trace, null, 2);
      } catch {
        text = '[Unserializable operation trace]';
      }
    }
    details.hidden = text === null;
    const summary = details.querySelector<HTMLElement>('[data-ejs-message-trace-summary]');
    if (summary)
      summary.textContent = multilingual(this.language(), ['OperationDetails']).OperationDetails;
    const pre = details.querySelector<HTMLElement>('[data-ejs-message-trace-body]');
    if (pre && pre.textContent !== text) pre.textContent = text ?? '';
  }

  private showLoadingError(article: HTMLElement, popup: UiPopupRuntime): void {
    const params = popup.level.data.content;
    const detail = String(localize(params['text'] ?? params['message'] ?? '', this.language()));
    const error = article.ownerDocument.createElement('p');
    error.setAttribute('role', 'alert');
    error.textContent = multilingual(this.language(), ['MessageLoadError']).MessageLoadError;
    article.replaceChildren();
    if (detail) {
      const fallback = article.ownerDocument.createElement('p');
      fallback.textContent = detail;
      article.append(fallback);
    }
    article.append(error);
  }

  async refresh(article: HTMLElement, popup: UiPopupRuntime): Promise<void> {
    this.refreshPresentation(article, popup);
    const params = popup.level.data.content;
    const supplied = params['contentPage'];
    const fallback = popup.definition.id === 'message.error' ? 'ErrorInfo' : 'Alert';
    const page =
      supplied && typeof supplied === 'object'
        ? (supplied as Record<string, unknown>)
        : { folder: 'messages', name: fallback };
    if (
      typeof page['folder'] !== 'string' ||
      typeof page['name'] !== 'string' ||
      !/^[A-Za-z][A-Za-z0-9_-]*$/.test(page['folder']) ||
      !/^[A-Za-z][A-Za-z0-9_-]*$/.test(page['name'])
    ) {
      // A rejected template invalidates any older translation in flight.
      article.dataset.messageRevision = String(Number(article.dataset['messageRevision'] ?? 0) + 1);
      this.rendered.delete(article);
      this.showLoadingError(article, popup);
      return;
    }
    // Invocation content is normally JSON-like. If an ErrorInfo caller passes
    // a cyclic, structured-cloneable value, still render instead of throwing
    // while computing the memoization key.
    let signature: string | null = null;
    try {
      signature = JSON.stringify({ page, params, language: this.language() });
    } catch {
      // Reevaluate unusual invocation objects rather than retaining stale HTML.
    }
    // A duplicate CTX notification must not invalidate an existing asynchronous
    // translation. Advance the generation only when starting a new evaluation.
    if (signature !== null && this.rendered.get(article) === signature) return;
    const revision = String(Number(article.dataset['messageRevision'] ?? 0) + 1);
    article.dataset.messageRevision = revision;
    if (signature !== null) this.rendered.set(article, signature);
    try {
      const value = await renderUiPage(
        this.source,
        { folder: page['folder'], name: page['name'] },
        {
          $language: this.language(),
          $message: Object.fromEntries(
            Object.entries(params).map(([key, value]) => [key, localize(value, this.language())]),
          ),
        },
      );
      if (article.isConnected && article.dataset['messageRevision'] === revision)
        article.innerHTML = value;
    } catch {
      // A transient page-load failure must remain retryable on the next update.
      if (signature !== null && this.rendered.get(article) === signature) {
        this.rendered.delete(article);
      }
      if (article.isConnected && article.dataset['messageRevision'] === revision) {
        // NG1 explicitly identifies a failed message-template load instead of
        // silently presenting fallback text as if the resource had rendered.
        this.showLoadingError(article, popup);
      }
    }
  }
}
