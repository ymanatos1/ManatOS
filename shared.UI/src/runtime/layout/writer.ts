/**
 * UIS LAYOUT WRITER — restricted authoring/publishing of component #layout.
 *
 * Draft: add/mount write to the unpublished Surface-level tree.
 * Reconcile: existing nodes/instances are reused; new nodes publish via CTX.
 * Replace: compose a fresh subtree; embedded-runtime disposes retired owners.
 * Guards: path membership, safe keys, no unauthorized published mutation.
 *
 * See: runtime/component.ts for the component-facing writer contract;
 * runtime/surface/embedded-runtime.ts for mounting and owned rollback.
 */
import type {
  UiEmbeddedLayoutWriter,
  UiSemanticContentDefinition,
  UiSemanticLayoutNode,
} from '../component.js';
import {
  copyUiSemanticLayoutNodeMetadata,
  UI_LAYOUT_NODE_PROPERTIES,
  validateUiSemanticLayoutMember,
} from './node.js';
import { appendUiSemanticLayoutPath } from './path.js';

/**
 * Surface-supplied operations.
 *
 * The generic writer owns node positions and draft/reconciliation
 * rules. The surface owns node rendering metadata, CTX publication,
 * and embedded component instantiation.
 */
export interface UiSemanticLayoutWriterHost {
  createNode(kind: string, key: string, elementId: string, fieldId?: string): UiSemanticLayoutNode;

  mountComponent(definition: UiSemanticContentDefinition, path: string): UiSemanticLayoutNode;
  /** Reconciliation must reuse, never reinstantiate, an existing child. */
  reuseComponent(definition: UiSemanticContentDefinition, path: string): UiSemanticLayoutNode;

  addNode(parentPath: string, key: string, node: UiSemanticLayoutNode): void;
  getNode(path: string): unknown;
  setNode(path: string, node: UiSemanticLayoutNode): void;
}

export interface UiSemanticLayoutWriterSession {
  readonly writer: UiEmbeddedLayoutWriter;
  readonly finishInitial: () => void;
}

/**
 * Scoped semantic layout writer.
 *
 * During initial construction, nodes belong to an unpublished draft.
 * During reconciliation, additions and replacements are published
 * through the host's CTX operations.
 */
export function createUiSemanticLayoutWriter(
  rootPath: string,
  rootNode: UiSemanticLayoutNode,
  host: UiSemanticLayoutWriterHost,
  reconcile = false,
): UiSemanticLayoutWriterSession {
  const positions = new WeakMap<UiSemanticLayoutNode, readonly string[]>();
  positions.set(rootNode, []);

  let initial = true;
  let draft: WeakSet<UiSemanticLayoutNode> | null = null;

  const append = (members: readonly string[]): string =>
    appendUiSemanticLayoutPath(rootPath, members);

  const checkWritable = (parent: UiSemanticLayoutNode): readonly string[] => {
    const position = positions.get(parent);

    if (!position || (!initial && !reconcile && !draft?.has(parent))) {
      throw new Error('Embedded layout writer cannot modify an unowned or published node.');
    }

    return position;
  };

  const writer: UiEmbeddedLayoutWriter = {
    add: (parent, key, kind, elementId, fieldId) => {
      const position = checkWritable(parent);
      validateUiSemanticLayoutMember(key);

      if (Object.hasOwn(parent, key)) {
        if (!reconcile) throw new Error(`Duplicate embedded layout node: ${key}`);

        const child = parent[key];
        const properties = (child as Record<symbol, unknown>)[UI_LAYOUT_NODE_PROPERTIES] as
          { kind?: string; field?: string } | undefined;

        if (
          !child ||
          typeof child !== 'object' ||
          properties?.kind !== kind ||
          (fieldId !== undefined && properties.field !== fieldId)
        ) {
          throw new Error(`Conflicting embedded layout node: ${key}`);
        }

        positions.set(child, [...position, key]);
        return child;
      }

      const child = host.createNode(kind, key, elementId, fieldId);

      // Initial construction operates on the unpublished draft.
      // Reconciliation must publish through CTX.
      if (reconcile && !draft?.has(parent)) {
        host.addNode(append(position), key, child);
      } else {
        parent[key] = child;
      }

      positions.set(child, [...position, key]);
      draft?.add(child);
      return child;
    },

    mount: (parent, definition, members) => {
      const position = positions.get(parent);

      if (!position || (!initial && !reconcile && !draft?.has(parent))) {
        throw new Error('Embedded layout writer cannot modify an unowned or published node.');
      }

      if (
        members.length !== position.length ||
        members.some((value, index) => value !== position[index])
      ) {
        throw new Error('Nested embedded layout path does not identify the supplied parent.');
      }

      validateUiSemanticLayoutMember(definition.id);

      const path = append([...position, definition.id]);
      if (Object.hasOwn(parent, definition.id)) {
        if (!reconcile) throw new Error(`Duplicate nested embedded layout: ${definition.id}`);
        // Existing children stay mounted. Creating another instance here would
        // duplicate subscriptions and orphan component-owned state.
        const reused = host.reuseComponent(definition, path);
        if (parent[definition.id] !== reused)
          throw new Error(`Conflicting reconciled component: ${definition.id}`);
        positions.set(reused, [...position, definition.id]);
        return reused;
      }
      const nested = host.mountComponent(definition, path);

      if (reconcile && !draft?.has(parent)) {
        host.addNode(append(position), definition.id, nested);
      } else {
        parent[definition.id] = nested;
      }

      positions.set(nested, [...position, definition.id]);
      draft?.add(nested);

      return nested;
    },

    replaceChildren: (members, populate) => {
      if (initial) {
        throw new Error('Embedded layout cannot publish before the popup level is attached.');
      }

      const path = append(members);
      const oldNode = host.getNode(path);

      // A replacement must target a node belonging to this writer.
      if (!positions.has(oldNode as UiSemanticLayoutNode)) {
        throw new Error(`Embedded layout node is not owned by this writer: ${path}`);
      }

      if (!oldNode || typeof oldNode !== 'object' || Array.isArray(oldNode)) {
        throw new Error(`Missing embedded layout node: ${path}`);
      }

      const next: UiSemanticLayoutNode = {};
      copyUiSemanticLayoutNodeMetadata(oldNode, next);

      if (draft) {
        throw new Error('Nested embedded layout replacements are not supported.');
      }

      draft = new WeakSet<UiSemanticLayoutNode>([next]);
      positions.set(next, [...members]);

      try {
        populate(next, writer);
      } finally {
        draft = null;
      }

      host.setNode(path, next);
    },
  };

  return {
    writer,
    finishInitial: () => {
      initial = false;
    },
  };
}
