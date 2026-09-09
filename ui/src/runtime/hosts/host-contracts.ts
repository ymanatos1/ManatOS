import type { SurfaceContext, SurfaceHost } from '../surface/contracts.js';

/**
 * Content is deliberately independent of the page/popup chrome that hosts it.
 * EntityList, EntityEntry and future custom content implement this contract.
 */
export interface SurfaceContentMount {
  readonly element: HTMLElement;
  dispose(): void;
}

export type SurfaceContentRenderer = (surface: SurfaceContext) => SurfaceContentMount;

export interface SurfaceHostMount {
  readonly surfaceId: string;
  readonly host: SurfaceHost;
  readonly element: HTMLElement;
  activate(): void;
  deactivate(preserveVisual?: boolean): void;
  dispose(): void;
}

export interface PageHostEnvironment {
  readonly root: HTMLElement;
  readonly document: Document;
  readonly window?: Window;
}

export interface PopupHostEnvironment {
  readonly root: HTMLElement;
  readonly document: Document;
}
