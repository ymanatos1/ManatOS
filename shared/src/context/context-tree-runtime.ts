import { GlobalContextStatistics } from './global-context-statistics.js';
import { MODERN_CTX_ALIASES, resolveContextMember } from './manatos-context.js';

export type ContextPathMember = string | number;
export type ContextPath = 'ctx' | `ctx.${string}` | `ctx[${string}`;

export type ContextTreeMutationKind = 'set-root-members' | 'set' | 'add' | 'delete';

export interface ContextTreeNodeDescription {
  readonly path: string;
  readonly kind: string;
  readonly type: string;
  readonly childCount: number;
  readonly calculated: boolean;
  readonly pointer: boolean;
  readonly badge?: string;
}

export interface ContextTreeStatistics {
  readonly nodes: number;
  readonly bytes: number;
}

export interface ContextTreeMutation {
  readonly revision: number;
  readonly kind: ContextTreeMutationKind;
  /** Canonical path directly changed by this mutation. */
  readonly path: string;
  /** Every root/member path changed by one atomic mutation. */
  readonly paths: readonly string[];
}

export interface ContextTreeSubscriptionInfo {
  readonly id: number;
  readonly label: string;
  readonly path: string | null;
  readonly recursive: boolean;
}

export interface ContextTreeSubscriptionOptions {
  /** Optional CTX path filter. Omitted means every mutation. */
  readonly path?: string;
  /** Include descendant mutations below `path`. Defaults to true. */
  readonly recursive?: boolean;
  /** Human-readable subscriber identity exposed to debugger tooling. */
  readonly label?: string;
  /** Deliver synchronously by default; opt into microtask delivery with true. */
  readonly async?: boolean;
}

export type ContextTreeListener<TRoot extends object> = (
  mutation: ContextTreeMutation,
  runtime: ContextTreeRuntime<TRoot>,
) => void;

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

function pathContains(parent: string, child: string): boolean {
  if (parent === child) return true;
  return child.startsWith(`${parent}.`) || child.startsWith(`${parent}[`);
}

/**
 * Host-neutral mutable CTX tree primitive.
 *
 * UI/API hosts own lifecycle, authorization and presentation. This runtime owns
 * canonical tree addressing, structural mutation and lightweight observation so
 * hosts do not grow independent CTX implementations or polling loops.
 */
export class ContextTreeRuntime<TRoot extends object> {
  private revisionValue = 0;
  /** Per-path semantic descriptions: aliases may share an object but have distinct roles. */
  private readonly semanticKinds = new Map<string, string>();
  private readonly globalStatistics: GlobalContextStatistics;
  /** Optional diagnostic consumer; reporting never interferes with committed mutations. */
  private diagnosticSink: ((message: string) => void) | null = null;
  private subscriptionSequence = 0;
  private readonly subscriptions = new Map<
    number,
    {
      readonly listener: ContextTreeListener<TRoot>;
      readonly info: ContextTreeSubscriptionInfo;
      readonly async: boolean;
      readonly queue: ContextTreeMutation[];
      scheduled: boolean;
      active: boolean;
    }
  >();

  constructor(private readonly rootValue: TRoot) {
    const runtime = (rootValue as { runtime?: unknown }).runtime;
    if (
      runtime &&
      typeof runtime === 'object' &&
      Object.hasOwn(runtime, 'entities') &&
      Object.hasOwn(runtime, 'enums') &&
      Object.hasOwn(runtime, 'user')
    ) {
      Object.defineProperty(rootValue, MODERN_CTX_ALIASES, { value: true });
    }
    this.globalStatistics = new GlobalContextStatistics(rootValue);
  }

  /** Resolve convenience names only on modern runtime roots; legacy CTX is unaffected. */
  private canonicalPath(path: string): string {
    const members = [...tokenizeContextPath(path)];
    if (
      (this.rootValue as Record<symbol, unknown>)[MODERN_CTX_ALIASES] === true &&
      (members[0] === 'entities' || members[0] === 'enums' || members[0] === 'user')
    ) {
      members.unshift('runtime');
    }
    let canonical = 'ctx';
    for (const member of members) canonical = appendContextPathMember(canonical, member);
    return canonical;
  }

