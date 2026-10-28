import { ContextTreeRuntime, type ApiDiagnosticContextSnapshot } from '@manatos/shared';

export function createApiTrafficContextRuntime(
  snapshot: ApiDiagnosticContextSnapshot,
): ContextTreeRuntime<object> {
  const raw = snapshot.ctx;
  const root = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : { value: raw };
  return new ContextTreeRuntime(root as object);
}
