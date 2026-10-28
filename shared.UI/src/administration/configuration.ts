/** API-projected, redacted Configuration setting. Raw encrypted secrets never reach UIS. */
export interface UiConfigurationSetting {
  readonly id: string;
  readonly name: string;
  readonly group: string;
  readonly description?: string | null;
  readonly value: string | null;
  readonly valueType: 'boolean' | 'enum' | 'number' | 'string' | 'secret';
  readonly allowedValues?: readonly string[] | null;
  readonly defaultValue?: string | null;
  readonly restartRequired: boolean;
  readonly editable: boolean;
  readonly enabled: boolean;
  readonly sensitive: boolean;
  readonly secretConfigured?: boolean;
}

export type UiConfigurationGroup = Readonly<{
  name: string;
  items: readonly UiConfigurationSetting[];
}>;

/** Preserves API order, with no duplication of canonical values or secret values. */
export function groupUiConfigurations(
  items: readonly UiConfigurationSetting[],
): UiConfigurationGroup[] {
  const grouped = new Map<string, UiConfigurationSetting[]>();
  for (const item of items) {
    const key = item.group || 'Other';
    const group = grouped.get(key) ?? [];
    group.push(item);
    grouped.set(key, group);
  }
  return [...grouped].map(([name, members]) => ({ name, items: members }));
}

/**
 * Fast input feedback only. The API performs the authoritative validation
 * before applying any setting, including settings changed in another session.
 */
export function configurationInputError(
  item: UiConfigurationSetting,
  value: string,
): string | null {
  if (!value) {
    return null;
  }

  if (item.valueType === 'number') {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) {
      return 'Enter a positive number.';
    }
  }

  if (item.valueType === 'boolean' && value !== 'true' && value !== 'false') {
    return 'Choose true or false.';
  }

  if (item.valueType === 'enum' && item.allowedValues && !item.allowedValues.includes(value)) {
    return 'Choose one of the available values.';
  }

  return null;
}

/** Detect unapplied Configuration changes without exposing replacement secrets. */
export function hasDirtyConfigurationDrafts(
  items: readonly UiConfigurationSetting[],
  drafts: ReadonlyMap<string, string>,
): boolean {
  return items.some((item) => {
    const draft = drafts.get(item.id);
    return draft !== undefined && draft !== (item.sensitive ? '' : (item.value ?? ''));
  });
}
