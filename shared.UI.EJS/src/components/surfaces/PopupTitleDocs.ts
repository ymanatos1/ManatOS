import { Title, type TitleOptions } from './Title.js';

export type PopupTitleDocsOptions = TitleOptions;

/**
 * Title for detached documentation-style popups.
 */
export class PopupTitleDocs extends Title {
  protected override classes(): string {
    return `${super.classes()} popup-title-docs`;
  }
}

export function renderPopupTitleDocs(options: PopupTitleDocsOptions): string {
  return new PopupTitleDocs(options).render();
}
