/* Browser bridge to the canonical shared ManatOS expression compiler.
 *
 * Expression source is the portable metadata contract. The AST is compiled
 * locally and cached by source on this execution host; it is not a wire-level
 * UI contract. Server-side consumers independently use the same shared parser.
 */
(() => {
  'use strict';

  const manatos = (window.ManatOS = window.ManatOS || {});
  const cache = new Map();

  manatos.expressionCompilerReady = import('/shared-runtime/expressions/parser.js').then(
    ({ compileExpression }) => {
      const compile = (source) => {
        if (typeof source !== 'string' || !source.trim()) return null;
        let compiled = cache.get(source);
        if (!compiled) {
          compiled = compileExpression(source);
          cache.set(source, compiled);
        }
        return compiled;
      };

      manatos.expressionCompiler = Object.freeze({
        compile,
        ast: (source) => compile(source)?.ast ?? null,
      });
      return manatos.expressionCompiler;
    },
  );
})();
