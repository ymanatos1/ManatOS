import type { DocumentationLocation } from './documentation-browser.js';

export interface DocumentationPopupState {
  readonly location: DocumentationLocation;
  readonly fontScalePercent: number;
}

export function documentationPopupState(
  location: DocumentationLocation,
  fontScalePercent: number,
): DocumentationPopupState {
  return Object.freeze({
    location: Object.freeze({ ...location }),
    fontScalePercent,
  });
}
