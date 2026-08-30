import {ExpressionParseError} from './diagnostics.js';

type TokenKind =
  | 'number'
  | 'string'
  | 'identifier'
  | 'operator'
  | 'punctuation'
  | 'eof';

export interface ExpressionToken {
  kind: TokenKind;
  text: string;
  position: number;
  value?: string | number;
}

const identifierStart = /[A-Za-z_$]/;
const identifierPart = /[A-Za-z0-9_$]/;

export function tokenizeExpression(source: string): readonly ExpressionToken[] {
  const tokens: ExpressionToken[] = [];
  let index = 0;

  const fail = (message: string, position = index): never => {
    throw new ExpressionParseError(message, position, source);
  };

  while (index < source.length) {
    const char = source[index];
    if (char === undefined) break;

    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    if (/\d/.test(char) || (char === '.' && /\d/.test(source[index + 1] ?? ''))) {
      const start = index;
      let seenDot = false;
      while (index < source.length) {
        const current = source[index] ?? '';
        if (current === '.') {
          if (seenDot) break;
          seenDot = true;
          index += 1;
          continue;
        }
        if (!/\d/.test(current)) break;
        index += 1;
      }
      const text = source.slice(start, index);
      const value = Number(text);
      if (!Number.isFinite(value)) fail(`Invalid numeric literal ${text}`, start);
      tokens.push({kind: 'number', text, position: start, value});
      continue;
    }

    if (char === '\'' || char === '"') {
      const start = index;
      const quote = char;
      index += 1;
      let value = '';
      let closed = false;
      while (index < source.length) {
        const current = source[index] ?? '';
        if (current === quote) {
          index += 1;
          closed = true;
          break;
        }
        if (current === '\\') {
          const escapedCandidate = source[index + 1];
          if (escapedCandidate === undefined) fail('Unterminated string escape', index);
          const escaped = escapedCandidate as string;
          const map: Record<string, string> = {
            n: '\n', r: '\r', t: '\t', '\\': '\\', '\'': '\'', '"': '"',
          };
          value += map[escaped] ?? escaped;
          index += 2;
          continue;
        }
        value += current;
        index += 1;
      }
      if (!closed) fail('Unterminated string literal', start);
      tokens.push({kind: 'string', text: source.slice(start, index), position: start, value});
      continue;
    }

    if (identifierStart.test(char)) {
      const start = index;
      index += 1;
      while (index < source.length && identifierPart.test(source[index] ?? '')) index += 1;
      const text = source.slice(start, index);
      tokens.push({kind: 'identifier', text, position: start, value: text});
      continue;
    }

    if ((char === '&' && source[index + 1] === '&') ||
        (char === '|' && source[index + 1] === '|')) {
      tokens.push({kind: 'operator', text: `${char}${char}`, position: index});
      index += 2;
      continue;
    }

    if ((char === '=' || char === '!') && source[index + 1] === '=') {
      const strict = source[index + 2] === '=';
      tokens.push({kind: 'operator', text: strict ? `${char}==` : `${char}=`, position: index});
      index += strict ? 3 : 2;
      continue;
    }

    if ((char === '<' || char === '>') && source[index + 1] === '=') {
      tokens.push({kind: 'operator', text: `${char}=`, position: index});
      index += 2;
      continue;
    }

    if (char === '<' || char === '>') {
      tokens.push({kind: 'operator', text: char, position: index});
      index += 1;
      continue;
    }

    if (char === '?' && source[index + 1] === '?') {
      tokens.push({kind: 'operator', text: '??', position: index});
      index += 2;
      continue;
    }

    if (char === '*' && source[index + 1] === '*') {
      tokens.push({kind: 'operator', text: '**', position: index});
      index += 2;
      continue;
    }

    if ('+-*/%!'.includes(char)) {
      tokens.push({kind: 'operator', text: char, position: index});
      index += 1;
      continue;
    }

    if ('().,[]?:'.includes(char)) {
      tokens.push({kind: 'punctuation', text: char, position: index});
      index += 1;
      continue;
    }

    fail(`Unexpected character ${JSON.stringify(char)}`);
  }

  tokens.push({kind: 'eof', text: '', position: source.length});
  return tokens;
}
