/**
 * EJS Auth dispatcher: it owns only named child registration and recursive
 * placement. Intro, Section, EmailMethod, Providers, Note, Notice and the
 * embedded Credentials own their DOM/actions/refresh. Do not rebuild their
 * native implementations as anonymous callbacks inside this registry.
 */
import { AuthCredentials } from './embedded/AuthCredentials.js';
import { IntroContent } from './content/IntroContent.js';
import { SectionContent } from './content/SectionContent.js';
import { EmailMethodContent } from './content/EmailMethodContent.js';
import { ProvidersContent } from './content/ProvidersContent.js';
import { NoteContent } from './content/NoteContent.js';
import { NoticeContent } from './content/NoticeContent.js';
import {
  type UiPageTemplateContext,
  type UiPopupContentDefinition,
  type UiPopupRuntime,
  type UiPopupTabDefinition,
  type UiPopupIntroDefinition,
  type UiPopupSectionDefinition,
  type UiPopupCredentialsDefinition,
  type UiPopupEmailMethodDefinition,
  type UiPopupProvidersDefinition,
  type UiPopupNoteDefinition,
} from '@manatos/shared-ui';

type ContentRenderer = (
  item: UiPopupContentDefinition,
  parent: HTMLElement,
  popup: UiPopupRuntime,
  inputs: Map<string, HTMLInputElement>,
  render: () => void,
  reconcile: () => void,
  tab: UiPopupTabDefinition,
) => void;

/** A renderer for every semantic kind; no kind-switch in popup lifecycle code.
 * UIS ownership: explicit EJS content-kind registrations and their slots, rather than a popup-host switch. */
export class EjsPopupContentRendererRegistry {
  private readonly renderers = new Map<
    UiPopupContentDefinition['kind'],
    { render: ContentRenderer; slot: 'intro' | 'sections' | 'tail' }
  >();
  register(
    kind: UiPopupContentDefinition['kind'],
    render: ContentRenderer,
    slot: 'intro' | 'sections' | 'tail' = 'tail',
  ): this {
    if (this.renderers.has(kind)) throw new Error(`Duplicate popup renderer: ${kind}`);
    this.renderers.set(kind, { render, slot });
    return this;
  }
  resolve(kind: UiPopupContentDefinition['kind']): ContentRenderer {
    const render = this.renderers.get(kind);
    if (!render) throw new Error(`Unregistered EJS popup content kind: ${kind}`);
    return render.render;
  }
  slot(kind: UiPopupContentDefinition['kind']): 'intro' | 'sections' | 'tail' {
    const renderer = this.renderers.get(kind);
    if (!renderer) throw new Error(`Unregistered EJS popup content kind: ${kind}`);
    return renderer.slot;
  }
}

/** Single popup-content adapter; components own native DOM and semantic callbacks.
 * UIS ownership: registered auth content composition and tab/section placement without hiding child templates. Do not collapse registered native auth children into a single dynamic markup factory. */
export class AuthPopupContent {
  private readonly intro: IntroContent;
  private readonly section: SectionContent;
  private readonly emailMethod: EmailMethodContent;
  private readonly notes: NoteContent;
  private readonly providers: ProvidersContent;
  private readonly notices = new NoticeContent();
  private readonly credentials: AuthCredentials;
  readonly renderers = new EjsPopupContentRendererRegistry();

  constructor(language: () => 'EN' | 'EL', pageContext: () => UiPageTemplateContext = () => ({})) {
    this.intro = new IntroContent(language, pageContext);
    this.section = new SectionContent(
      language,
      (item, parent, popup, inputs, render, reconcile, tab) =>
        this.appendContent(item, parent, popup, inputs, render, reconcile, tab),
    );
    this.emailMethod = new EmailMethodContent(language);
    this.notes = new NoteContent(language);
    this.providers = new ProvidersContent(language);
    this.credentials = new AuthCredentials(language);
    // This is solely the composition registry: the concrete child owns the
    // native elements/actions, not a closure hidden in the popup host.
    this.renderers
      .register(
        'intro',
        (item, parent, _popup, _inputs, _render, reconcile) =>
          this.intro.append(item as UiPopupIntroDefinition, parent, reconcile),
        'intro',
      )
      .register(
        'section',
        (item, parent, popup, inputs, render, reconcile, tab) =>
          this.section.append(
            item as UiPopupSectionDefinition,
            parent,
            popup,
            inputs,
            render,
            reconcile,
            tab,
          ),
        'sections',
      )
      .register('auth-credentials', (item, parent, popup, inputs, render, _reconcile, tab) =>
        this.credentials.append(
          item as UiPopupCredentialsDefinition,
          parent,
          popup,
          inputs,
          render,
          tab.id,
        ),
      )
      .register('email-method', (item, parent, popup) =>
        this.emailMethod.append(item as UiPopupEmailMethodDefinition, parent, popup),
      )
      .register('external-providers', (item, parent, _popup, _inputs, _render, _reconcile, tab) =>
        this.providers.append(item as UiPopupProvidersDefinition, parent, tab),
      )
      .register('note', (item, parent, popup) =>
        this.notes.append(item as UiPopupNoteDefinition, parent, popup),
      )
      .register('notice', (item, parent) =>
        this.notices.append(item as Extract<UiPopupContentDefinition, { kind: 'notice' }>, parent),
      );
  }

  /** Forward explicit intro work to its concrete component; keep this public adapter for existing callers. */
  loadIntro(
    element: HTMLElement,
    page: { folder: string; name: string },
    reconcile: () => void = () => {},
  ): Promise<void> {
    return this.intro.load(element, page, reconcile);
  }

  /**
   * The popup orchestrates refresh ONLY. Each child refreshes the DOM it owns.
   * Never add type-specific selectors or native control mutations here.
   */
  refreshLanguage(
    element: HTMLElement,
    runtime: UiPopupRuntime,
    reconcile: (tabId: string) => void,
  ): void {
    this.section.refresh(element, runtime);
    this.emailMethod.refresh(element, runtime);
    this.notes.refresh(element, runtime);
    this.credentials.refreshLanguage(element, runtime);
    this.providers.refresh(element, runtime);
    this.intro.refresh(element, runtime, reconcile);
  }

  updateProviders(root: HTMLElement, popup: UiPopupRuntime): void {
    this.providers.refresh(root, popup);
  }

  appendContent(
    item: UiPopupContentDefinition,
    parent: HTMLElement,
    popup: UiPopupRuntime,
    inputs: Map<string, HTMLInputElement>,
    render: () => void,
    reconcile: () => void = () => {},
    tab: UiPopupTabDefinition = popup.activeTab,
  ): void {
    this.renderers.resolve(item.kind)(item, parent, popup, inputs, render, reconcile, tab);
  }
}
