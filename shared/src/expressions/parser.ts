import { ExpressionParseError, emitExpressionDiagnostic } from './diagnostics.js';
import { expressionFunctions } from './functions/registry.js';
import { tokenizeExpression, type ExpressionToken } from './tokenizer.js';
import type {
  CompiledExpression,
  ExpressionBinaryOperator,
  ExpressionDiagnosticSink,
  ExpressionFunctionRegistry,
  ExpressionCapability,
  ExpressionNode,
  ExpressionPathMember,
} from './types.js';

const PRECEDENCE: Readonly<Record<ExpressionBinaryOperator, number>> = {
  // Increasing numbers bind more tightly. The ordering mirrors JavaScript for
  // the supported operator subset so metadata formulas remain unsurprising.
  '||': 2,
  '??': 3,
  IN: 8,
  '&&': 4,
  '|': 5,
  '^': 6,
  '&': 7,
  '==': 8,
  '!=': 8,
  '===': 8,
  '!==': 8,
  '<': 9,
  '<=': 9,
  '>': 9,
  '>=': 9,
  '<<': 10,
  '>>': 10,
  '>>>': 10,
  '+': 11,
  '-': 11,
  '*': 12,
  '/': 12,
  '%': 12,
  '**': 14,
};

class Parser {
  private index = 0;

  constructor(
    private readonly source: string,
    private readonly tokens: readonly ExpressionToken[],
    private readonly functions: ExpressionFunctionRegistry,
  ) {}

  parse(): ExpressionNode {
    const node = this.parseConditional();
    this.expect('eof');
    return node;
  }

  private current(): ExpressionToken {
    return this.tokens[this.index] ?? this.tokens[this.tokens.length - 1]!;
  }

  private advance(): ExpressionToken {
    const token = this.current();
    if (token.kind !== 'eof') this.index += 1;
    return token;
  }

  private match(text: string): boolean {
    if (this.current().text !== text) return false;
    this.advance();
    return true;
  }

  private expect(kind: ExpressionToken['kind'], text?: string): ExpressionToken {
    const token = this.current();
    if (token.kind !== kind || (text !== undefined && token.text !== text)) {
      const expected = text ?? kind;
      throw new ExpressionParseError(
        `Expected ${expected}; found ${token.text || token.kind}`,
        token.position,
        this.source,
      );
    }
    return this.advance();
  }

  private parseConditional(): ExpressionNode {
    const condition = this.parseExpression(0);
    if (!this.match('?')) return condition;

    const whenTrue = this.parseConditional();
    this.expect('punctuation', ':');
    const whenFalse = this.parseConditional();
    return { kind: 'conditional', condition, whenTrue, whenFalse };
  }

  private parseExpression(minPrecedence: number): ExpressionNode {
    let left = this.parsePrefix();

    while (this.current().kind === 'operator') {
      const operator = this.current().text as ExpressionBinaryOperator;
      const precedence = PRECEDENCE[operator];
      if (precedence === undefined || precedence < minPrecedence) break;

      this.advance();
      const rightAssociative = operator === '**';
      const right = this.parseExpression(rightAssociative ? precedence : precedence + 1);
      left = { kind: 'binary', operator, left, right };
    }

    return left;
  }

  private parsePrefix(): ExpressionNode {
    const token = this.current();

    if (
      token.kind === 'operator' &&
      (token.text === '+' || token.text === '-' || token.text === '!' || token.text === '~')
    ) {
      this.advance();
      // Exponentiation binds more tightly than unary operators, matching the
      // JavaScript precedence relationship for the supported prefix subset.
      return {
        kind: 'unary',
        operator: token.text,
        operand:
          token.text === '!' || token.text === '~'
            ? this.parseExpression(13)
            : this.parseExpression(13),
      };
    }

    if (this.match('(')) {
      const expression = this.parseConditional();
      this.expect('punctuation', ')');
      return { kind: 'group', expression };
    }

    if (this.match('[')) {
      const items: ExpressionNode[] = [];
      if (!this.match(']')) {
        do {
          items.push(this.parseConditional());
        } while (this.match(','));
        this.expect('punctuation', ']');
      }
      return { kind: 'array', items };
    }

    if (token.kind === 'number') {
      this.advance();
      return { kind: 'literal', value: token.value as number };
    }

    if (token.kind === 'string') {
      this.advance();
      return { kind: 'literal', value: token.value as string };
    }

    if (token.kind === 'identifier') {
      return this.parseIdentifier();
    }

    throw new ExpressionParseError(
      `Unexpected token ${token.text || token.kind}`,
      token.position,
      this.source,
    );
  }

