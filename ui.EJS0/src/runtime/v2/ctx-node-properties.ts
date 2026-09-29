/**
 * Keyed descriptive metadata attached to a CTX node without becoming part of
 * the node's enumerable value/tree structure. Properties describe the node;
 * Attributes remain the separate boolean semantic-trait contract exposed by
 * the browser CTX runtime.
 */
export const CTX_NODE_PROPERTIES_SYMBOL_KEY = 'manatos.ctx.node-properties';

export type CtxNodePropertyValue = string | number | boolean | null;
export type CtxNodeProperties = Readonly<Record<string, CtxNodePropertyValue>>;

export const withCtxNodeProperties = <T extends object>(
  value: T,
  properties?: CtxNodeProperties | null,
): T => {
  if (properties && Object.keys(properties).length > 0) {
    Object.defineProperty(value, Symbol.for(CTX_NODE_PROPERTIES_SYMBOL_KEY), {
      value: Object.freeze({ ...properties }),
      enumerable: false,
      configurable: false,
      writable: false,
    });
  }
  return Object.freeze(value);
};

export const ctxNodePropertiesOf = (value: object): CtxNodeProperties | undefined =>
  (value as Record<symbol, CtxNodeProperties | undefined>)[
    Symbol.for(CTX_NODE_PROPERTIES_SYMBOL_KEY)
  ];
