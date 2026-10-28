import { Directive, ElementRef, HostListener, OnDestroy } from '@angular/core';

const DEBUG_TOOLTIP_DELAY_MS = 2200;

/**
 * One delegated tooltip host for the whole debugger.
 *
 * Elements may either keep a normal `title` attribute or provide
 * `data-debug-tooltip` plus optional `data-debug-tooltip-detail`. Tooltips are
 * rendered into the element's owning document so they also work when the
 * single debugger DOM instance is detached into a same-origin popup.
 */
@Directive({
  selector: '[manatosDebugTooltipHost]',
  standalone: true,
})
export class DebugTooltipHost implements OnDestroy {
  private activeTarget: HTMLElement | null = null;
  private tooltip: HTMLElement | null = null;
  private nativeTitle: string | null = null;
  private showTimer: ReturnType<typeof setTimeout> | null = null;
  private pointerX: number | null = null;

  constructor(private readonly host: ElementRef<HTMLElement>) {}

  @HostListener('pointerover', ['$event'])
  protected pointerOver(event: PointerEvent): void {
    this.activate(event.target, Number.isFinite(event.clientX) ? event.clientX : null);
  }

  @HostListener('pointermove', ['$event'])
  protected pointerMove(event: PointerEvent): void {
    if (this.activeTarget?.dataset.ctxPath && Number.isFinite(event.clientX)) {
      this.pointerX = event.clientX;
    }
  }

  @HostListener('pointerout', ['$event'])
  protected pointerOut(event: PointerEvent): void {
    if (!this.activeTarget) return;
    const related = event.relatedTarget;
    if (this.isNode(related) && this.activeTarget.contains(related)) return;
    this.hide();
  }

  @HostListener('focusin', ['$event'])
  protected focusIn(event: FocusEvent): void {
    this.activate(event.target, null);
  }

  @HostListener('focusout', ['$event'])
  protected focusOut(event: FocusEvent): void {
    if (!this.activeTarget) return;
    const related = event.relatedTarget;
    if (this.isNode(related) && this.activeTarget.contains(related)) return;
    this.hide();
  }

  @HostListener('keydown.escape')
  protected escape(): void {
    this.hide();
  }

  ngOnDestroy(): void {
    this.hide();
  }

  private activate(target: EventTarget | null, pointerX: number | null): void {
    if (!target || typeof (target as Element).closest !== 'function') return;
    const candidate = (target as Element).closest<HTMLElement>('[data-debug-tooltip], [title]');
    if (!candidate || !this.host.nativeElement.contains(candidate)) return;
    if (candidate === this.activeTarget) return;

    const title = candidate.dataset.debugTooltip?.trim() || candidate.getAttribute('title')?.trim();
    if (!title) return;

    this.hide();
    this.activeTarget = candidate;
    this.pointerX = candidate.dataset.ctxPath ? pointerX : null;
    this.nativeTitle = candidate.getAttribute('title');
    if (this.nativeTitle !== null) candidate.removeAttribute('title');
    this.showTimer = setTimeout(() => this.show(candidate, title), DEBUG_TOOLTIP_DELAY_MS);
  }

  private show(candidate: HTMLElement, title: string): void {
    this.showTimer = null;
    if (this.activeTarget !== candidate) return;

    const document = candidate.ownerDocument;
    const tooltip = document.createElement('div');
    tooltip.className = 'manatos-debug-tooltip';
    tooltip.setAttribute('role', 'tooltip');

    const value = candidate.dataset.debugTooltipValue?.trim();
    if (value) {
      tooltip.classList.add('is-value-tooltip');
      const line = document.createElement('div');
      line.className = 'manatos-debug-tooltip-value-line';
      const heading = document.createElement('span');
      heading.className = 'manatos-debug-tooltip-title';
      heading.textContent = title;
      const separator = document.createElement('span');
      separator.className = 'manatos-debug-tooltip-separator';
      separator.textContent = ' = ';
      const valueElement = document.createElement('span');
      valueElement.className = 'manatos-debug-tooltip-value';
      valueElement.textContent = value;
      line.append(heading, separator, valueElement);
      tooltip.appendChild(line);
    } else {
      const heading = document.createElement('div');
      heading.className = 'manatos-debug-tooltip-title';
      heading.textContent = title;
      tooltip.appendChild(heading);
    }

    const detail = candidate.dataset.debugTooltipDetail?.trim();
    if (detail) {
      const details = document.createElement('div');
      details.className = 'manatos-debug-tooltip-detail';
      details.textContent = detail;
      tooltip.appendChild(details);
    }

    document.body.appendChild(tooltip);
    this.tooltip = tooltip;
    document.defaultView?.requestAnimationFrame(() => this.position());
  }

  private position(): void {
    const target = this.activeTarget;
    const tooltip = this.tooltip;
    if (!target || !tooltip) return;

    const view = target.ownerDocument.defaultView;
    if (!view) return;
    const targetRect = target.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const margin = 8;

    let left =
      this.pointerX === null
        ? targetRect.left + Math.min(12, Math.max(0, targetRect.width / 4))
        : this.pointerX + 12;
    left = Math.max(margin, Math.min(left, view.innerWidth - tooltipRect.width - margin));

    let top = targetRect.bottom + 7;
    if (top + tooltipRect.height + margin > view.innerHeight) {
      top = Math.max(margin, targetRect.top - tooltipRect.height - 7);
    }

    tooltip.style.left = `${Math.round(left)}px`;
    tooltip.style.top = `${Math.round(top)}px`;
  }

  private isNode(value: EventTarget | null): value is Node {
    return Boolean(value && typeof (value as Node).nodeType === 'number');
  }

  private hide(): void {
    if (this.showTimer) clearTimeout(this.showTimer);
    this.showTimer = null;
    this.tooltip?.remove();
    this.tooltip = null;
    if (this.activeTarget && this.nativeTitle !== null) {
      this.activeTarget.setAttribute('title', this.nativeTitle);
    }
    this.activeTarget = null;
    this.nativeTitle = null;
    this.pointerX = null;
  }
}
