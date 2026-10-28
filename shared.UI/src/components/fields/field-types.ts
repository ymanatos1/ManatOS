import type { UiEmbeddedControlEvent } from '../../runtime/component.js';
import {
  type ManatOSObjectMetadata,
  type MetadataLanguage,
  type SysBOFieldMetadata,
  type SysBOFieldType,
  type SysBOUIMetadata,
  type PreparedEntryRepresentation,
  isEmptyEntryFieldValue,
  prepareEntryRepresentation,
} from '@manatos/shared';

/** Canonical metadata is retained by reference, not copied into every List cell. */
export interface UiFieldMetadataContext {
  readonly entityKey: string;
  readonly fieldKey: string;
  readonly entity: ManatOSObjectMetadata<Record<string, unknown>>;
  readonly field: SysBOFieldMetadata;
  readonly ui: SysBOUIMetadata | null;
}

export type UiFieldReferences = Readonly<
  Record<string, readonly Readonly<Record<string, unknown>>[]>
>;

/**
 * Per-type Field contract used by semantic, NG and EJS components.
 * A new Field provides one registered behavior; no consumer adds a type switch.
 * Inputs are native facts, never DOM objects or mutations of #data.current.
 */
export interface UiFieldControlPart {
  readonly id: string;
  readonly kind: 'input' | 'value';
  readonly selector: string;
}

export interface UiFieldControlPolicy {
  /** Native control facts permitted for this kind. */
  readonly input: UiEmbeddedControlEvent['control'] | 'none';
  readonly semantic: boolean;
  /** Visible control DOM selector for debugger correlation when the input is hidden. */
  readonly presentationSelector?: string;
  readonly tools: readonly (
    | 'copy'
    | 'revert'
    | 'inspect-ctx'
    | 'trim'
    | 'clear'
    | 'zero'
    | 'today'
    | 'now'
    | 'duration-zero'
  )[];
  readonly icon: string;
  /** Relative selectors for constituent controls, owned by this Field kind. */
  readonly parts?: readonly UiFieldControlPart[];
}
export interface UiFieldOption {
  readonly value: string;
  readonly label: string;
  readonly icon?: string;
}
/** A Field's editing and validation policies; the Entry Surface remains the record owner. */
export interface UiFieldPolicy {
  /** Editing is opt-in; composite controls remain read-only until they supply an editor. */
  readonly editable: boolean;
  /** Field-local issues; aggregate record validation belongs to the Entry Surface. */
  validate(value: unknown, required: boolean, options: readonly UiFieldOption[]): readonly string[];
  /** Filter choices, if supported. List must not inspect concrete Field types. */
  filterOptions(language: MetadataLanguage): readonly UiFieldOption[];
}
export interface UiFieldBehavior extends UiFieldPolicy {
  readonly type: SysBOFieldType;
  readonly control: UiFieldControlPolicy;
  /** Return undefined for unsupported/invalid input; null is a deliberate clear. */
  decodeControl(event: UiEmbeddedControlEvent): unknown | undefined;
  readonly isPrimaryField: boolean;
  prepare(context: UiFieldMetadataContext): void;
  /** Plain text for editable/read-only form controls; never HTML. */
  formatText(value: unknown, language: MetadataLanguage): string;
  formatHtml(
    value: unknown,
    language: MetadataLanguage,
    row?: Readonly<Record<string, unknown>>,
    references?: UiFieldReferences,
    showAsLink?: boolean,
  ): string;
}

