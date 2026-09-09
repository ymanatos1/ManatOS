import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const ui = (path: string) => readFile(resolve(here, '..', '..', path), 'utf8');

describe('V2 post-cutover architecture audit', () => {
  it('reconciles in-place saves through the active entry field and baseline authorities', async () => {
    const save = await ui('public/js/sysbo/entry/save.js');

    expect(save).toContain("let path = 'ctx.ui.level'");
    expect(save).not.toContain('runtime.replace(currentPath');
    expect(save).toContain('runtime.replace(fieldPath, value');
    expect(save).toContain('`${pagePath}.fields.${key}.originalValue`');
    expect(save).toContain('runtime.replace(baselinePath, value');
    expect(save).toContain('const persistedValues = Object.fromEntries(');
    expect(save).not.toContain('isV2Surface');
  });

  it('routes browser field mutations through one canonical CTX field owner', async () => {
    const ctxRuntime = await ui('public/js/runtime/context-runtime.js');
    const formRuntime = await ui('public/js/sysbo/entry/form-runtime.js');
    const save = await ui('public/js/sysbo/entry/save.js');
    const policy = await ui('public/js/runtime/entry-policy-runtime.js');

    expect(ctxRuntime).toContain(
      'if (match) return updateField(match[1], match[2], value, undefined, cause);',
    );
    expect(ctxRuntime).toContain('if (baselineMatch) return updateBaseline(');
    expect(formRuntime).not.toContain('syncCurrentValue');
    expect(formRuntime).toContain('runtime.updateField(pagePath, key, value, option, cause);');
    expect(save).not.toContain('runtime.updateField?.');
    expect(save).not.toContain('runtime.updateBaseline?.');
    expect(policy).toContain('ctx.replace?.(fieldPath, value');
    expect(policy).not.toContain('ctx.updateField?.');
  });

  it('shares host-neutral entry field policy instead of duplicating browser and TypeScript decisions', async () => {
    const semantic = await ui('src/runtime/state/entity-entry-runtime.ts');
    const resolver = await ui('src/runtime/resolvers/effective-ui-metadata-resolver.ts');
    const browser = await ui('public/js/runtime/entry-policy-runtime.js');
    const renderer = await ui('src/routes/sysbo/record-renderer.ts');

    expect(semantic).toContain('allowedInvocationOptionValues(metadata, override)');
    expect(semantic).toContain('reconcileRestrictedOptionValue(field.value, allowed)');
    expect(resolver).toContain('staticEntryFieldUx(');
    expect(browser).toContain("import('/shared-runtime/entry-field-policy.js')");
    expect(browser).toContain('fieldPolicy.allowedInvocationOptionValues(field, restriction)');
    expect(browser).toContain('fieldPolicy.staticEntryFieldUx(');
    expect(renderer).toContain('allowedInvocationOptionValues(field, override)');
    expect(browser).not.toContain('restriction.allowedValues.map(String)');
  });

  it('keeps V2 hierarchy relationship candidates inside V2 resources', async () => {
    const renderer = await ui('src/routes/sysbo/hierarchy-renderer.ts');
    const workspace = await ui('public/js/sysbo/hierarchy/hierarchy-workspace.js');

    expect(renderer).toContain('referenceData:');
    expect(renderer).toContain('parentListContext.referenceData');
    expect(workspace).toContain('`${pagePath}.resources.referenceData`');
    expect(workspace).toContain("let path = 'ctx.ui.level'");
    expect(workspace).toContain('`${pagePath}.resources.workspace`');
    expect(workspace).not.toContain("runtime.resolve('ctx.page')");
  });

  it('keeps normal browser expression transport source-only while reserving AST payloads for tooling', async () => {
    const renderer = await ui('src/presentation/page/render-page.ts');
    const entry = await ui('views/components/runtime/entity-entry.ejs');
    const field = await ui('views/components/sysbo/entry/fields/form-field.ejs');
    const component = await ui('views/components/sysbo/entry/shell/metadata-component.ejs');
    const summary = await ui('views/components/sysbo/entry/content/summary.ejs');
    const related = await ui('views/components/sysbo/entry/content/related-collections.ejs');
    const selector = await ui('views/popups/selectors/record-selector.ejs');
    const debugging = await ui('views/components/debugging/debugging-panel.ejs');

    const normalTransport = [renderer, entry, field, component, summary, related, selector].join(
      '\n',
    );
    expect(normalTransport).not.toMatch(/data-[a-z0-9_-]*ast=/i);
    expect(normalTransport).not.toContain('JSON.stringify(compiled.ast)');
    expect(normalTransport).not.toContain('JSON.stringify(expression.ast)');

    // AST serialization remains valid only when the AST itself is the developer
    // diagnostic payload being inspected, never as normal UI metadata transport.
    expect(debugging).toContain('data-debug-calculation-ast');
  });
});