  /** Register an optional observer-error reporter; failures never abort CTX mutations. */
  setDiagnosticSink(sink: ((message: string) => void) | null): void {
    this.diagnosticSink = sink;
  }

  /** Return the owned tree root without creating a defensive copy. */
  root(): TRoot {
    return this.rootValue;
  }

  /** Monotonic structural/value revision. It changes once per committed mutation. */
  get revision(): number {
    return this.revisionValue;
  }

  /**
   * Register a producer-owned semantic role for one CTX member path.
   * Role metadata lives outside CTX values: it is invisible to enumeration and
   * works equally for primitives and independently named aliases.
   * Re-registering the same path updates its role without emitting a data mutation.
   */
  registerSemanticKind(path: string, kind: string): void {
    if (!kind.trim()) throw new Error('CTX semantic kind cannot be empty.');
    this.semanticKinds.set(this.canonicalPath(path), kind);
  }

  /** Remove a role when its producer retires that member. */
  unregisterSemanticKind(path: string): void {
    this.semanticKinds.delete(this.canonicalPath(path));
  }

  /** Retire semantic roles for a replaced or deleted subtree. */
  private clearSemanticSubtree(path: string, includeRoot: boolean): void {
    for (const existing of this.semanticKinds.keys()) {
      if (
        (includeRoot && existing === path) ||
        existing.startsWith(path + '.') ||
        existing.startsWith(path + '[')
      )
        this.semanticKinds.delete(existing);
    }
  }

  /** Canonical read-only semantic description; never traverses descendants. */
  describe(path: string): ContextTreeNodeDescription | null {
    const canonicalPath = this.canonicalPath(path);
    const value = this.get(canonicalPath);
    if (canonicalPath !== 'ctx' && value === undefined) {
      // Undefined is a legal CTX member value. Only return null when the
      // member is absent, not when an existing member contains undefined.
      const members = [...tokenizeContextPath(canonicalPath)];
      const key = members.pop();
      let parentPath = 'ctx';
      for (const member of members) parentPath = appendContextPathMember(parentPath, member);
      const parent = this.get(parentPath);
      if (key === undefined || !parent || typeof parent !== 'object' || !Object.hasOwn(parent, key))
        return null;
    }
    const type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
    const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
    const calculated = typeof record?.['expression'] === 'string';
    const pointer = record?.['kind'] === 'pointer' && Object.hasOwn(record, 'value');
    const metadata = record
      ? (record as Record<symbol, { kind?: unknown }>)[Symbol.for('manatos.ctx.node-properties')]
      : undefined;
    // Producer roles take precedence over non-enumerable node metadata and
    // structural fallback. No semantic classification depends on CTX path text.
    const registeredKind = this.semanticKinds.get(canonicalPath);
    let kind = registeredKind ?? 'value';
    if (!registeredKind && typeof metadata?.kind === 'string') kind = metadata.kind;
    else if (!registeredKind && calculated) kind = 'calculated';
    else if (!registeredKind && pointer) kind = 'reference';
    else if (!registeredKind && Array.isArray(value)) kind = 'collection';
    else if (!registeredKind && record) {
      const control = record['control'];
      kind =
        control &&
        typeof control === 'object' &&
        typeof (control as Record<string, unknown>)['host'] === 'string' &&
        typeof (control as Record<string, unknown>)['kind'] === 'string'
          ? (control as Record<string, unknown>)['host'] === 'flow'
            ? (control as Record<string, unknown>)['kind'] === 'step'
              ? 'flow-step'
              : 'flow'
            : 'ui-level'
          : 'container';
    }
    let badge: string | undefined;
    const control = record?.['control'];
    if (control && typeof control === 'object' && !Array.isArray(control)) {
      const details = control as Record<string, unknown>;
      if (typeof details['host'] === 'string' && typeof details['kind'] === 'string') {
        const subject = details['entityKey'] ?? details['name'] ?? details['id'] ?? details['kind'];
        badge =
          details['host'] === 'flow'
            ? [
                details['kind'] === 'step' ? 'STEP' : 'FLOW',
                String(subject).toUpperCase(),
                ...(typeof details['status'] === 'string'
                  ? [String(details['status']).toUpperCase()]
                  : []),
              ].join(' · ')
            : [
                String(details['host']).toUpperCase(),
                String(details['kind']).toUpperCase(),
                String(subject),
              ].join(' · ');
      }
    }
    return Object.freeze({
      path: canonicalPath,
      type,
      kind,
      childCount: Array.isArray(value) ? value.length : record ? Object.keys(record).length : 0,
      calculated,
      pointer,
      ...(badge ? { badge } : {}),
    });
  }

