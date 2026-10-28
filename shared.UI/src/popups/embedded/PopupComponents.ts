import { createUiSemanticLayoutNode } from '../../runtime/layout/node.js';
import type {
  UiEmbeddedComponent,
  UiEmbeddedContextBinding,
  UiEmbeddedLayoutWriter,
  UiEmbeddedActionEvent,
  UiSemanticContentDefinition,
  UiSemanticLayoutNode,
} from '../../runtime/component.js';
import type {
  UiPopupActionDefinition,
  UiPopupContentDefinition,
  UiPopupFeatureContentDefinition,
  UiPopupSectionDefinition,
  UiPopupTabDefinition,
} from '../popup-definition.js';

/**
 * Popup layout composition lives in registered components, not UiPopupRuntime.
 *
 * Navigation: PopupTab -> Section (optional) -> authored content components;
 * PopupTab -> Actions. Every component owns its immediate children. The
 * Surface framework creates instances, validates paths and publishes #layout.
 *
 * These definitions intentionally retain the historic CTX layout identifiers:
 * migrating composition must not invalidate debugger selections or DOM bindings.
 */
export interface UiPopupEmbeddedDefinition extends UiSemanticContentDefinition {
  readonly tab?: UiPopupTabDefinition;
  readonly section?: UiPopupSectionDefinition;
  readonly actions?: readonly UiPopupActionDefinition[];
  readonly tabId?: string;
  /** True when the popup root, rather than each tab, owns its actions. */
  readonly rootActions?: boolean;
  /** Optional title capabilities, chosen by the popup definition and invocation. */
  readonly titleTools?: readonly (
    'language' | 'fontScale' | 'debugger' | 'flowDebugger' | 'close'
  )[];
  /** Only the tool component interprets its selector; Title merely composes. */
  readonly toolSelector?: string;
}

export const popupSelector = (id: string): string => `[data-popup-layout-id="${id}"]`;

/** Standard popup root metadata; each owner supplies its own kind and selector. */
export function popupComponentLayout(
  kind: string,
  id: string,
  domSelector: string,
): UiSemanticLayoutNode {
  return createUiSemanticLayoutNode(kind, id, `popup:${id}`, domSelector, {}, undefined, true);
}
const selector = popupSelector;

/** Shared base: popup components never create their own Surface #level. */
abstract class PopupEmbeddedComponent implements UiEmbeddedComponent {
  protected binding: UiEmbeddedContextBinding | null = null;
  bindContext(binding: UiEmbeddedContextBinding): void {
    this.binding = binding;
  }
  dispose(): void {
    this.binding = null;
  }
  abstract populateLayout(target: UiSemanticLayoutNode, writer: UiEmbeddedLayoutWriter): void;
}

/** Each leaf owns exactly the declarations associated with its capability.
 * UIS ownership: the static/translatable intro page region; the adapter loads HTML without creating a second popup runtime. */
export class PopupIntroEmbedded extends PopupEmbeddedComponent {
  constructor(private readonly definition: UiSemanticContentDefinition) {
    super();
  }
  createLayoutNode(): UiSemanticLayoutNode {
    return popupComponentLayout('intro', this.definition.id, selector(this.definition.id));
  }
  populateLayout(target: UiSemanticLayoutNode, writer: UiEmbeddedLayoutWriter): void {
    writer.add(target, 'body', 'region', selector(this.definition.id));
  }
}
/** UIS ownership: one text/note region with its own semantic path; text is not an action. */
export class PopupTextEmbedded extends PopupEmbeddedComponent {
  constructor(private readonly definition: UiSemanticContentDefinition) {
    super();
  }
  createLayoutNode(): UiSemanticLayoutNode {
    return popupComponentLayout(
      this.definition.kind,
      this.definition.id,
      selector(this.definition.id),
    );
  }
  populateLayout(target: UiSemanticLayoutNode, writer: UiEmbeddedLayoutWriter): void {
    writer.add(target, 'text', 'value', selector(this.definition.id));
  }
}
/** UIS ownership: the email method action and its content slot, distinct from credentials entry. */
export class PopupEmailMethodEmbedded extends PopupEmbeddedComponent {
  constructor(private readonly definition: UiSemanticContentDefinition) {
    super();
  }
  createLayoutNode(): UiSemanticLayoutNode {
    return popupComponentLayout('email-method', this.definition.id, selector(this.definition.id));
  }
  populateLayout(target: UiSemanticLayoutNode, writer: UiEmbeddedLayoutWriter): void {
    writer.add(target, 'trigger', 'action', selector(this.definition.id));
  }
}

/** Title declares its own semantic tools; native title adapters implement their DOM.
 * UIS ownership: the title text and separately owned title tools; not the place to implement tool actions. */
