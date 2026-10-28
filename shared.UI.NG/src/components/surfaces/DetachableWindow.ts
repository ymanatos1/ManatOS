import {
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

import { DetachedWindowHost, type UiWindowPlacement } from '@manatos/shared-ui';

@Component({
  selector: 'manatos-detachable-window',
  standalone: true,
  template: '<ng-content />',
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
  `,
})
export class DetachableWindow implements OnInit, OnDestroy {
  readonly enabled = input(true);
  readonly title = input('ManatOS');
  readonly windowName = input('ManatOSDetachedWindow');
  readonly detachedClass = input('is-detached-window');
  readonly layoutCss = input('');
  readonly placement = input<UiWindowPlacement | null>(null);

  readonly placementChanged = output<UiWindowPlacement>();
  readonly detachedChanged = output<boolean>();

  readonly detached = signal(false);

  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private host: DetachedWindowHost | null = null;
  private lastPlacement: UiWindowPlacement | null = null;

  constructor() {
    effect(() => {
      if (!this.enabled() && this.detached()) this.attach(false);
    });
  }

  ngOnInit(): void {
    this.lastPlacement = this.placement();
    this.host = new DetachedWindowHost({
      title: this.title(),
      windowName: this.windowName(),
      detachedClass: this.detachedClass(),
      layoutCss: this.layoutCss(),
      loadPlacement: () => this.lastPlacement ?? this.placement(),
      savePlacement: (placement) => {
        this.lastPlacement = placement;
        this.placementChanged.emit(placement);
      },
      detachedChanged: (detached) => {
        this.detached.set(detached);
        this.detachedChanged.emit(detached);
      },
    });
  }

  ngOnDestroy(): void {
    this.host?.destroy();
    this.host = null;
  }

  toggle(): void {
    if (!this.enabled()) return;
    this.host?.toggle(this.element.nativeElement);
  }

  attach(focusMain = false): void {
    this.host?.attach(focusMain);
  }
}