  /** Lightweight logical tree statistics for debugger/diagnostic presentation. */
  statistics(path = 'ctx'): ContextTreeStatistics {
    const canonicalPath = this.canonicalPath(path);
    // The routine debugger root read is constant-time and never traverses CTX.
    if (canonicalPath === 'ctx')
      return Object.freeze({
        nodes: this.globalStatistics.nodes,
        bytes: this.globalStatistics.bytes,
      });

    const value = this.get(canonicalPath);
    const seen = new WeakSet<object>();
    let nodes = 0;
    let bytes = 0;

    const visit = (current: unknown, key: string | null = null) => {
      nodes += 1;
      if (key !== null) bytes += key.length;
      if (current === null) {
        bytes += 4;
        return;
      }
      if (current === undefined) {
        bytes += 9;
        return;
      }
      if (typeof current === 'string') {
        bytes += current.length + 2;
        return;
      }
      if (
        typeof current === 'number' ||
        typeof current === 'boolean' ||
        typeof current === 'bigint'
      ) {
        bytes += String(current).length;
        return;
      }
      if (typeof current !== 'object') {
        bytes += String(current).length;
        return;
      }
      if (seen.has(current)) {
        bytes += 10;
        return;
      }
      seen.add(current);
      if (Array.isArray(current)) {
        for (let index = 0; index < current.length; index += 1)
          visit(current[index], String(index));
      } else {
        for (const [childKey, child] of Object.entries(current as Record<string, unknown>))
          visit(child, childKey);
      }
    };

    visit(value);
    const result = Object.freeze({ nodes, bytes });
    return result;
  }

  /**
   * Observe committed CTX mutations without becoming an owner of CTX state.
   * The optional path filter is canonicalized once and evaluated against every
   * changed path. Listener failures are isolated from mutation semantics.
   */
  subscribe(
    listener: ContextTreeListener<TRoot>,
    options: ContextTreeSubscriptionOptions = {},
  ): () => void {
    const id = ++this.subscriptionSequence;
    const info: ContextTreeSubscriptionInfo = Object.freeze({
      id,
      label: options.label?.trim() || `subscriber-${id}`,
      path: options.path ? this.canonicalPath(options.path) : null,
      recursive: options.recursive !== false,
    });

    const sub = {
      listener,
      info,
      async: options.async === true,
      queue: [] as ContextTreeMutation[],
      scheduled: false,
      active: true,
    };
    this.subscriptions.set(id, sub);
    return () => {
      sub.active = false;
      sub.queue.length = 0;
      this.subscriptions.delete(id);
    };
  }

  /** Debugger-safe metadata describing observers relevant to one CTX path. */
  subscriptionInfo(path?: string): readonly ContextTreeSubscriptionInfo[] {
    const target = path ? this.canonicalPath(path) : null;
    return [...this.subscriptions.values()]
      .map((subscription) => subscription.info)
      .filter((info) => {
        if (!target || !info.path) return true;
        if (info.recursive)
          return pathContains(info.path, target) || pathContains(target, info.path);
        return info.path === target;
      })
      .map((info) => Object.freeze({ ...info }));
  }

