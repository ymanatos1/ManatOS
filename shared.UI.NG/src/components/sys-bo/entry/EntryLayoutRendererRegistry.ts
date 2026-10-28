/**
 * NG Entry layout renderer injection. Every semantic layout kind has one
 * dedicated Angular component; no switch is allowed in EntryLayout or hosts.
 * Unknown kinds fail explicitly rather than silently losing CTX content.
 */
import type { Type } from '@angular/core';
import type { UiEntryLayoutItem } from '@manatos/shared-ui';
import {
  EntryLayoutFieldComponent,
  EntryLayoutDeferredComponent,
  EntryLayoutBreakComponent,
  EntryLayoutSpacerComponent,
  EntryLayoutGroupComponent,
} from './EntryLayoutItems';
import { EntryLayoutSummaryComponent } from './EntryLayoutSummaryComponent';
import { EntryLayoutCollectionComponent } from './EntryLayoutCollectionComponent';

export type EntryLayoutKind = UiEntryLayoutItem['kind'];
/** UIS ownership: the explicit mapping of canonical layout kinds to Angular child renderers; no host switch. */
export class EntryLayoutRendererRegistry {
  private readonly components = new Map<EntryLayoutKind, Type<unknown>>();
  register(kind: EntryLayoutKind, component: Type<unknown>): this {
    if (this.components.has(kind)) throw new Error(`Duplicate Entry renderer: ${kind}`);
    this.components.set(kind, component);
    return this;
  }
  resolve(kind: EntryLayoutKind): Type<unknown> {
    const component = this.components.get(kind);
    if (!component) throw new Error(`Unregistered Entry renderer: ${kind}`);
    return component;
  }
}

export const entryLayoutRenderers = new EntryLayoutRendererRegistry()
  .register('field', EntryLayoutFieldComponent)
  .register('deferred', EntryLayoutDeferredComponent)
  .register('summary', EntryLayoutSummaryComponent)
  .register('collection', EntryLayoutCollectionComponent)
  .register('break', EntryLayoutBreakComponent)
  .register('spacer', EntryLayoutSpacerComponent)
  .register('column', EntryLayoutGroupComponent)
  .register('inline', EntryLayoutGroupComponent);
