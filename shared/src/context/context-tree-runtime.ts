import { resolveContextMember } from './manatos-context.js';

export type ContextPathMember = string | number;
export type ContextPath = 'ctx' | `ctx.${string}` | `ctx[${string}`;

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/** Append one member using canonical CTX path notation. */
export function appendContextPathMember(path: string, member: ContextPathMember): string {
  if (typeof member === 'number') return `${path}[${member}]`;
  return IDENTIFIER.test(member) ? `${path}.${member}` : `${path}[${JSON.stringify(member)}]`;
}

/** Tokenize canonical ctx/foo/bracket notation without host-specific assumptions. */
export function tokenizeContextPath(path: string): readonly ContextPathMember[] {
  const normalized = String(path || '')
    .replace(/^\$\.?/, '')
    .replace(/^ctx\.?/, '')
    .replace(/\.\[/g, '[');
  if (!normalized) return [];

  const members: ContextPathMember[] = [];
  let index = 0;
  while (index < normalized.length) {
    if (normalized[index] === '.') {
      index += 1;
      continue;
    }
    if (normalized[index] === '[') {
      const end = normalized.indexOf(']', index);
      if (end < 0) throw new Error(`Invalid CTX bracket path: ${path}`);
      const raw = normalized.slice(index + 1, end).trim();
      if (/^\d+$/.test(raw)) members.push(Number(raw));
      else if (raw.startsWith('"') && raw.endsWith('"')) members.push(JSON.parse(raw));
      else if (raw.startsWith("'") && raw.endsWith("'")) {
        members.push(raw.slice(1, -1).replace(/\\'/g, "'"));
      } else throw new Error(`Invalid CTX bracket member: ${raw}`);
      index = end + 1;
      continue;
    }

    const match = /^[A-Za-z_$][A-Za-z0-9_$]*/.exec(normalized.slice(index));
    if (!match) throw new Error(`Invalid CTX identifier in path: ${path}`);
    members.push(match[0]);
    index += match[0].length;
  }
  return members;
}

/**
 * Host-neutral mutable CTX tree primitive.
 *
 * UI/API hosts own lifecycle, events, authorization and presentation. This
 * runtime owns only canonical tree addressing and structural mutation so those
 * hosts do not grow independent CTX implementations.
 */
export class ContextTreeRuntime<TRoot extends object> {
  constructor(private readonly rootValue: TRoot) {}

  root(): TRoot {
    return this.rootValue;
  }

  get(path: string): unknown {
    let value: unknown = this.rootValue;
    for (const member of tokenizeContextPath(path)) {
      value = resolveContextMember(value, member);
      if (value === undefined) return undefined;
    }
    return value;
  }

  set(path: string, value: unknown): void {
    const members = [...tokenizeContextPath(path)];
    const key = members.pop();
    if (key === undefined) throw new Error('The CTX root cannot be replaced.');
    const parent = this.resolveMutableContainer(members, path);
    if (Array.isArray(parent) && typeof key === 'number') parent[key] = value;
    else (parent as Record<string | number, unknown>)[key] = value;
  }

  add(parentPath: string, key: string, value: unknown): string {
    const parent = this.get(parentPath);
    if (!parent || typeof parent !== 'object' || Array.isArray(parent)) {
      throw new Error(`CTX parent is not a mutable container: ${parentPath}`);
    }
    if (Object.prototype.hasOwnProperty.call(parent, key)) {
      throw new Error(`CTX child already exists: ${appendContextPathMember(parentPath, key)}`);
    }
    (parent as Record<string, unknown>)[key] = value;
    return appendContextPathMember(parentPath, key);
  }

  delete(path: string): void {
    const members = [...tokenizeContextPath(path)];
    const key = members.pop();
    if (key === undefined) throw new Error('The CTX root cannot be deleted.');
    const parent = this.resolveMutableContainer(members, path);
    if (Array.isArray(parent) && typeof key === 'number') parent.splice(key, 1);
    else delete (parent as Record<string | number, unknown>)[key];
  }

  private resolveMutableContainer(members: readonly ContextPathMember[], originalPath: string) {
    let value: unknown = this.rootValue;
    for (const member of members) {
      value = resolveContextMember(value, member);
      if (!value || typeof value !== 'object') {
        throw new Error(`CTX path not found: ${originalPath}`);
      }
    }
    return value as Record<string | number, unknown> | unknown[];
  }
}