  /**
   * Replace several root branches as one semantic commit. Unrelated root
   * branches keep their existing object identity and observers see exactly one
   * revision after all aliases/branches have been updated.
   */
  setRootMembers(values: Partial<TRoot>): void {
    const keys = Object.keys(values);
    if (!keys.length) return;
    // Detach all replaced references before attaching the new projection so
    // aliases within one atomic root update are accounted exactly once.
    for (const key of keys) {
      if (Object.hasOwn(this.rootValue, key))
        this.globalStatistics.detach((this.rootValue as Record<string, unknown>)[key], key);
    }
    Object.assign(this.rootValue, values);
    for (const key of keys)
      this.globalStatistics.attach((this.rootValue as Record<string, unknown>)[key], key);
    const paths = keys.map((key) => appendContextPathMember('ctx', key));
    this.emit('set-root-members', 'ctx', paths);
  }

  /** Resolve a CTX path, including modern root aliases, without modifying the tree. */
  get(path: string): unknown {
    let value: unknown = this.rootValue;
    for (const member of tokenizeContextPath(this.canonicalPath(path))) {
      value = resolveContextMember(value, member);
      if (value === undefined) return undefined;
    }
    return value;
  }

  /** Atomically update an existing object's direct members while keeping its
   * identity stable. This prevents unobserved mutations of sealed CTX branches
   * and applies a single revision for the entire logical update. */
  setMembers(path: string, members: Readonly<Record<string, unknown>>): void {
    const canonicalPath = this.canonicalPath(path);
    const parent = this.get(canonicalPath);
    if (!parent || typeof parent !== 'object' || Array.isArray(parent))
      throw new Error(`CTX path is not an object container: ${canonicalPath}`);
    const keys = Object.keys(members);
    if (!keys.length) return;
    const object = parent as Record<string, unknown>;
    for (const key of keys) {
      if (!Object.hasOwn(object, key))
        throw new Error(
          `CTX member does not exist: ${appendContextPathMember(canonicalPath, key)}`,
        );
    }
    for (const key of keys) {
      this.globalStatistics.detach(object[key], key);
      this.clearSemanticSubtree(appendContextPathMember(canonicalPath, key), false);
    }
    Object.assign(object, members);
    for (const key of keys) this.globalStatistics.attach(object[key], key);
    const paths = keys.map((key) => appendContextPathMember(canonicalPath, key));
    this.emit('set', canonicalPath, paths);
  }

  /** Assign one CTX member; preserve its path role while replacing descendant roles. */
  set(path: string, value: unknown): void {
    const { canonicalPath, key, parent } = this.resolveMutationTarget(path, 'replaced');
    const member = String(key);
    const previous = (parent as Record<string | number, unknown>)[key];
    const hadMember = Object.hasOwn(parent, key);
    if (hadMember) {
      this.globalStatistics.detach(previous, member);
      if (previous !== value) this.clearSemanticSubtree(canonicalPath, false);
    }
    (parent as Record<string | number, unknown>)[key] = value;
    this.globalStatistics.attach(value, member);
    // A first assignment creates a member even when performed through set().
    // Expose its true mutation kind so incremental viewers can insert the row.
    this.emit(hadMember ? 'set' : 'add', canonicalPath, [canonicalPath]);
  }

  /** Insert a new named member into an existing object and return its canonical path. */
  add(parentPath: string, key: string, value: unknown): string {
    const canonicalParentPath = this.canonicalPath(parentPath);
    const parent = this.get(canonicalParentPath);
    if (!parent || typeof parent !== 'object' || Array.isArray(parent)) {
      throw new Error(`CTX parent is not a mutable container: ${canonicalParentPath}`);
    }
    const childPath = appendContextPathMember(canonicalParentPath, key);
    if (Object.prototype.hasOwnProperty.call(parent, key)) {
      throw new Error(`CTX child already exists: ${childPath}`);
    }
    (parent as Record<string, unknown>)[key] = value;
    this.globalStatistics.attach(value, key);
    this.emit('add', childPath, [childPath]);
    return childPath;
  }

