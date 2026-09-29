import type { UiInvocation } from '../runtime/v2/contracts.js';
import { UiRuntime } from '../runtime/v2/ui-runtime.js';
import { installUiDomIdentity } from './ui-dom-identity.js';
import {
  UiContext,
  type UiCtxChange,
  type UiCtxObject,
  type UiCtxRuntimePort,
  type UiCtxSubscriptionDetails,
} from '../runtime/v2/ui-context.js';

interface BootstrapControl {
  readonly id?: unknown;
  readonly host?: unknown;
  readonly kind?: unknown;
  readonly mode?: unknown;
  readonly entityKey?: unknown;
  readonly entityName?: unknown;
  readonly invocation?: unknown;
}

interface BootstrapLevel extends UiCtxObject {
  readonly control?: BootstrapControl;
  readonly level?: BootstrapLevel | null;
}

interface BrowserCtxRuntime extends Omit<UiCtxRuntimePort, 'subscribe'> {
  readonly eventName?: string;
  trackSubscriber?(
    paths: string | readonly string[],
    details?: UiCtxSubscriptionDetails,
  ): () => void;
  readonly value: UiCtxObject & { readonly ui?: { readonly level?: BootstrapLevel | null } };
}

interface ManatOSBrowserGlobal {
  ctx?: BrowserCtxRuntime;
  uiRuntimeV2?: UiRuntime;
}

declare global {
  interface Window {
    ManatOS?: ManatOSBrowserGlobal;
  }
}

const record = (value: unknown): Readonly<Record<string, unknown>> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : null;

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

const pathsOverlap = (left: string, right: string): boolean =>
  left === right ||
  left.startsWith(`${right}.`) ||
  left.startsWith(`${right}[`) ||
  right.startsWith(`${left}.`) ||
  right.startsWith(`${left}[`);

const canonicalPort = (ctx: BrowserCtxRuntime): UiCtxRuntimePort => ({
  ...ctx,
  subscribe: (path, listener, details) => {
    const eventName = ctx.eventName ?? 'manatos:ctx-change';
    const releaseTelemetry = ctx.trackSubscriber?.(path, details) ?? (() => {});
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<UiCtxChange>).detail;
      const related = detail?.relatedPaths ?? [];
      if (
        detail &&
        (pathsOverlap(path, detail.path) ||
          related.some((candidate) => pathsOverlap(path, candidate)))
      ) {
        listener(detail);
      }
    };
    window.addEventListener(eventName, handler);
    return () => {
      window.removeEventListener(eventName, handler);
      releaseTelemetry();
    };
  },
});

const invocationFor = (control: BootstrapControl): UiInvocation => {
  const host = text(control.host);
  const surface = text(control.kind);
  if (!host || !surface) throw new Error('Bootstrap UI level requires host and kind.');
  const legacyInvocation = record(control.invocation) ?? {};
  const entity = text(control.entityKey);
  const mode = text(control.mode);
  const entityName = text(control.entityName);
  return {
    surface,
    host,
    ...(entity ? { entity } : {}),
    ...(mode ? { mode } : {}),
    parameters: Object.freeze({
      legacyInvocation,
      ...(entityName ? { entityName } : {}),
    }),
  };
};

/**
 * Adopt the server/bootstrap-created UI chain exactly once at browser startup.
 * After this boundary UiRuntime is the sole topology/lifecycle authority: CTX
 * mutations are observable semantic state, never instructions to reconstruct
 * or reconcile the typed UiLevel tree.
 */
export const installRuntimeBootstrap = (): UiRuntime => {
  const ctx = window.ManatOS?.ctx;
  if (!ctx) throw new Error('Typed UI runtime requires canonical CTX to be initialized first.');
  const port = canonicalPort(ctx);
  const runtime = new UiRuntime();

  let parent = runtime.root;
  const adoptedLevels = [];
  let level = ctx.value.ui?.level ?? null;
  let path = 'ctx.ui.level';
  while (level) {
    const control = level.control;
    const id = text(control?.id);
    if (!control || !id) throw new Error(`Bootstrap UI level at ${path} requires an id.`);
    parent = runtime.adoptChild(
      parent,
      id,
      invocationFor(control),
      new UiContext(path, level, port),
    );
    adoptedLevels.push(parent);
    level = level.level ?? null;
    path += '.level';
  }

  // Bootstrap projects structure and semantic data, never lifecycle truth. Once
  // the complete chain is adopted, UiRuntime establishes the canonical active
  // leaf and inactive ancestors through the same lifecycle API used thereafter.
  for (const adopted of adoptedLevels.slice(0, -1))
    runtime.deactivate(adopted, 'runtime-bootstrap');
  const activeLeaf = adoptedLevels.at(-1);
  if (activeLeaf) runtime.activate(activeLeaf, 'runtime-bootstrap');

  window.ManatOS ||= {};
  window.ManatOS.uiRuntimeV2 = runtime;
  installUiDomIdentity(runtime);
  return runtime;
};
