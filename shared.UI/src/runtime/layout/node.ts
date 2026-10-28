import type { UiSemanticLayoutNode } from '../component.js';

/**
 * Canonical CTX semantic node-properties symbol.
 * Properties are non-enumerable so they do not appear as
 * ordinary #layout children in the CTX debugger.
 */
export const UI_LAYOUT_NODE_PROPERTIES = Symbol.for('manatos.ctx.node-properties');

/**
 * Construct a semantic layout node without depending on
 * pages, popups, Angular, or EJS.
 *
 * The caller supplies the renderer reference and DOM selector.
 * The owning surface remains responsible for CTX publication.
 */
export function createUiSemanticLayoutNode(
  kind: string,
  id: string,
  rendererRef: string,
  domSelector: string,
  children: Record<string, UiSemanticLayoutNode> = {},
  field?: string,
  traverseChildren = false,
): UiSemanticLayoutNode {
  Object.defineProperty(children, UI_LAYOUT_NODE_PROPERTIES, {
    value: Object.freeze({
      key: id,
      kind,
      ...(field ? { field } : {}),
      rendererRef,
      domSelector,
      ...(traverseChildren ? { traverseChildren: true } : {}),
    }),
    enumerable: false,
  });

  return children;
}

/**
 * Preserve the semantic metadata when replacing a layout node.
 * The original property descriptor is retained, including its
 * non-enumerable status and immutability characteristics.
 */
export function copyUiSemanticLayoutNodeMetadata(
  source: object,
  destination: UiSemanticLayoutNode,
): void {
  const descriptor = Object.getOwnPropertyDescriptor(source, UI_LAYOUT_NODE_PROPERTIES);

  if (descriptor) {
    Object.defineProperty(destination, UI_LAYOUT_NODE_PROPERTIES, descriptor);
  }
}

/**
 * Reject unsafe semantic layout member names before they are
 * used as object keys or appended to CTX paths.
 */
export function validateUiSemanticLayoutMember(member: string): void {
  if (!member || member === '__proto__' || member === 'prototype' || member === 'constructor') {
    throw new Error(`Invalid embedded layout member: ${member}`);
  }
}