  /** Delete a member; array indices retain splice semantics and semantic roles retire. */
  delete(path: string): void {
    const { canonicalPath, key, parent } = this.resolveMutationTarget(path, 'deleted');
    if (Array.isArray(parent) && typeof key === 'number') {
      this.globalStatistics.updateArray(parent, () => {
        parent.splice(key, 1);
      });
    } else {
      if (Object.hasOwn(parent, key))
        this.globalStatistics.detach(
          (parent as Record<string | number, unknown>)[key],
          String(key),
        );
      delete (parent as Record<string | number, unknown>)[key];
    }
    this.clearSemanticSubtree(canonicalPath, true);
    this.emit('delete', canonicalPath, [canonicalPath]);
  }

  /** Publish one committed revision; async delivery is opt-in per subscriber. */
  private emit(kind: ContextTreeMutationKind, path: string, paths: readonly string[]): void {
    const mutation: ContextTreeMutation = Object.freeze({
      revision: ++this.revisionValue,
      kind,
      path,
      paths: Object.freeze([...paths]),
    });

    for (const sub of this.subscriptions.values()) {
      if (!this.matches(sub.info, mutation.paths)) continue;
      if (!sub.async) {
        this.deliver(sub.listener, sub.info, mutation);
        continue;
      }
      sub.queue.push(mutation);
      if (sub.scheduled) continue;
      sub.scheduled = true;
      queueMicrotask(() => {
        let index = 0;
        try {
          // Indexed FIFO also handles notifications appended during delivery.
          while (sub.active && index < sub.queue.length) {
            const mutation = sub.queue[index++];
            if (mutation) this.deliver(sub.listener, sub.info, mutation);
          }
        } finally {
          sub.queue.length = 0;
          sub.scheduled = false;
        }
      });
    }
  }

  /** Contain a subscriber exception so one observer cannot undo a CTX mutation. */
  private deliver(
    listener: ContextTreeListener<TRoot>,
    info: ContextTreeSubscriptionInfo,
    mutation: ContextTreeMutation,
  ): void {
    try {
      listener(mutation, this);
    } catch (error) {
      const message = `CTX observer ${info.label} failed at revision ${mutation.revision}: ${String(error)}`;
      try {
        this.diagnosticSink?.(message);
      } catch {
        // Diagnostic failures are isolated from CTX.
      }
      console.error('[CTX:OBSERVER:ERROR]', {
        subscriber: info.label,
        subscriptionId: info.id,
        revision: mutation.revision,
        kind: mutation.kind,
        paths: mutation.paths,
        error,
      });
    }
  }

  /** Match both ancestor and descendant edits for recursive observers. */
  private matches(info: ContextTreeSubscriptionInfo, paths: readonly string[]): boolean {
    if (!info.path) return true;
    return paths.some((changedPath) =>
      info.recursive
        ? pathContains(info.path!, changedPath) || pathContains(changedPath, info.path!)
        : changedPath === info.path,
    );
  }

  /**
   * Resolve the owning container and final member for a single-member mutation.
   * Both set() and delete() use the same alias, path and parent validation,
   * while retaining their distinct root-operation errors and mutation semantics.
   */
  private resolveMutationTarget(path: string, rootOperation: 'replaced' | 'deleted') {
    const canonicalPath = this.canonicalPath(path);
    const members = [...tokenizeContextPath(canonicalPath)];
    const key = members.pop();
    if (key === undefined) throw new Error(`The CTX root cannot be ${rootOperation}.`);
    const parent = this.resolveMutableContainer(members, canonicalPath);
    return { canonicalPath, key, parent };
  }

  /** Traverse intermediate members, rejecting a missing/non-object parent. */
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
