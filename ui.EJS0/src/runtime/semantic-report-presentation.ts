/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Canonical presentation boundary for semantic change reports.
 *
 * Report producers own semantic change collection. This adapter owns the final
 * presentation pass and runtime-resource authority supplied to the universal
 * hierarchical renderer. Consumers select only a live or recovered authority.
 */
const browserWindow = window as any;
browserWindow.ManatOS ||= {};

export interface SemanticReportPresentationContext {
  readonly ownerPath: string | null;
  readonly resolveRuntimeResource: (scope: string | null, key: string, descriptor?: any) => unknown;
}

export class SemanticReportPresentation {
  install(): void {
    const live = (ownerPath: string | null): SemanticReportPresentationContext => ({
      ownerPath,
      resolveRuntimeResource: (_scope, key) => {
        if (!ownerPath || !key) return null;
        return browserWindow.ManatOS?.uiRuntimeResourceForPath?.(ownerPath, key) || null;
      },
    });

    const recovered = (surfaces: any[]): SemanticReportPresentationContext => ({
      ownerPath: null,
      resolveRuntimeResource: (scope, key) => {
        const match = /^recovery-surface:(\d+)$/.exec(String(scope || ''));
        const resourceKey = String(key || '');
        if (!resourceKey) return null;
        return match ? surfaces?.[Number(match[1])]?.runtimeResources?.[resourceKey] || null : null;
      },
    });

    const present = (model: any, context: SemanticReportPresentationContext) =>
      browserWindow.ManatOS?.semanticChangePresentation?.presentReportModel?.(
        model,
        context?.ownerPath ?? null,
      ) || model;

    const render = (
      host: any,
      model: any,
      context: SemanticReportPresentationContext,
      options: { summary?: string } = {},
    ) => {
      const presented = present(model, context);
      browserWindow.ManatOS?.hierarchicalReport?.render?.(
        host,
        {
          ...(presented || {}),
          ...(options.summary ? { summary: options.summary } : {}),
        },
        { runtimeResourceResolver: context?.resolveRuntimeResource },
      );
      return presented;
    };

    browserWindow.ManatOS.semanticReportPresentation = Object.freeze({
      live,
      recovered,
      present,
      render,
    });
  }
}

export const semanticReportPresentation = new SemanticReportPresentation();
