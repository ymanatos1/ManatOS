import {
  AfterViewInit,
  Component,
  OnDestroy,
  ViewContainerRef,
  effect,
  inject,
  input,
  output,
  ViewChild,
} from '@angular/core';
import type { ContextTreeRuntime, ManatOSRuntimeRootContext } from '@manatos/shared';
import type {
  UiBusyRuntime,
  UiLanguageDefinition,
  UiPublicExternalAuthProvider,
} from '@manatos/shared-ui';
import { NgUiSurfaceManager } from './uiSurfaceManager';

/**
 * Single NG1 presentation outlet. Concrete popup components and their
 * registration are private to NgUiSurfaceManager; application shells only host
 * this outlet and pass their existing UI configuration/notifications.
 */
@Component({
  selector: 'manatos-surfaces-host',
  standalone: true,
  template: '<ng-container #outlet />',
})
export class SurfacesHost implements AfterViewInit, OnDestroy {
  readonly contextTree = input.required<ContextTreeRuntime<ManatOSRuntimeRootContext>>();
  readonly busyRuntime = input.required<UiBusyRuntime>();
  readonly debuggerAllowed = input(false);
  readonly debuggerForeground = input(false);
  readonly debuggerDocked = input(true);
  readonly debuggerDockWidth = input<number | null>(null);
  readonly initialFontScalePercent = input(100);
  readonly languages = input<readonly UiLanguageDefinition[]>([]);
  readonly currentLanguage = input<UiLanguageDefinition | null>(null);
  readonly entityCapabilitiesFor = input<
    ((entityKey: string) => Readonly<Record<string, boolean>>) | null
  >(null);
  readonly externalProvidersLoader = input<
    (() => Promise<readonly UiPublicExternalAuthProvider[]>) | null
  >(null);
  readonly signInHandler = input<((identity: string, password: string) => Promise<void>) | null>(
    null,
  );

  readonly fontScaleChanged = output<number>();
  readonly languageSelected = output<string>();
  readonly debuggerRequested = output<string>();
  readonly flowDebuggerRequested = output<string>();
  readonly opened = output<void>();
  readonly closed = output<void>();
  readonly externalProviderRequested = output<string>();

  private readonly surfaces = inject(NgUiSurfaceManager);
  @ViewChild('outlet', { read: ViewContainerRef })
  private outlet!: ViewContainerRef;

  constructor() {
    effect(() => {
      this.surfaces.configure({
        contextTree: this.contextTree(),
        busyRuntime: this.busyRuntime(),
        debuggerAllowed: this.debuggerAllowed(),
        debuggerForeground: this.debuggerForeground(),
        debuggerDocked: this.debuggerDocked(),
        debuggerDockWidth: this.debuggerDockWidth(),
        initialFontScalePercent: this.initialFontScalePercent(),
        languages: this.languages(),
        currentLanguage: this.currentLanguage(),
        entityCapabilitiesFor: this.entityCapabilitiesFor(),
        externalProvidersLoader: this.externalProvidersLoader(),
        signInHandler: this.signInHandler(),
      });
    });
  }

  ngAfterViewInit(): void {
    this.surfaces.attach(this.outlet, {
      fontScaleChanged: (value) => this.fontScaleChanged.emit(value),
      languageSelected: (value) => this.languageSelected.emit(value),
      debuggerRequested: (value) => this.debuggerRequested.emit(value),
      flowDebuggerRequested: (value) => this.flowDebuggerRequested.emit(value),
      opened: () => this.opened.emit(),
      closed: () => this.closed.emit(),
      externalProviderRequested: (value) => this.externalProviderRequested.emit(value),
    });
  }

  ngOnDestroy(): void {
    this.surfaces.detach();
  }
}
