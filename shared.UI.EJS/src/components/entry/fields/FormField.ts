import { renderNativeComponent } from '../../native-template.js';
import {
  uiEntryFieldPresentation,
  uiEntryReadOnlyRepresentation,
  type UiEntryLevel,
  createUiFieldBehavior,
  type UiEntryFieldPresentation,
  type UiEntryLayoutItem,
} from '@manatos/shared-ui';
import type { MetadataLanguage } from '@manatos/shared';
import { updateEntryFieldControl } from './FieldComponents.js';
import { updateFieldToolAvailability } from './FieldToolsMenu.js';
import { renderEntryLayoutField } from './EntryLayoutField.js';
import { renderEntryLayoutDeferred } from './EntryLayoutDeferred.js';
import { renderEntryLayoutSummary } from './EntryLayoutSummary.js';
import { renderEntryLayoutCollection } from './EntryLayoutCollection.js';
import { renderEntryLayoutGroup } from './EntryLayoutGroup.js';
/** Native FormField composes the typed Field slot and its distinct Tools child.
 * Its own HTML declares the label, typed Field and validation placeholders;
 * typed renderers handle control values while FieldToolsMenu handles actions.
 * Do not insert Tools invisibly from EntryFieldComponent. Debug here when
 * a typed control is missing. */
export function renderFormField(field: UiEntryFieldPresentation): string {
  const policy = createUiFieldBehavior(field.entityKey, field.field).control;
  let controlClass = '';
  if (policy.tools.length > 0) controlClass = ' has-field-tools';
  else if (policy.semantic) controlClass = ' is-semantic';
  return renderNativeComponent(
    'FormField',
    {
      Id: field.layoutId ?? '',
      Field: field.field,
      Type: field.type,
      Label: `${field.label}:`,
      SemanticClass: controlClass,
    },
    { Required: field.required ? ' <strong class="manatos-form-required">(*)</strong>' : '' },
  );
}
/**
 * Entry presentation policy registry. Adding a layout kind requires a registered
 * renderer, not a new switch in the framework or consumer host.
 * Each renderer owns exactly one kind's markup; nesting delegates to the same
 * registry and never invents a second layout/data model.
 */
type EntryRenderer = (
  item: UiEntryLayoutItem,
  entityKey: string,
  language: MetadataLanguage,
) => string;
export const entryLayoutSpan = (value: number): number =>
  Number.isInteger(value) && value >= 1 && value <= 12 ? value : 12;
const layoutRenderers = new Map<UiEntryLayoutItem['kind'], EntryRenderer>();

layoutRenderers.set('field', renderEntryLayoutField);
layoutRenderers.set('deferred', renderEntryLayoutDeferred);
layoutRenderers.set('summary', (item) =>
  renderEntryLayoutSummary(item as Extract<UiEntryLayoutItem, { kind: 'summary' }>),
);
layoutRenderers.set('collection', (item) =>
  renderEntryLayoutCollection(item as Extract<UiEntryLayoutItem, { kind: 'collection' }>),
);
// Passive native-only leaves own no actions or state. Their concrete markup
// is in EntryBreak.html / EntrySpacer.html; do not invent owner classes solely
// to forward calls to the generic template renderer.
layoutRenderers.set('break', (item) => renderNativeComponent('EntryBreak', { Id: item.layoutId }));
layoutRenderers.set('spacer', (item) =>
  renderNativeComponent('EntrySpacer', { Id: item.layoutId, Span: entryLayoutSpan(item.span) }),
);
layoutRenderers.set('column', renderEntryLayoutGroup);
layoutRenderers.set('inline', renderEntryLayoutGroup);

/** Fail closed for unknown kinds; no silent fallback or unregistered behavior.
 * UIS ownership: recursive Entry layout composition through the registered EJS kind renderers, with each concrete HTML child kept in its named template. */
export function renderEntryLayout(
  items: readonly UiEntryLayoutItem[],
  entityKey: string,
  language: MetadataLanguage,
): string {
  return renderNativeComponent(
    'EntryFields',
    {},
    {
      Items: items
        .map((item) => {
          const renderer = layoutRenderers.get(item.kind);
          if (!renderer) throw new Error(`Unregistered Entry layout kind: ${item.kind}`);
          return renderer(item, entityKey, language);
        })
        .join(''),
    },
  );
}

