/**
 * Pure reactive-runtime rules shared by the semantic TypeScript runtime and
 * the production browser adapter. Hosts still own scheduling, expression
 * evaluation and mutation; this module owns only dependency/change semantics.
 */
export function reactivePathsOverlap(left: string, right: string): boolean {
  if (left === right) return true;
  const childOf = (candidate: string, parent: string) =>
    candidate.startsWith(`${parent}.`) || candidate.startsWith(`${parent}[`);
  return childOf(left, right) || childOf(right, left);
}

export function reactiveDependencyMatchesChange(dependency: string, changedPath: string): boolean {
  return reactivePathsOverlap(dependency, changedPath);
}

export function reactiveChangeQueueKey(
  changedPath: string,
  cause: Readonly<{ rootEventId?: unknown; eventId?: unknown }> | null | undefined,
): string {
  const eventIdentity =
    (typeof cause?.rootEventId === 'string' && cause.rootEventId) ||
    (typeof cause?.eventId === 'string' && cause.eventId) ||
    'event';
  return `${eventIdentity}|${changedPath}`;
}