export class PopupTitleEmbedded extends PopupEmbeddedComponent {
  constructor(private readonly definition: UiPopupEmbeddedDefinition) {
    super();
  }
  createLayoutNode(): UiSemanticLayoutNode {
    return popupComponentLayout('title', this.definition.id, selector('popup-title'));
  }
  populateLayout(target: UiSemanticLayoutNode, writer: UiEmbeddedLayoutWriter): void {
    writer.add(target, 'caption', 'value', selector('popup-title'));
    const tools = writer.add(target, 'tools', 'region', selector('popup-title'));
    // Keep capabilities optional; registering a title never forces all tools.
    // Every Title tool is a registered child with its own semantic declaration.
    // The title owns order and presence, never the tool's internal DOM target.
    for (const capability of this.definition.titleTools ?? [])
      writer.mount(
        tools,
        { id: capability, kind: 'popup-title-tool' } as UiPopupEmbeddedDefinition,
        ['tools'],
      );
  }
}

/** One reusable Title-tool owner, independent of Page/Popup presentation hosts.
 * UIS ownership: one title-tool capability, whose action stays local to that tool. */
export class PopupTitleToolEmbedded extends PopupEmbeddedComponent {
  constructor(private readonly definition: UiPopupEmbeddedDefinition) {
    super();
  }
  createLayoutNode(): UiSemanticLayoutNode {
    const name = this.definition.id as keyof typeof popupTitleToolSelectors;
    const domSelector = popupTitleToolSelectors[name];
    if (!domSelector) throw new Error(`Unknown popup title capability: ${this.definition.id}`);
    return popupComponentLayout('action', this.definition.id, domSelector);
  }
  populateLayout(): void {
    // Its registered semantic action is the complete layout contribution.
    // Native language, scale, debugger and close operations stay host services.
  }
}

/** Selector policy belongs to the concrete capability, not the Title parent. */
export const popupTitleToolSelectors: Readonly<
  Record<NonNullable<UiPopupEmbeddedDefinition['titleTools']>[number], string>
> = {
  language: `${selector('popup-title')} :is(manatos-language-selection,[data-ejs-popup-language-toggle])`,
  fontScale: `${selector('popup-title')} :is(manatos-font-scale,.ejs-semantic-popup-font-scale)`,
  debugger: `${selector('popup-title')} :is(.popup-debugger-pair manatos-surface-action:first-child,[data-ejs-popup-debugger])`,
  flowDebugger: `${selector('popup-title')} :is(.popup-debugger-pair manatos-surface-action:nth-child(2),[data-ejs-popup-flow-debugger])`,
  close: `${selector('popup-title')} :is(.popup-title-close,.ejs-semantic-popup-x)`,
};

/** A Popup action's intent is declared/validated by the owning Actions component. */
export interface UiPopupActionEffect {
  readonly type: 'popup-action';
  readonly actionId: string;
  readonly targetTab?: string;
}

/** Footer action IDs are declared once by this component, not by the Popup runtime.
 * UIS ownership: the popup footer action controls, taking availability from popup state. */
export class PopupActionsEmbedded extends PopupEmbeddedComponent {
  constructor(private readonly definition: UiPopupEmbeddedDefinition) {
    super();
  }
  createLayoutNode(): UiSemanticLayoutNode {
    return popupComponentLayout(
      'actions',
      this.definition.id,
      selector(this.definition.tabId ? `${this.definition.tabId}-actions` : 'popup-root-actions'),
    );
  }
  handleAction(event: UiEmbeddedActionEvent): UiPopupActionEffect | null {
    const action = this.definition.actions?.find((item) => item.id === event.action);
    return action
      ? {
          type: 'popup-action',
          actionId: action.id,
          ...(action.targetTab ? { targetTab: action.targetTab } : {}),
        }
      : null;
  }
  populateLayout(target: UiSemanticLayoutNode, writer: UiEmbeddedLayoutWriter): void {
    for (const action of this.definition.actions ?? [])
      writer.add(
        target,
        action.id,
        'action',
        selector(
          this.definition.tabId
            ? `${this.definition.tabId}-action-${action.id}`
            : `popup-root-action-${action.id}`,
        ),
      );
  }
}

/** A section owns its authored children, including nested registered components.
 * UIS ownership: one section and its embedded content children, maintaining column/layout identity. */
export class PopupSectionEmbedded extends PopupEmbeddedComponent {
  constructor(private readonly definition: UiPopupEmbeddedDefinition) {
    super();
  }
  createLayoutNode(): UiSemanticLayoutNode {
    return popupComponentLayout('region', this.definition.id, selector(this.definition.id));
  }
  populateLayout(target: UiSemanticLayoutNode, writer: UiEmbeddedLayoutWriter): void {
    const section = this.definition.section;
    if (section) {
      writer.add(target, 'heading', 'value', `${selector(section.id)} .auth-modal-section-heading`);
      if (section.description)
        writer.add(
          target,
          'description',
          'value',
          `${selector(section.id)} .auth-method-description`,
        );
    }
    for (const child of section?.children ?? []) {
      writer.mount(target, child, []);
    }
  }
}

