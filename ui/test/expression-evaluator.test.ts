import {describe, expect, it} from 'vitest';
import {
  ExpressionEvaluationError,
  ExpressionParseError,
  calculatedContextField,
  compileExpression,
  evaluateExpression,
  type ExpressionNode,
} from '@manatos/shared';


const TEST_CALLER = {
  source: 'test' as const,
  purpose: 'expression evaluator unit test',
};

function evaluateTest(
  expression: string,
  ctxRoot: unknown,
  currentCtxNode: unknown,
  options: Parameters<typeof evaluateExpression>[4] = {},
): unknown {
  return evaluateExpression(expression, ctxRoot, currentCtxNode, TEST_CALLER, options);
}

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
  it('inherits a one-level dataList symbol from the nearest parent page scope', () => {
    const entryFields = { parentId: { value: 'p2' } };
    const ctx = {
      page: {
        dataList: [
          { id: 'p1', parentId: null, name: 'Root' },
          { id: 'p2', parentId: 'p1', name: 'Parent' },
        ],
        page: {
          fields: entryFields,
          dataCurrent: { id: 'p3', parentId: 'p2', name: 'Child' },
        },
      },
    };

    expect(evaluateTest("dataList['p2'].parentId", ctx, entryFields)).toBe('p1');
    expect(evaluateTest('dataCurrent.parentId', ctx, entryFields)).toBe('p2');
  });

  it('traverses a keyed parent hierarchy generically and returns the requested root field', () => {
    const fields = { parentId: { value: 'p3' }, name: { value: 'Child' } };
    const ctx = {
      page: {
        dataList: [
          { id: 'p1', parentId: null, name: 'Root' },
          { id: 'p2', parentId: 'p1', name: 'Branch' },
          { id: 'p3', parentId: 'p2', name: 'Parent' },
        ],
        page: { fields },
      },
    };

    expect(evaluateTest("TraverseCtx(parentId, dataList, 'parentId', 'name')", ctx, fields)).toBe('Root');
    expect(evaluateTest("parentId == null ? name : TraverseCtx(parentId, dataList, 'parentId', 'name')", ctx, fields)).toBe('Root');
  });

  it('terminates malformed hierarchy cycles instead of looping forever', () => {
    const fields = { parentId: { value: 'p1' } };
    const ctx = {
      page: {
        dataList: [
          { id: 'p1', parentId: 'p2', name: 'One' },
          { id: 'p2', parentId: 'p1', name: 'Two' },
        ],
        page: { fields },
      },
    };

    expect(() => evaluateTest("TraverseCtx(parentId, dataList, 'parentId', 'name')", ctx, fields))
      .toThrow(/parent cycle/i);
  });


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
    expect(evaluateTest('2 + 3 * 4', ctx, ctx.page.fields)).toBe(14);
    expect(evaluateTest('10 - 5 - 2', ctx, ctx.page.fields)).toBe(3);
    expect(evaluateTest('2 ** 3 ** 2', ctx, ctx.page.fields)).toBe(512);
    expect(evaluateTest('(2 + 3) * 4', ctx, ctx.page.fields)).toBe(20);
    expect(evaluateTest('-2 ** 2', ctx, ctx.page.fields)).toBe(-4);
  });

  it('concatenates strings/numbers with + but keeps other arithmetic strict', () => {
    const ctx = testCtx();
    expect(evaluateTest("'Value=' + 12", ctx, ctx.page.fields)).toBe('Value=12');
    expect(evaluateTest("12 + 'px'", ctx, ctx.page.fields)).toBe('12px');
    expect(() => evaluateTest("'10' - 2", ctx, ctx.page.fields)).toThrow(ExpressionEvaluationError);
  });



  it('supports JS-like loose/strict equality and scalar relational comparisons', () => {
    const ctx = testCtx();
    expect(evaluateTest("10 == '10'", ctx, ctx.page.fields)).toBe(true);
    expect(evaluateTest("10 === '10'", ctx, ctx.page.fields)).toBe(false);
    expect(evaluateTest("10 != '10'", ctx, ctx.page.fields)).toBe(false);
    expect(evaluateTest("10 !== '10'", ctx, ctx.page.fields)).toBe(true);
    expect(evaluateTest('10 < 20', ctx, ctx.page.fields)).toBe(true);
    expect(evaluateTest("'b' > 'a'", ctx, ctx.page.fields)).toBe(true);
  });

  it('allows any supported scalar to concatenate with a string', () => {
    const ctx = testCtx();
    expect(evaluateTest("'Enabled=' + true", ctx, ctx.page.fields)).toBe('Enabled=true');
    expect(evaluateTest("null + ':value'", ctx, ctx.page.fields)).toBe('null:value');
  });


  it('prepares runtime Date values for relational comparison and string concatenation', () => {
    const ctx = {
      fields: {
        earlier: {value: new Date('2026-01-01T00:00:00Z')},
        later: {value: new Date('2026-01-02T00:00:00Z')},
      },
    };
    expect(evaluateTest('earlier < later', ctx, ctx.fields)).toBe(true);
    expect(evaluateTest("'At ' + earlier", ctx, ctx.fields)).toMatch(/^At /);
  });

  it('supports boolean equality and right-associative ternary conditionals', () => {
    const ctx = {
      fields: {
        emailVerified: {value: true},
        enabled: {value: false},
      },
    };

    expect(evaluateTest("emailVerified ? 'Verified' : 'Not verified'", ctx, ctx.fields)).toBe('Verified');
    expect(evaluateTest("enabled ? 'Enabled' : 'Disabled'", ctx, ctx.fields)).toBe('Disabled');
    expect(evaluateTest("emailVerified != false ? 'Verified' : 'Not verified'", ctx, ctx.fields)).toBe('Verified');
    expect(evaluateTest("false ? missingVariable : 'safe'", ctx, ctx.fields)).toBe('safe');

    const compiled = compileExpression("emailVerified ? 'Verified' : 'Not verified'");
    expect(compiled.ast).toMatchObject({
      kind: 'conditional',
      condition: {kind: 'variable', path: 'emailVerified'},
      whenTrue: {kind: 'literal', value: 'Verified'},
      whenFalse: {kind: 'literal', value: 'Not verified'},
    });
  });

  it('supports lazy nullish coalescing with ??', () => {
    const ctx = {
      fields: {
        nullable: {value: null},
        present: {value: 'kept'},
      },
    };

    expect(evaluateTest("nullable ?? 'fallback'", ctx, ctx.fields)).toBe('fallback');
    expect(evaluateTest("present ?? missingVariable", ctx, ctx.fields)).toBe('kept');

    const compiled = compileExpression("nullable ?? 'fallback'");
    expect(compiled.ast).toMatchObject({kind: 'binary', operator: '??'});
  });

  it('supports lazy JS/TS-like scalar logical operators for metadata decisions', () => {
    const ctx = {
      user: { fields: { role: { value: 'Admin' } } },
      page: {
        mode: 'edit',
        fields: {
          id: { value: 'other-user' },
          emailVerified: { value: false },
        },
      },
    };

    expect(evaluateTest(
      "mode !== 'create' && user.fields.role.value === 'Admin'",
      ctx,
      ctx.page.fields,
    )).toBe(true);

    expect(evaluateTest('false && missingVariable', ctx, ctx.page.fields)).toBe(false);
    expect(evaluateTest('true || missingVariable', ctx, ctx.page.fields)).toBe(true);
    expect(evaluateTest('!emailVerified', ctx, ctx.page.fields)).toBe(true);
  });

  it('parses function calls against the hard-coded registry and evaluates nested arguments', () => {
    const ctx = testCtx();
    expect(evaluateTest('SqRoot(9)', ctx, ctx.page.fields)).toBe(3);
    expect(evaluateTest("StrFormat('{0} {1}', firstname, lastname)", ctx, ctx.page.fields)).toBe('Yiannis Manatos');
    expect(evaluateTest('GetTime()', ctx, ctx.page.fields, {now: () => new Date(123456)})).toBe(123456);
    expect(evaluateTest("FirstCtx(options, 'id')", { options: [{ id: 'first' }, { id: 'second' }] }, { options: [{ id: 'first' }, { id: 'second' }] })).toBe('first');
    expect(evaluateTest("FirstCtx(options, 'value')", { options: [{ value: 'mcrm' }] }, { options: [{ value: 'mcrm' }] })).toBe('mcrm');
    expect(evaluateTest("FirstCtx(options, 'id')", { options: [] }, { options: [] })).toBeNull();
    expect(evaluateTest('CurrentDay()', ctx, ctx.page.fields, {now: () => new Date(2026, 7, 31, 15, 45)})).toBe('2026-08-31T00:00');
    expect(() => compileExpression('MissingFunction(1)')).toThrow(ExpressionParseError);
    expect(() => compileExpression('SqRoot()')).toThrow(ExpressionParseError);
    expect(() => compileExpression("SqRoot('x')")).toThrow(ExpressionParseError);
  });

  it('keeps parsing context-agnostic and reports missing paths only during evaluation', () => {
    const compiled = compileExpression('future.page.value + 1');
    const ctx = testCtx();
    expect(compiled.ast.kind).toBe('binary');
    expect(() => evaluateTest(compiled.source, ctx, ctx.page.fields)).toThrow(/variable not found/i);
  });

  it('resolves lexical variables from the current ctx node and explicit ctx paths from root', () => {
    const ctx = testCtx();
    expect(evaluateTest("firstname + ' ' + lastname", ctx, ctx.page.fields)).toBe('Yiannis Manatos');
    expect(evaluateTest('ctx.page.fields.amount.value * 2', ctx, ctx.page.fields)).toBe(24);
  });

  it('resolves keyed arrays both by zero-based index and semantic member id', () => {
    const ctx = testCtx();
    expect(evaluateTest('ctx.company.platforms[0].name', ctx, ctx.page.fields)).toBe('ManatOS CRM Platform');
    expect(evaluateTest('ctx.company.platforms.mcrm.name', ctx, ctx.page.fields)).toBe('ManatOS CRM Platform');
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

    expect(evaluateTest('fullName', ctx, ctx.page.fields)).toBe('Yiannis Manatos');
  });

  it('parses calculated fields when declared but resolves fresh variable values only when read', () => {
    const ctx = testCtx();
    const fullName = calculatedContextField("firstname + ' ' + lastname");
    ctx.page.fields = {...ctx.page.fields, fullname: fullName};

    expect(fullName.ast.kind).toBe('binary');
    expect(evaluateTest('fullname', ctx, ctx.page.fields)).toBe('Yiannis Manatos');

    ctx.page.fields.firstname.value = 'John';
    ctx.page.fields.lastname.value = 'Smith';
    expect(evaluateTest('fullname', ctx, ctx.page.fields)).toBe('John Smith');
  });

  it('memoizes repeated calculated-field reads only inside one evaluation cycle', () => {
    let tick = 0;
    const now = () => new Date(++tick);
    const ctx = {fields: {b: calculatedContextField('GetTime()')}};
    expect(evaluateTest('b + b', ctx, ctx.fields, {now})).toBe(2);
    expect(tick).toBe(1);
    expect(evaluateTest('b + b', ctx, ctx.fields, {now})).toBe(4);
    expect(tick).toBe(2);
  });

  it('allows cyclical calculated fields and terminates only the repeated active branch', () => {
    const ctx = {
      fields: {
        a: calculatedContextField('b - 1', {value: 10}),
        b: calculatedContextField('a + 1', {value: 11}),
      },
    };

    expect(evaluateTest('a', ctx, ctx.fields)).toBe(10);
    expect(evaluateTest('b', ctx, ctx.fields)).toBe(11);
  });

  it('reports timestamped parser/evaluator diagnostics with caller and actual context path', () => {
    const diagnostics: any[] = [];
    expect(() => compileExpression('2 + )', {
      diagnosticSink: (diagnostic) => diagnostics.push(diagnostic),
    })).toThrow(ExpressionParseError);
    expect(diagnostics[0]?.phase).toBe('parse');
    expect(Number.isNaN(Date.parse(diagnostics[0]?.timestamp))).toBe(false);

    const ctx = testCtx();
    const caller = {
      source: 'renderer' as const,
      sourcePath: 'metadata-driven-entry',
      targetPath: 'ctx.page.fields.fullName',
      purpose: 'diagnostic provenance test',
    };
    expect(() => evaluateExpression(
      'missing + 1',
      ctx,
      ctx.page.fields,
      caller,
      {diagnosticSink: (diagnostic) => diagnostics.push(diagnostic)},
    )).toThrow(ExpressionEvaluationError);

    const diagnostic = diagnostics.find((item) => item.phase === 'evaluate');
    expect(diagnostic?.caller).toEqual(caller);
    expect(diagnostic?.currentContextPath).toBe('ctx.page.fields');
    expect(diagnostic?.targetPath).toBe('ctx.page.fields.fullName');
    expect(diagnostic?.correlationId).toMatch(/^eval-/);
    expect(Number.isNaN(Date.parse(diagnostic?.timestamp))).toBe(false);
  });

  it('preserves nested calculated-field provenance in evaluation diagnostics', () => {
    const diagnostics: any[] = [];
    const ctx = {
      fields: {
        a: calculatedContextField('b + 1'),
        b: calculatedContextField('missing + 1'),
      },
    };

    expect(() => evaluateExpression(
      'a',
      ctx,
      ctx.fields,
      {
        source: 'renderer',
        targetPath: 'ctx.fields.a',
        purpose: 'nested provenance test',
      },
      {diagnosticSink: (diagnostic) => diagnostics.push(diagnostic)},
    )).toThrow(ExpressionEvaluationError);

    const diagnostic = diagnostics.find((item) => item.phase === 'evaluate');
    expect(diagnostic?.evaluationChain).toEqual(['ctx.fields.a', 'ctx.fields.b']);
  });

  it('evaluates a related-row ternary from the supplied current context node', () => {
    // Root deliberately contains a conflicting name: the detached current row
    // must win because lexical resolution always starts at current context.
    const root = { emailVerified: false, page: null };
    const row = { emailVerified: true };
    expect(
      evaluateTest(
        "emailVerified ? 'Provider email verified' : 'Provider email not verified'",
        root,
        row,
      ),
    ).toBe('Provider email verified');
  });

});
