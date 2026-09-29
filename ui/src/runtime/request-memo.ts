import type { Request } from 'express';

/**
 * Request-lifetime promise registry for UI-server support reads.
 *
 * Only callers that can define a complete semantic key may use this helper.
 * The registry dies with the Express Request (WeakMap ownership), so it cannot
 * leak authorization/session facts across requests or become a process cache.
 */
const requestPromises = new WeakMap<Request, Map<string, Promise<unknown>>>();

export function memoizeRequest<T>(req: Request, key: string, load: () => Promise<T>): Promise<T> {
  let registry = requestPromises.get(req);
  if (!registry) {
    registry = new Map<string, Promise<unknown>>();
    requestPromises.set(req, registry);
  }

  const existing = registry.get(key);
  if (existing) return existing as Promise<T>;

  const pending = load();
  registry.set(key, pending);
  pending.catch(() => {
    if (registry?.get(key) === pending) registry.delete(key);
  });
  return pending;
}