/**
 * Optional tabs are a popup capability. This class owns one tab's content and
 * actions; no Auth-specific navigation, validation or rendering is performed.
 * Hidden tabs stay mounted under the same Surface so their CTX remains stable.
 * UIS ownership: the active tab content composition and actions child, preserving tab-specific node paths.
 */
export class PopupTabEmbedded extends PopupEmbeddedComponent {
  constructor(
    private readonly definition: UiPopupEmbeddedDefinition,
    private readonly inlineSectionChild: (kind: string) => boolean,
  ) {
    super();
  }
  createLayoutNode(): UiSemanticLayoutNode {
    const id =
      this.definition.kind === 'popup-view'
        ? (this.definition.tab?.id ?? this.definition.id)
        : this.definition.id;
    return popupComponentLayout(
      this.definition.kind === 'popup-view' ? 'content' : 'tab',
      id,
      `[data-popup-tab="${id}"]`,
    );
  }
  populateLayout(target: UiSemanticLayoutNode, writer: UiEmbeddedLayoutWriter): void {
    const tab = this.definition.tab;
    if (!tab) throw new Error('Popup tab is missing its definition.');
    let column = 0;
    for (const authored of tab.content) {
      if (authored.kind !== 'section') {
        writer.mount(target, authored, []);
        continue;
      }
      const columnId = `column${column++}`;
      const slot = writer.add(
        target,
        columnId,
        'column',
        `[data-popup-column-id="${tab.id}-${columnId}"]`,
      );
      // Keep the established direct-child layout for a one-component column.
      const only = authored.children.length === 1 ? authored.children[0] : null;
      const child: UiPopupContentDefinition =
        only !== null && this.inlineSectionChild(only.kind) ? only : authored;
      writer.mount(slot, child, [columnId]);
    }
    if (this.definition.rootActions) return;
    writer.mount(
      target,
      {
        id: 'actions',
        kind: 'popup-actions',
        tabId: tab.id,
        actions: tab.actions,
      } as UiPopupEmbeddedDefinition,
      [],
    );
  }
}

/** Registered domain content keeps its semantic children beneath its owning tab. */
export class PopupFeatureContentEmbedded extends PopupEmbeddedComponent {
  constructor(protected readonly definition: UiSemanticContentDefinition) {
    super();
  }

  createLayoutNode(): UiSemanticLayoutNode {
    return popupComponentLayout(
      'feature-content',
      this.definition.id,
      selector(this.definition.id),
    );
  }

  protected children(): readonly UiPopupFeatureContentDefinition[] {
    return (this.definition as UiPopupFeatureContentDefinition).children ?? [];
  }

  populateLayout(target: UiSemanticLayoutNode, writer: UiEmbeddedLayoutWriter): void {
    writer.add(target, 'body', 'region', selector(this.definition.id));
    for (const child of this.children()) writer.mount(target, child, []);
  }
}

/**
 * Optional reactive feature composition, backed by a declared ordinary CTX field.
 * The embedded component replaces only its own semantic subtree when that field
 * changes. Inactive variants leave no field nodes, subscriptions or credentials.
 * Static Auth content continues using PopupFeatureContentEmbedded unchanged.
 */
export class PopupVariantFeatureContentEmbedded extends PopupFeatureContentEmbedded {
  private lastVariant: string | null = null;

  private selectedVariant(): string {
    const definition = this.definition as UiPopupFeatureContentDefinition;
    const fields = this.binding?.readData<Record<string, { value?: string }>>();
    return fields?.[definition.variantField ?? '']?.value ?? '';
  }

  protected override children(): readonly UiPopupFeatureContentDefinition[] {
    const definition = this.definition as UiPopupFeatureContentDefinition;
    return definition.variants?.[this.selectedVariant()] ?? [];
  }

  override populateLayout(target: UiSemanticLayoutNode, writer: UiEmbeddedLayoutWriter): void {
    this.lastVariant = this.selectedVariant();
    super.populateLayout(target, writer);
  }

  onDataChanged(_paths: readonly string[], writer: UiEmbeddedLayoutWriter): void {
    const next = this.selectedVariant();
    if (next === this.lastVariant) return;
    // replaceChildren disposes the retired variant's registered descendants
    // and publishes the replacement through the canonical CTX layout writer.
    // Guard reentrant CTX notifications during replacement.
    const previous = this.lastVariant;
    this.lastVariant = next;
    try {
      writer.replaceChildren([], (target, composition) => {
        composition.add(target, 'body', 'region', selector(this.definition.id));
        for (const child of this.children()) composition.mount(target, child, []);
      });
    } catch (error) {
      this.lastVariant = previous;
      throw error;
    }
  }
}
