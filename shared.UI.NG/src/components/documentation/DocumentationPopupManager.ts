import { ApplicationRef, ComponentRef, EnvironmentInjector, createComponent } from '@angular/core';

import {
  type ApplicationState,
  PopupWindowHost,
  type DocumentationLocation,
  type DocumentationPopupState,
  type UiWindowPlacement,
} from '@manatos/shared-ui';

import { DocumentationPopup } from './DocumentationPopup';

export interface DocumentationPopupManagerOptions {
  readonly mainWindow: Window;
  readonly applicationRef: ApplicationRef;
  readonly environmentInjector: EnvironmentInjector;
  readonly windowNamePrefix: string;
  readonly state: ApplicationState;
  readonly attachRequested: (location: DocumentationLocation) => void;
}

interface DocumentationPopupEntry {
  readonly host: PopupWindowHost;
  component: ComponentRef<DocumentationPopup> | null;
  persistOnProgrammaticClose: boolean;
}

const DOCUMENTATION_POPUP_LAYOUT_CSS = `
  html { overflow: hidden !important; }
  body { overflow: hidden !important; }
  manatos-documentation-popup,
  .documentation-popup {
    display: flex !important;
    flex-direction: column;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
  }
  .documentation-popup-content {
    display: flex !important;
    flex-direction: column;
    flex: 1 1 auto !important;
    box-sizing: border-box;
    min-height: 0 !important;
    overflow: hidden !important;
  }
  .documentation-popup-content .documentation-browser {
    flex: 1 1 auto !important;
    height: auto !important;
    min-height: 0 !important;
    max-height: none !important;
  }
`;

export class DocumentationPopupManager {
  private readonly popups = new Set<DocumentationPopupEntry>();
  private nextPopupId = 1;
  private destroyed = false;

  constructor(private readonly options: DocumentationPopupManagerOptions) {}

  open(
    state: DocumentationPopupState,
    sourceDocument: Document = this.options.mainWindow.document,
  ): boolean {
    if (this.destroyed) return false;

    const initialState = state;
    const initialPlacement = this.nextPlacement(sourceDocument);
    let entry: DocumentationPopupEntry | null = null;
    const host = new PopupWindowHost({
      title: 'ManatOS Documentation',
      windowName: `${this.options.windowNamePrefix}_${this.nextPopupId++}`,
      layoutCss: DOCUMENTATION_POPUP_LAYOUT_CSS,
      minimumWidth: 760,
      minimumHeight: 500,
      loadPlacement: () => initialPlacement,
      closed: (reason, placement) => {
        if (!entry) return;
        if (reason === 'native' || entry.persistOnProgrammaticClose) {
          this.persist(entry, placement);
        }
        this.release(entry);
      },
    });

    entry = { host, component: null, persistOnProgrammaticClose: false };
    const popup = host.open(
      sourceDocument,
      this.options.mainWindow,
      this.options.mainWindow.document,
    );
    if (!popup) return false;

    const element = popup.document.createElement('manatos-documentation-popup');
    popup.document.body.replaceChildren(element);

    try {
      const component = createComponent(DocumentationPopup, {
        environmentInjector: this.options.environmentInjector,
        hostElement: element,
      });
      entry.component = component;
      this.popups.add(entry);

      component.setInput('state', this.options.state);
      component.setInput('initialLocation', initialState.location);
      component.setInput('initialFontScalePercent', initialState.fontScalePercent);
      component.instance.openNewRequested.subscribe((childState) => {
        this.open(childState, popup.document);
      });
      component.instance.attachRequested.subscribe((location) => {
        this.closeOthers(entry!);
        entry!.persistOnProgrammaticClose = true;
        this.options.attachRequested(location);
        entry!.host.close();
      });
      component.instance.closeAllRequested.subscribe(() => this.closeAllFrom(entry!));

      this.options.applicationRef.attachView(component.hostView);
      component.changeDetectorRef.detectChanges();
      return true;
    } catch {
      host.close();
      return false;
    }
  }

  closeAll(): void {
    for (const entry of [...this.popups]) entry.host.close();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.closeAll();
  }

  private release(entry: DocumentationPopupEntry): void {
    if (!this.popups.delete(entry)) return;

    const component = entry.component;
    entry.component = null;
    if (!component) return;

    try {
      this.options.applicationRef.detachView(component.hostView);
    } finally {
      component.destroy();
    }
  }

  private nextPlacement(sourceDocument: Document): UiWindowPlacement | null {
    const sourceEntry = [...this.popups].find(
      (candidate) => candidate.host.window?.document === sourceDocument,
    );
    const active = [...this.popups]
      .map((candidate) => candidate.host.placement)
      .filter((placement): placement is UiWindowPlacement => placement !== null);
    const newest = active.length > 0 ? active[active.length - 1] : null;
    const base =
      sourceEntry?.host.placement ?? newest ?? this.options.state.documentationWindowPlacement;

    if (!base || active.length === 0) return base ?? null;
    return cascadePlacement(base, active, this.options.mainWindow);
  }

  private closeOthers(initiator: DocumentationPopupEntry): void {
    for (const entry of [...this.popups]) {
      if (entry === initiator) continue;
      entry.persistOnProgrammaticClose = true;
      entry.host.close();
    }
  }

  private closeAllFrom(initiator: DocumentationPopupEntry): void {
    this.closeOthers(initiator);
    initiator.persistOnProgrammaticClose = true;
    initiator.host.close();
  }

  private persist(entry: DocumentationPopupEntry, placement: UiWindowPlacement | null): void {
    const component = entry.component;
    if (!component || !placement) return;

    this.options.state.saveDocumentationWindowPlacement(placement);
  }
}

function cascadePlacement(
  base: UiWindowPlacement,
  occupied: readonly UiWindowPlacement[],
  mainWindow: Window,
): UiWindowPlacement {
  const screen = mainWindow.screen as Screen & { availLeft?: number; availTop?: number };
  const availLeft = Number.isFinite(screen.availLeft) ? Number(screen.availLeft) : 0;
  const availTop = Number.isFinite(screen.availTop) ? Number(screen.availTop) : 0;
  const availWidth = Math.max(base.width, Number(screen.availWidth) || mainWindow.innerWidth);
  const availHeight = Math.max(base.height, Number(screen.availHeight) || mainWindow.innerHeight);
  const margin = 24;
  const step = 32;
  const minLeft = availLeft + margin;
  const minTop = availTop + margin;
  const maxLeft = Math.max(minLeft, availLeft + availWidth - margin - base.width);
  const maxTop = Math.max(minTop, availTop + availHeight - margin - base.height);

  let left = base.left;
  let top = base.top;
  for (let attempt = 0; attempt < 24; attempt += 1) {
    left += step;
    top += step;
    if (left > maxLeft) left = minLeft + (attempt % 4) * step;
    if (top > maxTop) top = minTop + (attempt % 4) * step;

    const candidate = { ...base, left: Math.min(maxLeft, left), top: Math.min(maxTop, top) };
    const overlaps = occupied.some(
      (placement) =>
        Math.abs(placement.left - candidate.left) < step / 2 &&
        Math.abs(placement.top - candidate.top) < step / 2,
    );
    if (!overlaps) return candidate;
  }

  return {
    ...base,
    left: Math.min(maxLeft, base.left + step),
    top: Math.min(maxTop, base.top + step),
  };
}