/** The FormField child owns its visibility, dirty/invalid state, issues and
 * typed-control refresh. Never make EntryPageHost walk FormField descendants;
 * keep canonical presentation construction at the semantic metadata boundary.
 * Debug: updateEntryFieldControl -> concrete Field.update; tool state in
 * updateFieldToolAvailability; neither method writes #data.current.
 */
export function updateEntryFormFields(
  section: HTMLElement,
  level: UiEntryLevel,
  entityKey: string,
  language: MetadataLanguage,
  inspectAllowed = false,
  canReadEntity: ((entityKey: string) => boolean) | undefined = undefined,
  canCreateEntity: ((entityKey: string) => boolean) | undefined = undefined,
): void {
  for (const node of section.querySelectorAll<HTMLElement>('[data-entry-readonly-field]')) {
    const fieldName = node.dataset['entryReadonlyField'];
    const kind = node.dataset['entryRepresentation'];
    if (!fieldName || !kind || !/^(summary|badge|portrait|entry-link|period)$/.test(kind)) continue;
    const model = uiEntryFieldPresentation(
      entityKey,
      fieldName,
      level.data.current?.[fieldName],
      language,
      undefined,
      typeof level.data.current?.id === 'string' ? level.data.current.id : undefined,
      level.data.references,
      level.state.fields[fieldName],
      undefined,
      level.data.referenceCatalogueStatus,
    );
    if (!model) continue;
    node.hidden = !model.visible;
    const labelNode = node.querySelector<HTMLElement>('.manatos-entry-readonly-label');
    if (labelNode) labelNode.textContent = model.label;
    const target = node.querySelector<HTMLElement>('.manatos-entry-readonly-value');
    if (!target) continue;
    const relatedFields = (node.dataset['entryRelatedFields'] ?? '').split(',').filter(Boolean);
    const display = uiEntryReadOnlyRepresentation(
      model,
      kind as import('@manatos/shared').SysBOUIFieldRepresentation,
      level.data.current,
      relatedFields,
    );
    target.replaceChildren();
    if (display.kind === 'portrait') {
      if (display.imageUrl) {
        const image = node.ownerDocument.createElement('img');
        image.className = 'manatos-entry-readonly-portrait';
        image.src = display.imageUrl;
        image.alt = model.label;
        target.append(image);
      }
    } else {
      const value = node.ownerDocument.createElement(display.href ? 'a' : 'span');
      value.textContent = display.text;
      if (display.href && value instanceof HTMLAnchorElement) value.href = display.href;
      if (display.kind === 'badge') value.className = 'manatos-entry-readonly-badge';
      target.append(value);
    }
  }
  for (const fieldNode of section.querySelectorAll<HTMLElement>('[data-entry-field]')) {
    const field = fieldNode.dataset['entryField'];
    if (!field) continue;
    const model = uiEntryFieldPresentation(
      entityKey,
      field,
      level.data.current?.[field],
      language,
      undefined,
      typeof level.data.current?.id === 'string' ? level.data.current.id : undefined,
      level.data.references,
      level.state.fields[field],
      undefined,
      level.data.referenceCatalogueStatus,
    );
    if (!model) continue;
    fieldNode.hidden = !model.visible;
    fieldNode.classList.toggle('is-changed', model.dirty);
    fieldNode.classList.toggle('is-invalid', !model.valid);
    fieldNode.classList.toggle('is-readonly', model.readOnly);
    const issuesNode = fieldNode.querySelector<HTMLElement>('.manatos-form-field-issues');
    if (issuesNode) {
      issuesNode.textContent = model.issues.join('; ');
      issuesNode.hidden = model.valid;
    }
    updateEntryFieldControl(
      fieldNode,
      model.relatedEntityKey
        ? {
            ...model,
            canViewRelated: canReadEntity?.(model.relatedEntityKey) === true,
            canCreateRelated: canCreateEntity?.(model.relatedEntityKey) === true,
          }
        : model,
      level.data.history[field],
    );
    updateFieldToolAvailability(
      fieldNode,
      model.relatedEntityKey
        ? {
            ...model,
            canViewRelated: canReadEntity?.(model.relatedEntityKey) === true,
            canCreateRelated: canCreateEntity?.(model.relatedEntityKey) === true,
          }
        : model,
      inspectAllowed,
    );
  }
}
