/**
 * Two inexpensive indicators for debugger display; never used for CTX correctness.
 * A mutation adds/subtracts its affected subtree's approximate logical size.
 * Unpublished in-place edits can make estimates drift; statistics never obstruct CTX.
 */
export class GlobalContextStatistics {
  private nodeTotal = 0;
  private byteTotal = 0;

  constructor(root: object) {
    this.attach(root, null);
  }

  get nodes(): number {
    return this.nodeTotal;
  }
  get bytes(): number {
    return this.byteTotal;
  }

  attach(value: unknown, member: string | null): void {
    const size = this.measure(value, member);
    this.nodeTotal += size.nodes;
    this.byteTotal += size.bytes;
  }

  detach(value: unknown, member: string | null): void {
    const size = this.measure(value, member);
    this.nodeTotal = Math.max(0, this.nodeTotal - size.nodes);
    this.byteTotal = Math.max(0, this.byteTotal - size.bytes);
  }

  /** Array deletion renumbers members; handle its affected array only. */
  updateArray(array: unknown[], mutate: () => void): void {
    for (let index = 0; index < array.length; index++) this.detach(array[index], String(index));
    mutate();
    for (let index = 0; index < array.length; index++) this.attach(array[index], String(index));
  }

  private measure(value: unknown, member: string | null): { nodes: number; bytes: number } {
    const seen = new WeakSet<object>();
    let nodes = 0;
    let bytes = 0;
    const visit = (current: unknown, key: string | null): void => {
      nodes++;
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
      if (typeof current !== 'object') {
        bytes += String(current).length;
        return;
      }
      if (seen.has(current)) {
        bytes += 8;
        return;
      }
      seen.add(current);
      if (Array.isArray(current)) {
        for (let i = 0; i < current.length; i++) visit(current[i], String(i));
      } else {
        for (const [name, child] of Object.entries(current as Record<string, unknown>))
          visit(child, name);
      }
    };
    visit(value, member);
    return { nodes, bytes };
  }
}
