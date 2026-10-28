/**
 * UIS SOURCE NAVIGATION — HierarchicalReport.
 * Angular native adapter: renders the shared semantic component; does not own canonical #layout/data.
 * Breakpoints here: constructor/registration; follow inherited hooks below.
 * Follow: common/popups/PopupBase.ts -> shared.UI/src/popups/embedded.
 * Cross-layer: Semantic owner: shared.UI/src/popups/embedded; EJS: shared.UI.EJS/src/components/common.
 * Source tracing: setUiComponentSourceTraceSink() in shared.UI/src/runtime/source-trace.ts.
 */
import { Component, forwardRef, input, output, signal } from '@angular/core';
import { resolveMetadataText, type MetadataLanguage } from '@manatos/shared';
import type { UiChangeNode } from '@manatos/shared-ui';

/** Recursive semantic report: one renderer for Entry, Workspace, Recovery and Organization. */
@Component({
  selector: 'manatos-hierarchical-report',
  standalone: true,
  imports: [forwardRef(() => HierarchicalReport)],
  templateUrl: './HierarchicalReport.html',
  styleUrl: './HierarchicalReport.css',
})
export class HierarchicalReport {
  readonly nodes = input.required<readonly UiChangeNode[]>();
  readonly summary = input<string>('');
  readonly language = input<MetadataLanguage>('EN');
  readonly nested = input(false);
  readonly parentPath = input('');
  readonly expansionState = input<Readonly<Record<string, boolean>>>({});
  readonly nodeExpanded = output<Readonly<{ path: string; expanded: boolean }>>();
  protected readonly localExpansion = signal<Readonly<Record<string, boolean>>>({});

  protected path(node: UiChangeNode): string {
    return `${this.parentPath()}/${node.id}`;
  }
  protected expanded(node: UiChangeNode): boolean {
    const path = this.path(node);
    const overrides = this.nested() ? this.expansionState() : this.localExpansion();
    return overrides[path] ?? node.expanded ?? false;
  }
  protected onNodeToggle(node: UiChangeNode, event: Event): void {
    const details = event.target;
    if (!(details instanceof HTMLDetailsElement)) return;
    this.onChildExpanded({ path: this.path(node), expanded: details.open });
  }
  protected onChildExpanded(change: Readonly<{ path: string; expanded: boolean }>): void {
    if (this.nested()) this.nodeExpanded.emit(change);
    else
      this.localExpansion.update((previous) => ({ ...previous, [change.path]: change.expanded }));
  }
  protected setExpanded(expanded: boolean): void {
    const changes: Record<string, boolean> = {};
    const collect = (nodes: readonly UiChangeNode[], parent: string): void => {
      for (const node of nodes) {
        const path = `${parent}/${node.id}`;
        changes[path] = expanded;
        collect(node.children ?? [], path);
      }
    };
    collect(this.nodes(), this.parentPath());
    this.localExpansion.update((previous) => ({ ...previous, ...changes }));
  }
  protected tr(key: string): string {
    return resolveMetadataText(`@CM.${key}`, this.language());
  }
  protected icon(icon: string | undefined): string {
    return `bi bi-${icon && /^[a-z0-9-]+$/.test(icon) ? icon : 'dot'}`;
  }
}
