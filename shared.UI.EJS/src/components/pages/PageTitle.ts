import { Title, type TitleOptions } from '../surfaces/Title.js';

export type PageTitleOptions = TitleOptions;

export class PageTitle extends Title {
  protected override classes(): string {
    return `${super.classes()} page-title`;
  }
}

export function renderPageTitle(options: PageTitleOptions): string {
  return new PageTitle(options).render();
}
