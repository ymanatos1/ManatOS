import { UiSimpleFieldBehavior, escapeFieldHtml, uiFieldIcon } from '../field-types.js';

/** UIS FieldBehavior: Defines structured version parts and conversion; native VersionField owns the segment controls. Never relocate semantic child composition to this policy object. */
export class VersionFieldBehavior extends UiSimpleFieldBehavior {
  readonly type = 'version' as const;
  override readonly control = {
    input: 'none',
    semantic: true,
    tools: ['copy', 'revert', 'inspect-ctx', 'clear'],
    icon: 'hash',
    parts: [
      { id: 'major', kind: 'input', selector: '[data-version-part="major"]' },
      { id: 'minor', kind: 'input', selector: '[data-version-part="minor"]' },
      { id: 'patch', kind: 'input', selector: '[data-version-part="patch"]' },
    ],
  } as const;
  protected override formatValueHtml(value: unknown): string {
    if (value === null || value === undefined || value === '') return '—';
    return `<span class="manatos-field-badge manatos-field-badge--version">${uiFieldIcon('tag')} ${escapeFieldHtml(value)}</span>`;
  }
}

/** Three numeric fields are only a view of the canonical version string. */
export function uiVersionParts(value: unknown): { major: string; minor: string; patch: string } {
  const match = typeof value === 'string' ? /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(value) : null;
  return { major: match?.[1] ?? '', minor: match?.[2] ?? '', patch: match?.[3] ?? '' };
}
