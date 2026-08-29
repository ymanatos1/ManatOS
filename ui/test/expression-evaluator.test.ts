import {describe, expect, it} from 'vitest';
import {
  ExpressionEvaluationError,
  ExpressionParseError,
  calculatedContextField,
  compileExpression,
  evaluateExpression,
  type ExpressionNode,
} from '@manatos/shared';

function testCtx() {
  const mcrm = {id: 'mcrm', name: 'ManatOS CRM Platform', enabled: true};
  return {
    company: {platforms: [mcrm]},
    page: {
      fields: {
        firstname: {value: 'Yiannis'},
        lastname: {value: 'Manatos'},
        amount: {value: 12},
      },
    },
  };
}

describe('ManatOS expression parser/evaluator', () => {
  it('builds the expected left-associative AST for string concatenation', () => {
    const compiled = compileExpression("firstname + ' ' + lastname");
    expect(compiled.ast).toEqual({
      kind: 'binary',
      operator: '+',
      left: {
        kind: 'binary',
        operator: '+',
        left: {kind: 'variable', path: 'firstname', members: ['firstname'], absolute: false},
        right: {kind: 'literal', value: ' '},
      },
      right: {kind: 'variable', path: 'lastname', members: ['lastname'], absolute: false},
    } satisfies ExpressionNode);
  });

  it('honors precedence, associativity and explicit grouping', () => {
    const ctx = testCtx();
    expect(evaluateExpression('2 + 3 * 4', ctx, ctx.page.fields)).toBe(14);
    expect(evaluateExpression('10 - 5 - 2', ctx, ctx.page.fields)).toBe(3);
    expect(evaluateExpression('2 ** 3 ** 2', ctx, ctx.page.fields)).toBe(512);
    expect(evaluateExpression('(2 + 3) * 4', ctx, ctx.page.fields)).toBe(20);
    expect(evaluateExpression('-2 ** 2', ctx, ctx.page.fields)).toBe(-4);
  });

  it('concatenates strings/numbers with + but keeps other arithmetic strict', () => {
    const ctx = testCtx();
    expect(evaluateExpression("'Value=' + 12", ctx, ctx.page.fields)).toBe('Value=12');
    expect(evaluateExpression("12 + 'px'", ctx, ctx.page.fields)).toBe('12px');
    expect(() => evaluateExpression("'10' - 2", ctx, ctx.page.fields)).toThrow(ExpressionEvaluationError);
  });


  it('supports boolean equality and right-associative ternary conditionals', () => {
    const ctx = {
      fields: {
        emailVerified: {value: true},
        enabled: {value: false},
      },
    };

    expect(evaluateExpression("emailVerified == true ? 'Verified' : 'Not verified'", ctx, ctx.fields)).toBe('Verified');
    expect(evaluateExpression("enabled == true ? 'Enabled' : 'Disabled'", ctx, ctx.fields)).toBe('Disabled');
    expect(evaluateExpression("emailVerified != false ? 'Verified' : 'Not verified'", ctx, ctx.fields)).toBe('Verified');
    expect(evaluateExpression("false ? missingVariable : 'safe'", ctx, ctx.fields)).toBe('safe');

    const compiled = compileExpression("emailVerified == true ? 'Verified' : 'Not verified'");
    expect(compiled.ast).toMatchObject({
      kind: 'conditional',
      condition: {kind: 'binary', operator: '=='},
      whenTrue: {kind: 'literal', value: 'Verified'},
      whenFalse: {kind: 'literal', value: 'Not verified'},
    });
  });

  it('parses function calls against the hard-coded registry and evaluates nested arguments', () => {
    const ctx = testCtx();
    expect(evaluateExpression('SqRoot(9)', ctx, ctx.page.fields)).toBe(3);
    expect(evaluateExpression("StrFormat('{0} {1}', firstname, lastname)", ctx, ctx.page.fields)).toBe('Yiannis Manatos');
    expect(evaluateExpression('GetTime()', ctx, ctx.page.fields, {now: () => new Date(123456)})).toBe(123456);
    expect(() => compileExpression('MissingFunction(1)')).toThrow(ExpressionParseError);
    expect(() => compileExpression('SqRoot()')).toThrow(ExpressionParseError);
    expect(() => compileExpression("SqRoot('x')")).toThrow(ExpressionParseError);
  });

  it('keeps parsing context-agnostic and reports missing paths only during evaluation', () => {
    const compiled = compileExpression('future.page.value + 1');
    const ctx = testCtx();
    expect(compiled.ast.kind).toBe('binary');
    expect(() => evaluateExpression(compiled.source, ctx, ctx.page.fields)).toThrow(/variable not found/i);
  });

  it('resolves lexical variables from the current ctx node and explicit ctx paths from root', () => {
    const ctx = testCtx();
    expect(evaluateExpression("firstname + ' ' + lastname", ctx, ctx.page.fields)).toBe('Yiannis Manatos');
    expect(evaluateExpression('ctx.page.fields.amount.value * 2', ctx, ctx.page.fields)).toBe(24);
  });

  it('resolves keyed arrays both by zero-based index and semantic member id', () => {
    const ctx = testCtx();
    expect(evaluateExpression('ctx.company.platforms[0].name', ctx, ctx.page.fields)).toBe('ManatOS CRM Platform');
    expect(evaluateExpression('ctx.company.platforms.mcrm.name', ctx, ctx.page.fields)).toBe('ManatOS CRM Platform');
  });

  it('evaluates the SysUser Full name expression against camelCase page fields', () => {
    const ctx = {
      page: {
        fields: {
          firstName: {value: 'Yiannis'},
          lastName: {value: 'Manatos'},
        },
      },
    };
    const fullName = calculatedContextField("firstName + ' ' + lastName");
    ctx.page.fields = {...ctx.page.fields, fullName};

    expect(evaluateExpression('fullName', ctx, ctx.page.fields)).toBe('Yiannis Manatos');
  });

  it('parses calculated fields when declared but resolves fresh variable values only when read', () => {
    const ctx = testCtx();
    const fullName = calculatedContextField("firstname + ' ' + lastname");
    ctx.page.fields = {...ctx.page.fields, fullname: fullName};

    expect(fullName.ast.kind).toBe('binary');
    expect(evaluateExpression('fullname', ctx, ctx.page.fields)).toBe('Yiannis Manatos');

    ctx.page.fields.firstname.value = 'John';
    ctx.page.fields.lastname.value = 'Smith';
    expect(evaluateExpression('fullname', ctx, ctx.page.fields)).toBe('John Smith');
  });

  it('memoizes repeated calculated-field reads only inside one evaluation cycle', () => {
    let tick = 0;
    const now = () => new Date(++tick);
    const ctx = {fields: {b: calculatedContextField('GetTime()')}};
    expect(evaluateExpression('b + b', ctx, ctx.fields, {now})).toBe(2);
    expect(tick).toBe(1);
    expect(evaluateExpression('b + b', ctx, ctx.fields, {now})).toBe(4);
    expect(tick).toBe(2);
  });

  it('allows cyclical calculated fields and terminates only the repeated active branch', () => {
    const ctx = {
      fields: {
        a: calculatedContextField('b - 1', {value: 10}),
        b: calculatedContextField('a + 1', {value: 11}),
      },
    };

    expect(evaluateExpression('a', ctx, ctx.fields)).toBe(10);
    expect(evaluateExpression('b', ctx, ctx.fields)).toBe(11);
  });

  it('reports parser and evaluator diagnostics through the optional sink', () => {
    const diagnostics: string[] = [];
    expect(() => compileExpression('2 + )', {
      diagnosticSink: (diagnostic) => diagnostics.push(`${diagnostic.phase}:${diagnostic.message}`),
    })).toThrow(ExpressionParseError);
    expect(diagnostics[0]).toMatch(/^parse:/);

    const ctx = testCtx();
    expect(() => evaluateExpression('missing + 1', ctx, ctx.page.fields, {
      diagnosticSink: (diagnostic) => diagnostics.push(`${diagnostic.phase}:${diagnostic.message}`),
    })).toThrow(ExpressionEvaluationError);
    expect(diagnostics.some((item) => item.startsWith('evaluate:'))).toBe(true);
  });

  it('evaluates a related-row ternary from the supplied current context node', () => {
    // Root deliberately contains a conflicting name: the detached current row
    // must win because lexical resolution always starts at current context.
    const root = { emailVerified: false, page: null };
    const row = { emailVerified: true };
    expect(
      evaluateExpression(
        "emailVerified == true ? 'Provider email verified' : 'Provider email not verified'",
        root,
        row,
      ),
    ).toBe('Provider email verified');
  });

});