  private parseIdentifier(): ExpressionNode {
    const first = this.expect('identifier');
    const identifier = first.text;

    if (this.match('(')) {
      return this.parseFunctionCall(identifier, first.position);
    }

    if (identifier === 'true') return { kind: 'literal', value: true };
    if (identifier === 'false') return { kind: 'literal', value: false };
    if (identifier === 'null') return { kind: 'literal', value: null };

    const members: ExpressionPathMember[] = [identifier];
    let path = identifier;

    for (;;) {
      if (this.match('.')) {
        const member = this.expect('identifier');
        members.push(member.text);
        path += `.${member.text}`;
        continue;
      }

      if (this.match('[')) {
        const member = this.current();
        if (member.kind === 'number') {
          this.advance();
          if (!Number.isInteger(member.value) || (member.value as number) < 0) {
            throw new ExpressionParseError(
              'Array index must be a non-negative integer',
              member.position,
              this.source,
            );
          }
          members.push(member.value as number);
          path += `[${member.text}]`;
        } else if (member.kind === 'string') {
          this.advance();
          members.push(member.value as string);
          path += `[${JSON.stringify(member.value)}]`;
        } else {
          throw new ExpressionParseError(
            'Expected numeric or quoted collection key inside []',
            member.position,
            this.source,
          );
        }
        this.expect('punctuation', ']');
        continue;
      }
      break;
    }

    return {
      kind: 'variable',
      path,
      members,
      absolute: members[0] === 'ctx',
    };
  }

  private parseFunctionCall(functionName: string, position: number): ExpressionNode {
    const definition = this.functions[functionName];
    if (!definition) {
      throw new ExpressionParseError(
        `Unknown expression function ${functionName}`,
        position,
        this.source,
      );
    }

    const args: ExpressionNode[] = [];
    if (!this.match(')')) {
      do {
        args.push(this.parseConditional());
      } while (this.match(','));
      this.expect('punctuation', ')');
    }

    const { minArguments, maxArguments, text, argumentTypes, variadicType } = definition.signature;
    if (args.length < minArguments || (maxArguments !== null && args.length > maxArguments)) {
      throw new ExpressionParseError(
        `${functionName} expects ${text}; received ${args.length} argument(s)`,
        position,
        this.source,
      );
    }

    // Variable/subexpression result types are intentionally unknown until
    // evaluation. Literal arguments, however, can be signature-checked now.
    args.forEach((argument, index) => {
      if (argument.kind !== 'literal') return;
      const expected = argumentTypes?.[index] ?? variadicType;
      if (!expected || expected === 'any') return;
      const actual = argument.value === null ? 'null' : typeof argument.value;
      const valid =
        expected === 'scalar'
          ? argument.value === null || ['string', 'number', 'boolean'].includes(actual)
          : actual === expected;
      if (!valid) {
        throw new ExpressionParseError(
          `${functionName} argument ${index + 1} must be ${expected}; received ${actual}`,
          position,
          this.source,
        );
      }
    });

    return { kind: 'function', functionName, arguments: args, capability: definition.capability };
  }
}

export function expressionCapabilities(ast: ExpressionNode): readonly ExpressionCapability[] {
  const capabilities = new Set<ExpressionCapability>();
  const visit = (node: ExpressionNode): void => {
    if (node.kind === 'function') {
      capabilities.add(node.capability);
      node.arguments.forEach(visit);
      return;
    }
    if (node.kind === 'group') {
      visit(node.expression);
      return;
    }
    if (node.kind === 'unary') {
      visit(node.operand);
      return;
    }
    if (node.kind === 'binary') {
      visit(node.left);
      visit(node.right);
      return;
    }
    if (node.kind === 'conditional') {
      visit(node.condition);
      visit(node.whenTrue);
      visit(node.whenFalse);
    }
  };
  visit(ast);
  return [...capabilities];
}

export function compileExpression(
  source: string,
  options: {
    functions?: ExpressionFunctionRegistry;
    diagnosticSink?: ExpressionDiagnosticSink;
  } = {},
): CompiledExpression {
  try {
    const tokens = tokenizeExpression(source);
    const parser = new Parser(source, tokens, options.functions ?? expressionFunctions);
    const ast = parser.parse();
    return { source, ast, requiredCapabilities: expressionCapabilities(ast) };
  } catch (error) {
    if (error instanceof ExpressionParseError) {
      emitExpressionDiagnostic(options.diagnosticSink, {
        phase: 'parse',
        message: error.message,
        expression: source,
        position: error.position,
      });
    }
    throw error;
  }
}
