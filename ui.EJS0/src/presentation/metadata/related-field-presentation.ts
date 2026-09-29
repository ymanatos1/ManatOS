/**
 * Canonical presentation descriptor for one field in a related-collection row.
 *
 * Canonical BO calculations are deliberately NOT discovered here. Related rows
 * cross the UI boundary only after createCalculatedRecordProjector() has already
 * materialized the related entity's canonical calculated fields. Collection
 * presentation therefore consumes the projected row value unless the collection
 * field explicitly declares a UI-only value expression.
 */

type UnknownRecord = Readonly<Record<string, unknown>>;

export interface RelatedCollectionFieldPresentationDescriptor {
  sourceField: string;
  valueExpression: string | null;
  toneExpression: string | null;
  iconExpression: string | null;
  staticTone: string | null;
  staticIcon: string | null;
}

const asRecord = (value: unknown): UnknownRecord | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;

const expressionOf = (value: unknown): string | null => {
  const expression = asRecord(value)?.expression;
  return typeof expression === 'string' && expression.length > 0 ? expression : null;
};

const stringValue = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null;

export function describeRelatedCollectionField(
  fieldKey: string,
  field: unknown,
): RelatedCollectionFieldPresentationDescriptor {
  const metadata = asRecord(field) ?? {};
  const presentation = asRecord(metadata.presentation) ?? {};

  return {
    sourceField: stringValue(metadata.sourceField) ?? fieldKey,
    valueExpression: stringValue(metadata.expression),
    toneExpression: expressionOf(presentation.tone),
    iconExpression: expressionOf(presentation.icon),
    staticTone: stringValue(presentation.tone),
    staticIcon: stringValue(presentation.icon),
  };
}

export function resolveProjectedRelatedCollectionValue(
  row: Readonly<Record<string, unknown>> | null | undefined,
  fieldKey: string,
  field: unknown,
) {
  const descriptor = describeRelatedCollectionField(fieldKey, field);
  return {
    raw: descriptor.valueExpression ? undefined : row?.[descriptor.sourceField],
    tone: descriptor.staticTone,
    icon: descriptor.staticIcon,
    calculated: Boolean(descriptor.valueExpression),
    expression: descriptor.valueExpression,
    toneExpression: descriptor.toneExpression,
    iconExpression: descriptor.iconExpression,
    sourceField: descriptor.sourceField,
  };
}
