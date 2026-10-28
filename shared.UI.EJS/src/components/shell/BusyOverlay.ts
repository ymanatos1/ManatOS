import { UiBusyRuntime, type UiBusySnapshot } from '@manatos/shared-ui';
import { resolveMetadataText } from '@manatos/shared';
import { safeIconClass } from '../../rendering/html.js';

/** Presents the shared foreground-operation lease; it never owns an API request. */
export class BusyOverlay {
  private readonly dialog: HTMLDialogElement;
  private readonly heading: HTMLHeadingElement;
  private readonly symbol: HTMLElement;
  private snapshot: UiBusySnapshot | null = null;
  private readonly message: HTMLParagraphElement;
  private readonly action: HTMLButtonElement;
  private readonly actionArea: HTMLDivElement;
  private readonly unsubscribe: () => void;

  constructor(
    doc: Document,
    runtime: UiBusyRuntime,
    private readonly language: () => 'EN' | 'EL',
  ) {
    this.dialog = doc.createElement('dialog');
    this.dialog.className = 'manatos-busy-panel';
    this.dialog.setAttribute('aria-modal', 'true');
    this.dialog.setAttribute('aria-labelledby', 'manatosEjsBusyTitle');
    this.dialog.setAttribute('aria-describedby', 'manatosEjsBusyMessage');
    this.dialog.addEventListener('cancel', (event) => event.preventDefault());
    const layout = doc.createElement('div');
    layout.className = 'manatos-busy-layout';
    const animation = doc.createElement('div');
    animation.className = 'manatos-busy-animation';
    const symbol = doc.createElement('div');
    symbol.className = 'manatos-busy-provider';
    symbol.setAttribute('aria-hidden', 'true');
    const icon = doc.createElement('i');
    icon.setAttribute('aria-hidden', 'true');
    symbol.append(icon);
    this.symbol = icon;
    const pulse = doc.createElement('div');
    pulse.className = 'manatos-busy-pulse';
    animation.append(symbol, pulse);
    const copy = doc.createElement('div');
    copy.className = 'manatos-busy-copy';
    this.heading = doc.createElement('h2');
    this.heading.id = 'manatosEjsBusyTitle';
    this.message = doc.createElement('p');
    this.message.id = 'manatosEjsBusyMessage';
    copy.append(this.heading, this.message);
    layout.append(animation, copy);
    this.actionArea = doc.createElement('div');
    this.actionArea.className = 'manatos-busy-actions';
    this.action = doc.createElement('button');
    this.action.type = 'button';
    this.actionArea.append(this.action);
    this.dialog.append(layout, this.actionArea);
    doc.body.append(this.dialog);
    this.unsubscribe = runtime.subscribe((snapshot) => this.render(snapshot));
  }

  private render(snapshot: UiBusySnapshot): void {
    this.snapshot = snapshot;
    const { presentation } = snapshot;
    this.symbol.className = `bi ${safeIconClass(presentation.icon ?? 'bi-arrow-repeat')}`;
    this.heading.textContent =
      presentation.title ?? resolveMetadataText('@CM.PleaseWait', this.language());
    this.message.textContent =
      presentation.message ?? resolveMetadataText('@CM.CompletingOperation', this.language());
    this.actionArea.hidden = !presentation.onAction;
    this.action.textContent =
      presentation.actionLabel ?? resolveMetadataText('@CM.Cancel', this.language());
    this.action.onclick = presentation.onAction ?? null;
    if (snapshot.visible && !this.dialog.open) this.dialog.showModal();
    else if (!snapshot.visible && this.dialog.open) this.dialog.close();
  }

  refreshLanguage(): void {
    if (this.snapshot) this.render(this.snapshot);
  }

  destroy(): void {
    this.unsubscribe();
    if (this.dialog.open) this.dialog.close();
    this.dialog.remove();
  }
}