export function escapeFieldHtml(raw: unknown): string {
  return String(raw ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Only safely declared Bootstrap icon keys can reach generated HTML. */
export function uiFieldIcon(icon: unknown): string {
  return typeof icon === 'string' && /^[a-z][a-z0-9-]*$/i.test(icon.replace(/^bi-/, ''))
    ? `<i class="bi bi-${escapeFieldHtml(icon.replace(/^bi-/, ''))}" aria-hidden="true"></i>`
    : '';
}

export abstract class UiSimpleFieldBehavior implements UiFieldBehavior {
  abstract readonly type: SysBOFieldType;
  /** Unsupported editors never become writable merely because metadata allows editing. */
  readonly editable: boolean = false;
  /** Reusable native-neutral validation; specialized Fields extend it. */
  validate(
    value: unknown,
    required: boolean,
    _options: readonly UiFieldOption[],
  ): readonly string[] {
    void _options;
    const issues: string[] = [];
    if (required && isEmptyEntryFieldValue(value)) issues.push('Required value');
    const spec = this.metadata?.field;
    if (typeof value === 'string' && value !== '') {
      if (spec?.maxLength !== undefined && value.length > spec.maxLength)
        issues.push(`Maximum ${spec.maxLength} characters`);
      if (spec?.minLength !== undefined && value.length < spec.minLength)
        issues.push(`Minimum ${spec.minLength} characters`);
    }
    return issues;
  }
  /** Most Field types have no predefined filter choices. */
  filterOptions(_language: MetadataLanguage): readonly UiFieldOption[] {
    void _language;
    return [];
  }
  readonly control: UiFieldControlPolicy = {
    input: 'text',
    semantic: false,
    tools: ['copy', 'revert', 'inspect-ctx', 'clear'],
    icon: 'fonts',
  };

  /** Enforce the declared native input kind before the Surface receives an intent. */
  decodeControl(event: UiEmbeddedControlEvent): unknown | undefined {
    if (this.control.input === 'none' || event.control !== this.control.input) return undefined;
    return event.value;
  }

  protected metadata: UiFieldMetadataContext | null = null;
  private entryRepresentation: PreparedEntryRepresentation | null = null;
  private primaryField = false;
  get isPrimaryField(): boolean {
    return this.primaryField;
  }

  /** A component prepares its behavior once; only actual record values vary. */
  prepare(context: UiFieldMetadataContext): void {
    if (context.field.type !== this.type)
      throw new Error(`Field behavior mismatch: ${context.entityKey}.${context.fieldKey}`);
    this.metadata = context;
    this.primaryField = context.fieldKey === context.entity.primaryField;
    this.entryRepresentation = this.isPrimaryField
      ? prepareEntryRepresentation(context.entity, context.ui)
      : null;
  }

  formatText(value: unknown, language: MetadataLanguage): string {
    void language;
    if (value === null || value === undefined) return '';
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
  }

  /** List cells opt into opening the owning record; type-specific HTML remains the same. */
  formatHtml(
    value: unknown,
    language: MetadataLanguage,
    row?: Readonly<Record<string, unknown>>,
    references?: UiFieldReferences,
    showAsLink = false,
  ): string {
    const html = this.formatValueHtml(value, language, row, references, showAsLink);
    const recordId = row?.['id'];
    if (
      !showAsLink ||
      !this.metadata ||
      typeof recordId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(recordId) ||
      value === null ||
      value === undefined ||
      value === ''
    )
      return html;
    const href = `/bo/${encodeURIComponent(this.metadata.entityKey)}/${encodeURIComponent(recordId)}`;
    const icons =
      this.entryRepresentation?.(row ?? {}, { language })
        .icons.map(uiFieldIcon)
        .filter(Boolean)
        .join(' ') ?? '';
    // A typed value might already have a link (e.g. mailto). Never nest anchors.
    const content = /<a\b/i.test(html) ? escapeFieldHtml(this.formatText(value, language)) : html;
    return `<a class="manatos-field-entry-name" href="${href}">${icons ? `${icons} ` : ''}${content}</a>`;
  }

  protected formatValueHtml(
    value: unknown,
    language: MetadataLanguage,
    _row?: Readonly<Record<string, unknown>>,
    _references?: UiFieldReferences,
    _showAsLink?: boolean,
  ): string {
    void language;
    void _row;
    void _references;
    void _showAsLink;
    if (value === null || value === undefined || value === '') return '—';
    return escapeFieldHtml(typeof value === 'object' ? JSON.stringify(value) : value);
  }
}
