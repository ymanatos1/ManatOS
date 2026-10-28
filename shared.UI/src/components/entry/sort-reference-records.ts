/** Stable creation order for authorized reference candidate catalogues. */
export function sortReferenceRecords<T extends Readonly<Record<string, unknown>>>(
  records: readonly T[],
): T[] {
  const compare = (left: unknown, right: unknown) =>
    String(left ?? '').localeCompare(String(right ?? ''), undefined, {
      numeric: true,
      sensitivity: 'base',
    });
  return [...records].sort(
    (left, right) =>
      compare(left['createdAt'], right['createdAt']) ||
      String(left['id'] ?? '').localeCompare(String(right['id'] ?? '')),
  );
}
